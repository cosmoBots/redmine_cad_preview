# frozen_string_literal: true

module RedmineCadPreview
  # Reads the preview image that Autodesk Inventor saves in its files (.ipt,
  # .iam, .ipn, .idw, .ide). Inventor files are OLE compound files. The image
  # is a PNG in the thumbnail property of the "Inventor Summary Information"
  # property set. The model itself cannot be read without Inventor.
  module InventorThumbnail
    # Stream name of the "Inventor Summary Information" property set
    PROPERTY_SET = "\u0005Zrxrt4arFafyu34gYa3l3ohgHg"
    PNG_START = "\x89PNG\r\n\x1A\n".b
    PNG_END = "IEND\xAE\x42\x60\x82".b

    # Returns the PNG data of the preview image of the file, or nil
    def self.extract(path)
      data = CompoundFile.open(path) {|file| file.stream(PROPERTY_SET)}
      start = data&.index(PNG_START)
      return nil unless start

      finish = data.index(PNG_END, start)
      finish ? data[start, finish + PNG_END.size - start] : nil
    end
  end
end
