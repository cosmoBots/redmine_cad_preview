# frozen_string_literal: true

require 'fileutils'

module RedmineCadPreview
  # Reads the preview image that Autodesk Inventor saves in its files (.ipt,
  # .iam, .ipn, .idw, .ide). Inventor files are OLE compound files. The image
  # is a PNG in the thumbnail property of the "Inventor Summary Information"
  # property set. The model itself cannot be read without Inventor.
  #
  # The image is kept next to the converted DWG files:
  #
  #   <digest>_<filesize>.png
  module InventorThumbnail
    # Stream name of the "Inventor Summary Information" property set
    PROPERTY_SET = "\u0005Zrxrt4arFafyu34gYa3l3ohgHg"
    PNG_START = "\x89PNG\r\n\x1A\n".b
    PNG_END = "IEND\xAE\x42\x60\x82".b

    def self.cache_path(attachment)
      File.join(DwgConverter.storage_path, "#{attachment.digest}_#{attachment.filesize}.png")
    end

    # Returns the path of the preview image of the attachment, or nil if the
    # file has no preview image
    def self.png_for(attachment)
      path = cache_path(attachment)
      return path if File.file?(path)

      png = extract(attachment.diskfile)
      return nil unless png

      FileUtils.mkdir_p(File.dirname(path))
      temp = "#{path}.#{Process.pid}.tmp"
      File.binwrite(temp, png)
      File.rename(temp, path)
      path
    rescue StandardError => e
      Rails.logger.error("Could not read the preview image of #{attachment.disk_filename}: #{e.message}")
      nil
    end

    # Returns the PNG data of the preview image of the file, or nil
    def self.extract(path)
      data = CompoundFile.open(path) {|file| file.stream(PROPERTY_SET)}
      start = data&.index(PNG_START)
      return nil unless start

      finish = data.index(PNG_END, start)
      finish ? data[start, finish + PNG_END.size - start] : nil
    end

    def self.delete(attachment)
      FileUtils.rm_f(cache_path(attachment))
    end

    # Minimal reader for OLE compound files ([MS-CFB]) that reads the streams
    # in the root storage
    class CompoundFile
      SIGNATURE = ['D0CF11E0A1B11AE1'].pack('H*')
      END_OF_CHAIN = 0xFFFFFFFE
      HEADER_SIZE = 512
      DIRECTORY_ENTRY_SIZE = 128
      STREAM = 2
      ROOT = 5

      class InvalidFile < StandardError; end

      def self.open(path)
        File.open(path, 'rb') {|io| yield new(io)}
      rescue InvalidFile
        nil
      end

      def initialize(io)
        @io = io
        header = read_at(0, HEADER_SIZE)
        raise InvalidFile unless header&.start_with?(SIGNATURE)

        @sector_size = 1 << header[30, 2].unpack1('v')
        @mini_sector_size = 1 << header[32, 2].unpack1('v')
        raise InvalidFile unless [512, 4096].include?(@sector_size) && @mini_sector_size == 64

        fat_count, @directory_start = header[44, 8].unpack('V2')
        @mini_cutoff, mini_fat_start, _, difat_start, difat_count = header[56, 20].unpack('V5')
        @fat = read_fat(header[76, 436].unpack('V*'), difat_start, difat_count, fat_count)
        @mini_fat = read_chain(mini_fat_start).unpack('V*')
      end

      # Returns the content of the stream in the root storage, or nil
      def stream(name)
        entries = directory
        root = entries.find {|entry| entry[:type] == ROOT}
        entry = entries.find {|e| e[:type] == STREAM && e[:name] == name}
        return nil unless root && entry

        if entry[:size] < @mini_cutoff
          read_mini_stream(read_chain(root[:start]), entry[:start], entry[:size])
        else
          read_chain(entry[:start])[0, entry[:size]]
        end
      end

      private

      def read_at(offset, length)
        @io.seek(offset)
        @io.read(length)
      end

      def read_sector(sector)
        read_at(HEADER_SIZE + (sector * @sector_size), @sector_size) || raise(InvalidFile)
      end

      def read_fat(difat, difat_start, difat_count, fat_count)
        sector = difat_start
        difat_count.times do
          break if sector >= END_OF_CHAIN

          entries = read_sector(sector).unpack('V*')
          sector = entries.pop
          difat.concat(entries)
        end
        difat.first(fat_count).map {|s| read_sector(s)}.join.unpack('V*')
      end

      # Reads a chain of sectors. A chain has at most fat.size sectors, so
      # looping chains of broken files end, too.
      def read_chain(start, fat = @fat)
        data = +''.b
        sector = start
        fat.size.times do
          break if sector >= fat.size

          data << (block_given? ? yield(sector) : read_sector(sector))
          sector = fat[sector]
        end
        data
      end

      def read_mini_stream(mini_stream, start, size)
        read_chain(start, @mini_fat) do |sector|
          mini_stream[sector * @mini_sector_size, @mini_sector_size] || raise(InvalidFile)
        end[0, size]
      end

      def directory
        read_chain(@directory_start).b.scan(/.{#{DIRECTORY_ENTRY_SIZE}}/mo).map do |entry|
          name_size = entry[64, 2].unpack1('v')
          {
            :name => entry[0, [name_size - 2, 0].max].force_encoding('UTF-16LE').encode('UTF-8', :invalid => :replace, :undef => :replace),
            :type => entry.getbyte(66),
            :start => entry[116, 4].unpack1('V'),
            :size => entry[120, 4].unpack1('V')
          }
        end
      end
    end
  end
end
