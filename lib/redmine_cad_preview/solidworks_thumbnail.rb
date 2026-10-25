# frozen_string_literal: true

require 'zlib'

module RedmineCadPreview
  # Reads the preview image that SolidWorks saves in its files (.sldprt,
  # .sldasm, .slddrw). The model itself cannot be read without SolidWorks.
  #
  # Files up to SolidWorks 2014 are OLE compound files with the image in the
  # PreviewPNG stream. Later files consist of sections, each with
  #
  # * the marker 14 00 06 00 08 00
  # * two values of 4 bytes
  # * the compressed size, the uncompressed size and the size of the name
  #   (4 bytes each)
  # * the name, with the two halves of each byte swapped
  # * the data, compressed with deflate
  module SolidworksThumbnail
    MARKER = "\x14\x00\x06\x00\x08\x00".b
    HEADER_SIZE = 26
    MAX_NAME_SIZE = 256
    PREVIEW = 'PreviewPNG'
    PNG_SIGNATURE = "\x89PNG\r\n\x1A\n".b
    # Maximum size of the image, against files that inflate to huge data
    MAX_IMAGE_SIZE = 10.megabytes

    class TooLarge < StandardError; end

    # Returns the PNG data of the preview image of the file, or nil
    def self.extract(path)
      if CompoundFile.signature?(path)
        png(CompoundFile.open(path) {|file| file.stream(PREVIEW)})
      else
        from_sections(File.binread(path))
      end
    end

    # Returns the first PreviewPNG section that contains a PNG image. Some
    # files also contain small PreviewPNG sections that cannot be inflated.
    def self.from_sections(data)
      position = 0
      while (position = data.index(MARKER, position))
        compressed_size, _size, name_size = data[position + 14, 12]&.unpack('V3')
        break unless name_size

        if name_size <= MAX_NAME_SIZE && name(data[position + HEADER_SIZE, name_size]) == PREVIEW
          image = png(inflate(data[position + HEADER_SIZE + name_size, compressed_size]))
          return image if image
        end
        position += MARKER.bytesize
      end
      nil
    end
    private_class_method :from_sections

    def self.name(data)
      data.to_s.bytes.map {|byte| ((byte << 4) | (byte >> 4)) & 0xFF}.pack('C*')
    end
    private_class_method :name

    def self.inflate(data)
      return nil if data.blank?

      inflater = Zlib::Inflate.new(-Zlib::MAX_WBITS)
      image = +''.b
      inflater.inflate(data) do |chunk|
        image << chunk
        raise TooLarge if image.bytesize > MAX_IMAGE_SIZE
      end
      image
    rescue Zlib::Error, TooLarge
      nil
    ensure
      inflater&.close
    end
    private_class_method :inflate

    def self.png(data)
      data if data&.start_with?(PNG_SIGNATURE)
    end
    private_class_method :png
  end
end
