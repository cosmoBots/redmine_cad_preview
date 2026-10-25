# frozen_string_literal: true

module RedmineCadPreview
  # Reads the preview image in the THUMBNAILIMAGE section of a DXF file. The
  # image is saved by AutoCAD, and LibreDWG copies it from DWG files to the
  # converted DXF files.
  module DxfThumbnail
    PNG_SIGNATURE = "\x89PNG\r\n\x1A\n".b
    BITMAP_INFO_HEADER_SIZE = 40
    # Types of the images in the preview of a DWG file
    BMP = 2
    PNG = 6

    # Returns the image (BMP or PNG) of the DXF file, or nil
    def self.extract(path)
      data = read_section(path)
      return nil if data.empty?

      if data.start_with?(PNG_SIGNATURE)
        data
      elsif data.unpack1('V') == BITMAP_INFO_HEADER_SIZE
        bitmap_file(data)
      else
        from_dwg_preview(data)
      end
    end

    # Returns the binary data of the THUMBNAILIMAGE section (group codes 310)
    def self.read_section(path)
      hex = +''
      inside = false
      File.open(path, 'rb') do |file|
        file.each_line.each_slice(2) do |code, value|
          code = code.strip
          value = value.to_s.strip
          if inside
            break if code == '0'

            hex << value if code == '310'
          elsif code == '2' && value == 'THUMBNAILIMAGE'
            inside = true
          end
        end
      end
      [hex].pack('H*')
    end
    private_class_method :read_section

    # The preview of a DWG file, as copied by LibreDWG: the number of images
    # at byte 4, then the type, the position in the DWG file and the size of
    # each image, then the images
    def self.from_dwg_preview(data)
      count = data.getbyte(4).to_i
      entries = Array.new(count) {|i| data[5 + (i * 9), 9]&.unpack('CVV')}.compact
      return nil if entries.empty? || entries.size < count

      base = entries.pluck(1).min - (5 + (9 * count))
      type, position, size = entries.find {|entry| [BMP, PNG].include?(entry[0])}
      image = type && data[position - base, size]
      return nil if image.blank?

      # The last bytes of the image can be missing in the converted file
      type == PNG ? image : bitmap_file(image.ljust(size, "\0".b))
    end
    private_class_method :from_dwg_preview

    # Adds the file header to a bitmap without it (DIB)
    def self.bitmap_file(dib)
      header_size = dib.unpack1('V')
      bits = dib[14, 2].unpack1('v')
      used_colors = dib[32, 4].unpack1('V')
      colors =
        if used_colors.positive?
          used_colors
        elsif bits <= 8
          1 << bits
        else
          0
        end
      ['BM', 14 + dib.bytesize, 0, 14 + header_size + (colors * 4)].pack('a2VVV') + dib
    end
    private_class_method :bitmap_file
  end
end
