# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewSolidworksThumbnailTest < ActiveSupport::TestCase
  include RedmineCadPreview::TestHelper

  def test_extract_from_sections
    assert_equal thumbnail, RedmineCadPreview::SolidworksThumbnail.extract(File.join(FIXTURES_DIR, 'part.sldprt'))
  end

  def test_extract_from_compound_file
    assert_equal thumbnail, RedmineCadPreview::SolidworksThumbnail.extract(File.join(FIXTURES_DIR, 'part_2014.sldprt'))
  end

  def test_extract_should_return_nil_for_other_files
    assert_nil RedmineCadPreview::SolidworksThumbnail.extract(File.join(FIXTURES_DIR, 'notes.txt'))
    assert_nil RedmineCadPreview::SolidworksThumbnail.extract(File.join(FIXTURES_DIR, 'part.ipt'))
  end

  def test_extract_should_skip_sections_that_cannot_be_inflated
    data = File.binread(File.join(FIXTURES_DIR, 'part.sldprt'))
    broken = section('PreviewPNG', 'not deflate data', :compress => false)

    with_file(broken + data) do |path|
      assert_equal thumbnail, RedmineCadPreview::SolidworksThumbnail.extract(path)
    end
  end

  def test_extract_should_not_inflate_huge_data
    huge = section('PreviewPNG', "\x89PNG\r\n\x1A\n".b + ("\0".b * 11.megabytes))

    with_file(huge) do |path|
      assert_nil RedmineCadPreview::SolidworksThumbnail.extract(path)
    end
  end

  private

  def thumbnail
    File.binread(File.join(FIXTURES_DIR, 'thumbnail.png'))
  end

  def section(name, data, compress: true)
    body = compress ? Zlib::Deflate.new(Zlib::DEFAULT_COMPRESSION, -Zlib::MAX_WBITS).deflate(data, Zlib::FINISH) : data
    swapped = name.bytes.map {|byte| ((byte << 4) | (byte >> 4)) & 0xFF}.pack('C*')
    "\x14\x00\x06\x00\x08\x00".b + [0, 0, body.bytesize, data.bytesize, swapped.bytesize].pack('V5') + swapped + body
  end

  def with_file(data)
    Tempfile.create(['part', '.sldprt']) do |file|
      file.binmode
      file.write(data)
      file.close
      yield file.path
    end
  end
end
