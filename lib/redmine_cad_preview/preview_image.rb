# frozen_string_literal: true

require 'fileutils'
require 'zip'

module RedmineCadPreview
  # Images of CAD attachments for the thumbnails of Redmine and the preview of
  # Inventor, Solid Edge and SolidWorks files. The image is either saved in
  # the file itself (Inventor, Solid Edge, SolidWorks, FreeCAD, 3MF, DXF,
  # DWG), or a snapshot of the viewer that the browser sends when the
  # preview is opened for the first time.
  #
  # The images are kept next to the converted DWG files:
  #
  #   <digest>_<filesize>.image         the image saved in the file
  #   <digest>_<filesize>.noimage       the file contains no image
  #   <digest>_<filesize>.snapshot.png  the snapshot of the viewer
  module PreviewImage
    # Formats that can contain an image
    EMBEDDED_FORMATS = %w[inventor solid_edge solidworks freecad 3mf dxf dwg].freeze
    # Maximum size of a snapshot sent by the browser
    MAX_SNAPSHOT_SIZE = 2.megabytes
    # Maximum size of an image saved in a 3MF file
    MAX_EMBEDDED_SIZE = 10.megabytes
    PNG_SIGNATURE = "\x89PNG\r\n\x1A\n".b

    class << self
      def embedded_path(attachment)
        File.join(DwgConverter.storage_path, "#{key(attachment)}.image")
      end

      def snapshot_path(attachment)
        File.join(DwgConverter.storage_path, "#{key(attachment)}.snapshot.png")
      end

      # Returns the path of the image of the attachment, or nil. Does not read
      # the attachment, so that it can be called for every thumbnail.
      def path(attachment)
        [embedded_path(attachment), snapshot_path(attachment)].find {|p| File.file?(p)}
      end

      # Reads the image saved in the attachment, once. Returns its path, or nil
      # if the file contains no image.
      def extract(attachment)
        path = embedded_path(attachment)
        return path if File.file?(path)

        format = RedmineCadPreview.format_of(attachment.filename)
        return nil unless EMBEDDED_FORMATS.include?(format) && !File.exist?(missing_path(attachment))

        data = read_image(format, attachment)
        return nil if data == :later

        if data.present?
          write(path, data)
        else
          write(missing_path(attachment), '')
          nil
        end
      rescue StandardError => e
        Rails.logger.error("Could not read the image of #{attachment.disk_filename}: #{e.message}")
        nil
      end

      # Stores a snapshot of the viewer unless the attachment has an image.
      # Returns false if the data is not a PNG image.
      def store_snapshot(attachment, data)
        return false unless data.bytesize <= MAX_SNAPSHOT_SIZE && data.b.start_with?(PNG_SIGNATURE)

        write(snapshot_path(attachment), data) unless path(attachment)
        true
      end

      def delete(attachment)
        FileUtils.rm_f([embedded_path(attachment), missing_path(attachment), snapshot_path(attachment)])
      end

      private

      def key(attachment)
        "#{attachment.digest}_#{attachment.filesize}"
      end

      def missing_path(attachment)
        File.join(DwgConverter.storage_path, "#{key(attachment)}.noimage")
      end

      # Returns the image data, nil if the file contains no image, or :later
      # if the image can be read after the conversion of a DWG file
      def read_image(format, attachment)
        case format
        when 'inventor', 'solid_edge' then OleThumbnail.extract(attachment.diskfile)
        when 'solidworks' then SolidworksThumbnail.extract(attachment.diskfile)
        when '3mf' then read_3mf_thumbnail(attachment.diskfile)
        when 'freecad' then read_zip_entry(attachment.diskfile, 'thumbnails/Thumbnail.png')
        when 'dxf' then DxfThumbnail.extract(attachment.diskfile)
        when 'dwg' then read_dwg_thumbnail(attachment)
        end
      end

      # LibreDWG copies the image of a DWG file to the converted DXF file
      def read_dwg_thumbnail(attachment)
        case DwgConverter.state(attachment)
        when :converted then DxfThumbnail.extract(DwgConverter.cache_path(attachment))
        when :failed then nil
        else :later
        end
      end

      # 3MF files are ZIP archives. The thumbnail is referenced in _rels/.rels
      # and usually is Metadata/thumbnail.png.
      def read_3mf_thumbnail(diskfile)
        Zip::File.open(diskfile) do |zip|
          rels = zip.find_entry('_rels/.rels')
          xml = rels.get_input_stream.read if rels && rels.size <= 1.megabyte
          relationship = xml.to_s.scan(/<Relationship\b[^>]*>/).find {|r| r.include?('/metadata/thumbnail"')}
          target = relationship&.slice(%r{Target="/?([^"]+)"}, 1)
          entry = target && zip.find_entry(target)
          entry ||= zip.entries.find {|e| e.name.match?(%r{\AMetadata/thumbnail\.(png|jpe?g)\z}i)}
          entry.get_input_stream.read if entry && entry.size <= MAX_EMBEDDED_SIZE
        end
      end

      # FreeCAD documents are ZIP archives with the thumbnail in
      # thumbnails/Thumbnail.png
      def read_zip_entry(diskfile, name)
        Zip::File.open(diskfile) do |zip|
          entry = zip.find_entry(name)
          entry.get_input_stream.read if entry && entry.size <= MAX_EMBEDDED_SIZE
        end
      end

      def write(path, data)
        FileUtils.mkdir_p(File.dirname(path))
        temporary = "#{path}.#{Process.pid}.tmp"
        File.binwrite(temporary, data)
        File.rename(temporary, path)
        path
      end
    end
  end
end
