# frozen_string_literal: true

module RedmineCadPreview
  # Reads the preview image that Autodesk Inventor (.ipt, .iam, .ipn, .idw,
  # .ide) and Solid Edge (.par, .asm, .psm, .pwd, .dft) save in their files.
  # The files are OLE compound files with the image in the thumbnail property
  # of a property set ([MS-OLEPS]): "Inventor Summary Information" for
  # Inventor, "SummaryInformation" for Solid Edge. The models themselves
  # cannot be read without these programs.
  module OleThumbnail
    INVENTOR_SUMMARY_INFORMATION = "\u0005Zrxrt4arFafyu34gYa3l3ohgHg"
    SUMMARY_INFORMATION = "\u0005SummaryInformation"
    PROPERTY_SETS = [INVENTOR_SUMMARY_INFORMATION, SUMMARY_INFORMATION].freeze
    THUMBNAIL = 17 # PIDSI_THUMBNAIL
    VT_CF = 71     # clipboard data
    CF_DIB = 8
    PNG_START = "\x89PNG\r\n\x1A\n".b
    PNG_END = "IEND\xAE\x42\x60\x82".b

    # Returns the image (PNG or BMP) of the file, or nil
    def self.extract(path)
      CompoundFile.open(path) do |file|
        PROPERTY_SETS.each do |name|
          image = thumbnail(file.stream(name))
          return image if image
        end
        nil
      end
    end

    # Returns the image in the thumbnail property of the property set. A
    # property set starts with a header (28 bytes), the FMTID and the offset
    # of the first section. The section has its size, the number of
    # properties, and the ID and offset of each property.
    def self.thumbnail(data)
      return nil unless data && data.bytesize >= 48

      section = data[44, 4].unpack1('V')
      count = data[section + 4, 4]&.unpack1('V').to_i
      count.times do |i|
        id, offset = data[section + 8 + (i * 8), 8]&.unpack('VV')
        next unless id == THUMBNAIL

        # Clipboard data: type, size (with the format), format tag, format
        type, size, _tag, format = data[section + offset, 16]&.unpack('VVl<V')
        return nil unless type == VT_CF && size.to_i > 8

        return image(data[section + offset + 16, size - 8], format)
      end
      nil
    end
    private_class_method :thumbnail

    # Inventor saves a PNG image although the format is a Windows metafile,
    # Solid Edge a bitmap without file header (DIB)
    def self.image(data, format)
      return nil if data.blank?

      start = data.index(PNG_START)
      if start
        finish = data.index(PNG_END, start)
        finish ? data[start, finish + PNG_END.size - start] : nil
      elsif format == CF_DIB
        Bitmap.from_dib(data)
      end
    end
    private_class_method :image
  end
end
