# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewOleThumbnailTest < ActiveSupport::TestCase
  include RedmineCadPreview::TestHelper

  def test_extract_from_stream_in_regular_sectors
    assert_equal thumbnail, RedmineCadPreview::OleThumbnail.extract(File.join(FIXTURES_DIR, 'part.ipt'))
  end

  def test_extract_from_stream_in_mini_stream
    assert_equal thumbnail, RedmineCadPreview::OleThumbnail.extract(File.join(FIXTURES_DIR, 'assembly.iam'))
  end

  def test_extract_from_solid_edge_file
    image = RedmineCadPreview::OleThumbnail.extract(File.join(FIXTURES_DIR, 'part.par'))
    assert_equal 'BM', image[0, 2]
    assert_equal 2, image[18, 4].unpack1('l<') # width
  end

  def test_extract_should_return_nil_for_other_files
    assert_nil RedmineCadPreview::OleThumbnail.extract(File.join(FIXTURES_DIR, 'notes.txt'))
  end

  def test_extract_should_return_nil_for_truncated_files
    Tempfile.create(['truncated', '.ipt']) do |file|
      file.binmode
      file.write(File.binread(File.join(FIXTURES_DIR, 'part.ipt'), 2048))
      file.close
      assert_nil RedmineCadPreview::OleThumbnail.extract(file.path)
    end
  end

  private

  def thumbnail
    File.binread(File.join(FIXTURES_DIR, 'thumbnail.png'))
  end
end
