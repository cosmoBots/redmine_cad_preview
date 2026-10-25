# frozen_string_literal: true

# Builds the test files with images in test/fixtures/files:
#
# * part.ipt, assembly.iam: minimal OLE compound files with the "Inventor
#   Summary Information" stream that contains a PNG image, like the files
#   saved by Inventor
# * thumbnail.3mf: a 3MF file with a thumbnail
# * thumbnail.dxf: a DXF file with a bitmap in the THUMBNAILIMAGE section,
#   like the files saved by AutoCAD
# * thumbnail.dwg: a DXF file with the preview of a DWG file in the
#   THUMBNAILIMAGE section, like the files converted by LibreDWG. The fake
#   dwg2dxf of the tests copies it.
#
#   bundle exec ruby test/support/build_fixtures.rb

require 'fileutils'
require 'zip'

SECTOR_SIZE = 512
FREE = 0xFFFFFFFF
END_OF_CHAIN = 0xFFFFFFFE
FAT_SECTOR = 0xFFFFFFFD
STREAM_NAME = "\u0005Zrxrt4arFafyu34gYa3l3ohgHg"
FIXTURES = File.expand_path('../fixtures/files', __dir__)

def pad(data, size)
  data + ("\0".b * ((-data.bytesize) % size))
end

def directory_entry(name, type, child, start, size)
  utf16 = "#{name}\0".encode('UTF-16LE').b
  [pad(utf16, 64), utf16.bytesize, type, 1, FREE, FREE, child,
   "\0".b * 16, 0, 0, 0, start, size].pack('a64vCCVVVa16VQ<Q<VQ<')
end

# Pads a table of sector numbers (FAT, mini FAT) to a sector with free entries
def table(entries)
  (entries + ([FREE] * ((-entries.size) % (SECTOR_SIZE / 4)))).pack('V*')
end

def chain(first, count)
  (0...count).map {|i| i == count - 1 ? END_OF_CHAIN : first + i + 1}
end

# The stream is stored in the mini stream if it is smaller than 4096 bytes
def compound_file(stream)
  mini = stream.bytesize < 4096
  data = mini ? pad(stream, 64) : pad(stream, SECTOR_SIZE)
  data_sectors = pad(data, SECTOR_SIZE).bytesize / SECTOR_SIZE
  fat = [FAT_SECTOR, END_OF_CHAIN, mini ? END_OF_CHAIN : FREE] + chain(3, data_sectors)
  mini_fat = mini ? chain(0, data.bytesize / 64) : []

  root = directory_entry('Root Entry', 5, 1, mini ? 3 : END_OF_CHAIN, mini ? data.bytesize : 0)
  entry = directory_entry(STREAM_NAME, 2, FREE, mini ? 0 : 3, stream.bytesize)
  header = ['D0CF11E0A1B11AE1'].pack('H*') + ("\0".b * 16) +
           [0x3E, 3, 0xFFFE, 9, 6].pack('v5') + ("\0".b * 6) +
           [0, 1, 1, 0, 4096, mini ? 2 : END_OF_CHAIN, mini ? 1 : 0, END_OF_CHAIN, 0, 0].pack('V10') +
           ([FREE] * 108).pack('V*')

  header +
    table(fat) +
    pad(root + entry, SECTOR_SIZE) +
    table(mini_fat.empty? ? [FREE] : mini_fat) +
    pad(data, SECTOR_SIZE)
end

png = File.binread(ARGV[0] || File.join(FIXTURES, 'thumbnail.png'))
property_header = "\xFE\xFF\0\0".b
File.binwrite(File.join(FIXTURES, 'part.ipt'), compound_file(property_header + ("\0".b * 5000) + png))
File.binwrite(File.join(FIXTURES, 'assembly.iam'), compound_file(property_header + png))

model = <<~XML
  <?xml version="1.0" encoding="UTF-8"?>
  <model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
    <resources>
      <object id="1" type="model">
        <mesh>
          <vertices>
            <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
          </vertices>
          <triangles>
            <triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/>
          </triangles>
        </mesh>
      </object>
    </resources>
    <build><item objectid="1"/></build>
  </model>
XML
rels = <<~XML
  <?xml version="1.0" encoding="UTF-8"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
    <Relationship Target="/Metadata/preview.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
  </Relationships>
XML
path = File.join(FIXTURES, 'thumbnail.3mf')
FileUtils.rm_f(path)
Zip::File.open(path, create: true) do |zip|
  zip.get_output_stream('_rels/.rels') {|f| f.write(rels)}
  zip.get_output_stream('3D/3dmodel.model') {|f| f.write(model)}
  zip.get_output_stream('Metadata/preview.png') {|f| f.write(png)}
end

# 2 x 2 pixels, 24 bits, rows padded to 4 bytes
pixels = (("\x0F\x48\xD9".b * 2) + "\0\0".b) * 2
dib = [40, 2, 2, 1, 24, 0, pixels.bytesize, 2835, 2835, 0, 0].pack('Vl<l<vvVVl<l<VV') + pixels

def dxf_with_thumbnail(data)
  hex = data.unpack1('H*').upcase.scan(/.{1,254}/)
  "  0\nSECTION\n  2\nENTITIES\n  0\nLINE\n  8\n0\n 10\n0\n 20\n0\n 11\n10\n 21\n10\n  0\nENDSEC\n" \
    "  0\nSECTION\n  2\nTHUMBNAILIMAGE\n 90\n#{data.bytesize}\n#{hex.map {|line| "310\n#{line}\n"}.join}" \
    "  0\nENDSEC\n  0\nEOF\n"
end

File.write(File.join(FIXTURES, 'thumbnail.dxf'), dxf_with_thumbnail(dib))

# Preview of a DWG file: size, number of images, then type, position in the
# DWG file and size of each image (a header and a bitmap), then the images
position = 1000
preview_header = "\0".b * 4
preview = [0, 2].pack('VC') +
          [1, position, preview_header.bytesize, 2, position + preview_header.bytesize, dib.bytesize].pack('CVVCVV') +
          preview_header + dib
File.write(File.join(FIXTURES, 'thumbnail.dwg'), dxf_with_thumbnail(preview))
