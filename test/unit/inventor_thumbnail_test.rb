# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewInventorThumbnailTest < ActiveSupport::TestCase
  include RedmineCadPreview::TestHelper

  fixtures :projects, :users, :email_addresses, :issues, :trackers, :projects_trackers,
           :issue_statuses, :enumerations

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
  end

  def test_extract_from_stream_in_regular_sectors
    assert_equal thumbnail, RedmineCadPreview::InventorThumbnail.extract(File.join(FIXTURES_DIR, 'part.ipt'))
  end

  def test_extract_from_stream_in_mini_stream
    assert_equal thumbnail, RedmineCadPreview::InventorThumbnail.extract(File.join(FIXTURES_DIR, 'assembly.iam'))
  end

  def test_extract_should_return_nil_for_other_files
    assert_nil RedmineCadPreview::InventorThumbnail.extract(File.join(FIXTURES_DIR, 'notes.txt'))
  end

  def test_extract_should_return_nil_for_truncated_files
    Tempfile.create(['truncated', '.ipt']) do |file|
      file.binmode
      file.write(File.binread(File.join(FIXTURES_DIR, 'part.ipt'), 2048))
      file.close
      assert_nil RedmineCadPreview::InventorThumbnail.png_for(attachment_stub(file.path))
    end
  end

  def test_png_for_should_cache_the_image
    attachment = create_cad_attachment('part.ipt')

    path = RedmineCadPreview::InventorThumbnail.png_for(attachment)
    assert_equal RedmineCadPreview::InventorThumbnail.cache_path(attachment), path
    assert_equal thumbnail, File.binread(path)

    RedmineCadPreview::InventorThumbnail.expects(:extract).never
    assert_equal path, RedmineCadPreview::InventorThumbnail.png_for(attachment)
  end

  def test_png_for_should_return_nil_without_image
    attachment = create_cad_attachment('notes.txt', :as => 'part.ipt')

    assert_nil RedmineCadPreview::InventorThumbnail.png_for(attachment)
    assert_not File.exist?(RedmineCadPreview::InventorThumbnail.cache_path(attachment))
  end

  def test_destroy_should_delete_the_image
    attachment = create_cad_attachment('part.ipt')
    path = RedmineCadPreview::InventorThumbnail.png_for(attachment)

    attachment.destroy
    assert_not File.exist?(path)
  end

  def test_thumbnail
    skip 'ImageMagick is not available' unless Redmine::Thumbnail.convert_available?

    attachment = create_cad_attachment('part.ipt')
    assert attachment.thumbnailable?
    path = attachment.thumbnail(:size => 40)
    assert path
    assert_equal 'image/png', Marcel::MimeType.for(Pathname.new(path))
  end

  def test_thumbnail_without_image
    attachment = create_cad_attachment('notes.txt', :as => 'part.ipt')
    assert_nil attachment.thumbnail
  end

  def test_thumbnailable_should_be_false_when_the_format_is_disabled
    attachment = create_cad_attachment('part.ipt')
    with_cad_settings('formats' => %w[step]) do
      assert_not attachment.thumbnailable?
    end
  end

  private

  def thumbnail
    File.binread(File.join(FIXTURES_DIR, 'thumbnail.png'))
  end

  def attachment_stub(path)
    stub(:diskfile => path, :digest => 'truncated', :filesize => 2048, :disk_filename => File.basename(path))
  end
end
