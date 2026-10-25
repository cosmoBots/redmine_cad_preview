# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewAttachmentsControllerTest < Redmine::ControllerTest
  include RedmineCadPreview::TestHelper
  tests AttachmentsController

  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles,
           :enabled_modules, :issues, :trackers, :projects_trackers, :issue_statuses,
           :enumerations, :attachments

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
    @request.session[:user_id] = 2
  end

  def test_show_step_file
    attachment = create_cad_attachment('model.step')

    get(:show, :params => {:id => attachment.id})
    assert_response :success
    assert_select 'div.cad-preview[data-cad-preview]' do |element|
      assert_equal 'step', element.first['data-format']
      assert_equal "/cad_previews/#{attachment.id}/file", element.first['data-url']
      assert_equal 'model.step', element.first['data-filename']
      assert_match %r{/occt-import-js(-\w+)?\.js\z}, element.first['data-occt-script']
      assert_match %r{/occt-import-js(-\w+)?\.wasm\z}, element.first['data-occt-wasm']
    end
    assert_select 'a[data-cad-action=fit]'
    assert_select 'a[data-cad-action=wireframe]'
    assert_select 'a[data-cad-action=measure-distance]'
    assert_select 'a[data-cad-action=measure-angle]'
    assert_select 'a.cad-preview-maximize[data-cad-action=maximize]'
    assert_select 'a.cad-preview-restore[data-cad-action=maximize]'
    assert_select 'a.cad-preview-fullscreen[data-cad-action=fullscreen]'
    assert_select 'a.cad-preview-exit-fullscreen[data-cad-action=fullscreen]'
    assert_select 'a[data-cad-action=download-png][title=?]', 'Download (PNG)'
    assert_select 'a[data-cad-action=download-pdf][title=?]', 'Download (PDF)'
    assert_select '.cad-preview-toolbar svg use[href*="plugin_assets/redmine_cad_preview/icons"]', 10
    assert_select '.cad-preview-info span.cad-preview-dimensions'
    assert_select 'script[type=module][src*=cad_preview]'
  end

  def test_show_should_include_measurement_labels
    attachment = create_cad_attachment('model.step')

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview[data-i18n]' do |element|
      i18n = JSON.parse(element.first['data-i18n'])
      assert_equal %w[angle dimensions distance solids units], i18n.keys.sort
      assert_equal 'Distance', i18n['distance']
    end
  end

  def test_show_stl_file_should_not_load_occt
    attachment = create_cad_attachment('model.stl')

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview[data-format=stl]:not([data-occt-script])'
  end

  def test_show_dxf_file
    attachment = create_cad_attachment('drawing.dxf')

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview[data-format=dxf]' do |element|
      assert_equal "/cad_previews/#{attachment.id}/file", element.first['data-url']
      assert_equal 2, JSON.parse(element.first['data-fonts']).size
    end
    assert_select 'a[data-cad-action=wireframe]', 0
    assert_select 'a[data-cad-action=measure-distance]'
    assert_select 'a[data-cad-action=measure-angle]'
  end

  def test_show_inventor_file
    attachment = create_cad_attachment('part.ipt')

    get(:show, :params => {:id => attachment.id})
    assert_response :success
    assert_select '.cad-preview-image img[src=?]', "/cad_previews/#{attachment.id}/image"
    assert_select 'p.cad-preview-hint', :text => /Export the model as STEP/
    assert_select 'div.cad-preview', 0
  end

  def test_show_inventor_file_without_image
    attachment = create_cad_attachment('notes.txt', :as => 'part.ipt')

    get(:show, :params => {:id => attachment.id})
    assert_response :success
    assert_select 'p.cad-preview-message', :text => /no preview image/
    assert_select '.cad-preview-image', 0
  end

  def test_thumbnail_of_inventor_file
    skip 'ImageMagick is not available' unless Redmine::Thumbnail.convert_available?

    attachment = create_cad_attachment('part.ipt')

    get(:thumbnail, :params => {:id => attachment.id})
    assert_response :success
    assert_equal 'image/png', response.media_type
  end

  def test_show_should_request_snapshot_for_attachment_without_image
    attachment = create_cad_attachment('model.step')

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview[data-snapshot-url=?]', "/cad_previews/#{attachment.id}/snapshot"
  end

  def test_show_should_not_request_snapshot_for_attachment_with_snapshot
    attachment = create_cad_attachment('model.step')
    RedmineCadPreview::PreviewImage.store_snapshot(attachment, File.binread(File.join(FIXTURES_DIR, 'thumbnail.png')))

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview:not([data-snapshot-url])'
  end

  def test_show_should_not_request_snapshot_from_user_who_cannot_edit
    attachment = create_cad_attachment('model.step')
    @request.session[:user_id] = nil

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview:not([data-snapshot-url])'
  end

  def test_show_dxf_file_with_image
    attachment = create_cad_attachment('thumbnail.dxf')

    get(:show, :params => {:id => attachment.id})
    assert_select 'div.cad-preview[data-image-url=?]', "/cad_previews/#{attachment.id}/image"
    assert_select 'div.cad-preview:not([data-snapshot-url])'
  end

  def test_show_dwg_file_with_available_converter
    attachment = create_cad_attachment('drawing.dwg')

    with_fake_dwg2dxf do
      get(:show, :params => {:id => attachment.id})
    end
    assert_select 'div.cad-preview[data-format=dxf][data-url=?]', "/cad_previews/#{attachment.id}/dxf"
  end

  def test_show_dwg_file_being_converted_should_show_a_message
    attachment = create_cad_attachment('drawing.dwg')
    FileUtils.mkdir_p(RedmineCadPreview::DwgConverter.storage_path)
    FileUtils.touch(RedmineCadPreview::DwgConverter.lock_path(attachment))

    with_fake_dwg2dxf do
      get(:show, :params => {:id => attachment.id})
    end
    assert_select 'div.cad-preview', 0
    assert_select 'p.cad-preview-message', :text => /being converted/
  end

  def test_show_dwg_file_with_failed_conversion_should_show_a_message
    attachment = create_cad_attachment('drawing.dwg')
    with_fake_dwg2dxf(:mode => 'fail') do
      RedmineCadPreview::DwgConverter::MAX_ATTEMPTS.times { RedmineCadPreview::DwgConverter.dxf_for(attachment) }
      get(:show, :params => {:id => attachment.id})
    end
    assert_select 'div.cad-preview', 0
    assert_select 'p.cad-preview-message', :text => /could not be converted/
  end

  def test_show_dwg_file_without_converter_should_not_show_preview
    attachment = create_cad_attachment('drawing.dwg')

    with_cad_settings('dwg2dxf_command' => '/nonexistent/dwg2dxf') do
      RedmineCadPreview::DwgConverter.reset_availability!
      get(:show, :params => {:id => attachment.id})
    end
    assert_response :success
    assert_select 'div.cad-preview', 0
  end

  def test_show_disabled_format_should_not_show_preview
    attachment = create_cad_attachment('model.step')

    with_cad_settings('formats' => ['stl']) do
      get(:show, :params => {:id => attachment.id})
    end
    assert_response :success
    assert_select 'div.cad-preview', 0
  end

  def test_show_file_larger_than_maximum_size_should_not_show_preview
    attachment = create_cad_attachment('model.step')
    attachment.update_column(:filesize, 2.megabytes)

    with_cad_settings('max_file_size' => '1') do
      get(:show, :params => {:id => attachment.id})
    end
    assert_select 'div.cad-preview', 0
  end

  def test_show_other_file_should_not_show_preview
    attachment = create_cad_attachment('notes.txt')

    get(:show, :params => {:id => attachment.id})
    assert_response :success
    assert_select 'div.cad-preview', 0
  end

  def test_show_should_have_pagination
    create_cad_attachment('model.step')
    attachment = create_cad_attachment('model.stl')

    get(:show, :params => {:id => attachment.id})
    assert_select 'span.pagination.filepreview'
  end

  def test_show_with_api_format_should_not_show_preview
    attachment = create_cad_attachment('model.step')

    with_settings :rest_api_enabled => '1' do
      get(:show, :params => {:id => attachment.id, :format => 'json', :key => User.find(2).api_key})
    end
    assert_response :success
    assert_equal 'model.step', ActiveSupport::JSON.decode(response.body)['attachment']['filename']
  end
end
