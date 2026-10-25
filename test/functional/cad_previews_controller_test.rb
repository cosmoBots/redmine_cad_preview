# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewsControllerTest < Redmine::ControllerTest
  include RedmineCadPreview::TestHelper

  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles,
           :enabled_modules, :issues, :trackers, :projects_trackers, :issue_statuses,
           :enumerations, :attachments

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
  end

  def test_file
    attachment = create_cad_attachment('model.step')
    @request.session[:user_id] = 2

    get(:file, :params => {:id => attachment.id})
    assert_response :success
    assert_equal 'application/octet-stream', response.media_type
    assert_equal File.binread(File.join(FIXTURES_DIR, 'model.step')), response.body
  end

  def test_file_should_not_increase_the_download_counter
    attachment = create_cad_attachment('model.step')
    @request.session[:user_id] = 2

    assert_no_difference -> { attachment.reload.downloads } do
      get(:file, :params => {:id => attachment.id})
    end
  end

  def test_image
    attachment = create_cad_attachment('part.ipt')
    @request.session[:user_id] = 2

    get(:image, :params => {:id => attachment.id})
    assert_response :success
    assert_equal 'image/png', response.media_type
    assert_match(/\Ainline/, response.headers['Content-Disposition'])
    assert_equal File.binread(File.join(FIXTURES_DIR, 'thumbnail.png')), response.body
  end

  def test_image_without_image
    attachment = create_cad_attachment('notes.txt', :as => 'part.ipt')
    @request.session[:user_id] = 2

    get(:image, :params => {:id => attachment.id})
    assert_response :not_found
  end

  def test_snapshot
    attachment = create_cad_attachment('model.step')
    @request.session[:user_id] = 2

    post(:snapshot, :params => {:id => attachment.id}, :body => thumbnail)
    assert_response :no_content
    assert_equal thumbnail, File.binread(RedmineCadPreview::PreviewImage.snapshot_path(attachment))
  end

  def test_snapshot_should_reject_other_data
    attachment = create_cad_attachment('model.step')
    @request.session[:user_id] = 2

    post(:snapshot, :params => {:id => attachment.id}, :body => '<svg/>')
    assert_equal 422, response.status
    assert_nil RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_snapshot_should_require_edit_permission
    attachment = create_cad_attachment('model.step')
    # Anonymous can view the issue but not edit it

    post(:snapshot, :params => {:id => attachment.id}, :body => thumbnail)
    assert_response :redirect
    assert_nil RedmineCadPreview::PreviewImage.path(attachment)
  end

  def test_file_should_require_permission
    attachment = create_cad_attachment('model.step', :container => Issue.find(4)) # private project

    get(:file, :params => {:id => attachment.id})
    assert_response :redirect
    assert_match %r{/login}, response.location
  end

  def test_file_of_unsupported_attachment_should_return_404
    attachment = create_cad_attachment('notes.txt')
    @request.session[:user_id] = 2

    get(:file, :params => {:id => attachment.id})
    assert_response :not_found
  end

  def test_file_of_missing_attachment_should_return_404
    @request.session[:user_id] = 2

    get(:file, :params => {:id => 99999})
    assert_response :not_found
  end

  def test_dxf_should_send_the_converted_file
    attachment = create_cad_attachment('drawing.dwg')
    @request.session[:user_id] = 2

    with_fake_dwg2dxf do
      get(:dxf, :params => {:id => attachment.id})
    end
    assert_response :success
    assert_equal File.binread(File.join(FIXTURES_DIR, 'drawing.dwg')), response.body
    assert_match 'drawing.dxf', response.headers['Content-Disposition']
  end

  def test_dxf_with_failing_conversion_should_return_422
    attachment = create_cad_attachment('drawing.dwg')
    @request.session[:user_id] = 2

    with_fake_dwg2dxf(:mode => 'fail') do
      get(:dxf, :params => {:id => attachment.id})
    end
    assert_equal 422, response.status
  end

  def test_routes
    assert_routing({:method => 'get', :path => '/cad_previews/1/file'},
                   {:controller => 'cad_previews', :action => 'file', :id => '1'})
    assert_routing({:method => 'get', :path => '/cad_previews/1/dxf'},
                   {:controller => 'cad_previews', :action => 'dxf', :id => '1'})
  end

  private

  def thumbnail
    File.binread(File.join(FIXTURES_DIR, 'thumbnail.png'))
  end
end
