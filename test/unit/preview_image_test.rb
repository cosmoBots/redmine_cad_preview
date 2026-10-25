# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewPreviewImageTest < ActiveSupport::TestCase
  include RedmineCadPreview::TestHelper

  fixtures :projects, :users, :email_addresses, :issues, :trackers, :projects_trackers,
           :issue_statuses, :enumerations, :members, :member_roles, :roles

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
  end

  def test_extract_from_inventor_file
    attachment = create_cad_attachment('part.ipt')

    path = RedmineCadPreview::PreviewImage.extract(attachment)
    assert_equal RedmineCadPreview::PreviewImage.embedded_path(attachment), path
    assert_equal thumbnail, File.binread(path)
  end

  def test_extract_should_read_the_file_only_once
    attachment = create_cad_attachment('part.ipt')
    path = RedmineCadPreview::PreviewImage.extract(attachment)

    RedmineCadPreview::OleThumbnail.expects(:extract).never
    assert_equal path, RedmineCadPreview::PreviewImage.extract(attachment)
  end

  def test_extract_should_remember_files_without_image
    attachment = create_cad_attachment('notes.txt', :as => 'part.ipt')
    assert_nil RedmineCadPreview::PreviewImage.extract(attachment)

    RedmineCadPreview::OleThumbnail.expects(:extract).never
    assert_nil RedmineCadPreview::PreviewImage.extract(attachment)
    assert_nil RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_extract_from_solid_edge_file
    attachment = create_cad_attachment('part.par')
    assert_equal 'BM', File.binread(RedmineCadPreview::PreviewImage.extract(attachment), 2)
  end

  def test_extract_from_freecad_file
    attachment = create_cad_attachment('thumbnail.FCStd')
    assert_equal thumbnail, File.binread(RedmineCadPreview::PreviewImage.extract(attachment))
  end

  def test_extract_from_3mf_file
    attachment = create_cad_attachment('thumbnail.3mf')
    assert_equal thumbnail, File.binread(RedmineCadPreview::PreviewImage.extract(attachment))
  end

  def test_extract_from_3mf_file_without_thumbnail
    attachment = create_cad_attachment('notes.txt', :as => 'model.3mf')
    assert_nil RedmineCadPreview::PreviewImage.extract(attachment)
  end

  def test_extract_from_dxf_file
    attachment = create_cad_attachment('thumbnail.dxf')
    assert_equal 'BM', File.binread(RedmineCadPreview::PreviewImage.extract(attachment), 2)
  end

  def test_extract_from_dxf_file_without_thumbnail
    attachment = create_cad_attachment('drawing.dxf')
    assert_nil RedmineCadPreview::PreviewImage.extract(attachment)
  end

  def test_extract_from_converted_dwg_file
    attachment = create_cad_attachment('thumbnail.dwg')

    with_fake_dwg2dxf do
      RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert_equal 'BM', File.binread(RedmineCadPreview::PreviewImage.extract(attachment), 2)
    end
  end

  def test_extract_from_dwg_file_should_wait_for_the_conversion
    attachment = create_cad_attachment('thumbnail.dwg')

    with_fake_dwg2dxf do
      assert_nil RedmineCadPreview::PreviewImage.extract(attachment)
      RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert RedmineCadPreview::PreviewImage.extract(attachment)
    end
  end

  def test_upload_of_dwg_file_should_convert_it_and_extract_the_image
    with_fake_dwg2dxf do
      attachment = create_cad_attachment('thumbnail.dwg', :convert => true)
      assert_equal RedmineCadPreview::PreviewImage.embedded_path(attachment), RedmineCadPreview::PreviewImage.path(attachment)
    end
  end

  def test_extract_should_return_nil_for_formats_without_image
    attachment = create_cad_attachment('model.step')
    assert_nil RedmineCadPreview::PreviewImage.extract(attachment)
  end

  def test_upload_should_extract_the_image_in_the_background
    attachment = create_cad_attachment('part.ipt', :convert => true)
    assert RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_store_snapshot
    attachment = create_cad_attachment('model.step')

    assert RedmineCadPreview::PreviewImage.store_snapshot(attachment, thumbnail)
    assert_equal RedmineCadPreview::PreviewImage.snapshot_path(attachment), RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_store_snapshot_should_reject_other_data
    attachment = create_cad_attachment('model.step')

    assert_not RedmineCadPreview::PreviewImage.store_snapshot(attachment, '<svg/>')
    assert_not RedmineCadPreview::PreviewImage.store_snapshot(attachment, thumbnail + ('x' * 2.megabytes))
    assert_nil RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_store_snapshot_should_not_replace_the_image_of_the_file
    attachment = create_cad_attachment('part.ipt')
    embedded = RedmineCadPreview::PreviewImage.extract(attachment)

    assert RedmineCadPreview::PreviewImage.store_snapshot(attachment, thumbnail)
    assert_not File.exist?(RedmineCadPreview::PreviewImage.snapshot_path(attachment))
    assert_equal embedded, RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_destroy_should_delete_the_images
    attachment = create_cad_attachment('part.ipt')
    path = RedmineCadPreview::PreviewImage.extract(attachment)

    attachment.destroy
    assert_not File.exist?(path)
  end

  def test_thumbnail_from_image_of_the_file
    skip 'ImageMagick is not available' unless Redmine::Thumbnail.convert_available?

    # The image is extracted by the job after the upload
    attachment = create_cad_attachment('part.ipt')
    assert attachment.thumbnailable?
    assert_equal 'image/png', Marcel::MimeType.for(Pathname.new(attachment.thumbnail(:size => 40)))
  end

  def test_thumbnail_from_snapshot
    skip 'ImageMagick is not available' unless Redmine::Thumbnail.convert_available?

    attachment = create_cad_attachment('model.step')
    assert_not attachment.thumbnailable?

    RedmineCadPreview::PreviewImage.store_snapshot(attachment, thumbnail)
    assert attachment.thumbnailable?
    assert attachment.thumbnail
  end

  def test_thumbnail_without_image
    attachment = create_cad_attachment('model.step')
    assert_nil attachment.thumbnail
  end

  def test_thumbnailable_should_be_false_when_the_format_is_disabled
    attachment = create_cad_attachment('part.ipt')
    RedmineCadPreview::PreviewImage.extract(attachment)

    with_cad_settings('formats' => %w[step]) do
      assert_not attachment.thumbnailable?
    end
  end

  private

  def thumbnail
    File.binread(File.join(FIXTURES_DIR, 'thumbnail.png'))
  end
end
