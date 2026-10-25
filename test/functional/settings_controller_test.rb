# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewSettingsControllerTest < Redmine::ControllerTest
  tests SettingsController

  fixtures :users, :email_addresses

  def setup
    # The settings saved by another test can still be cached
    Setting.clear_cache
    @request.session[:user_id] = 1
  end

  def test_plugin_settings
    get(:plugin, :params => {:id => 'redmine_cad_preview'})
    assert_response :success
    assert_select 'input[type=checkbox][name=?]', 'settings[formats][]', RedmineCadPreview::FORMATS.size
    assert_select 'input[name=?][value="50"]', 'settings[max_file_size]'
    assert_select 'input[name=?]', 'settings[dwg2dxf_command]'
    assert_select 'input[name=?]', 'settings[conversion_timeout]'
  end

  def test_update_plugin_settings
    post(:plugin, :params => {:id => 'redmine_cad_preview',
                              :settings => {'formats' => ['step', 'dxf', ''], 'max_file_size' => '20',
                                            'dwg2dxf_command' => 'dwg2dxf', 'conversion_timeout' => '60'}})
    assert_redirected_to '/settings/plugin/redmine_cad_preview'
    assert_equal ['step', 'dxf'], RedmineCadPreview.enabled_formats
    assert_equal 20.megabytes, RedmineCadPreview.max_file_size
    assert_equal 60, RedmineCadPreview::DwgConverter.timeout
  end
end
