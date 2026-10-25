# frozen_string_literal: true

module RedmineCadPreview
  module Bitmap
    FILE_HEADER_SIZE = 14

    # Returns a BMP file for a bitmap without file header (DIB), as saved in
    # DXF files and in the thumbnail property of OLE compound files
    def self.from_dib(dib)
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
      ['BM', FILE_HEADER_SIZE + dib.bytesize, 0, FILE_HEADER_SIZE + header_size + (colors * 4)].pack('a2VVV') + dib
    end
  end
end
