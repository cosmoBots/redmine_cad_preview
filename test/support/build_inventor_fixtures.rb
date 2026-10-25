# frozen_string_literal: true

# Builds the Inventor test files in test/fixtures/files. They are minimal OLE
# compound files with the "Inventor Summary Information" stream that contains
# a PNG image, like the files saved by Inventor.
#
#   ruby test/support/build_inventor_fixtures.rb

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
