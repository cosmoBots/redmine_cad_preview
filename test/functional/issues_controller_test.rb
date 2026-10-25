# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewIssuesControllerTest < Redmine::ControllerTest
  include RedmineCadPreview::TestHelper
  tests IssuesController

  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles,
           :enabled_modules, :issues, :trackers, :projects_trackers, :issue_statuses,
           :enumerations, :attachments, :workflows

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
  end

  def test_show_should_display_cad_file_icons
    create_cad_attachment('model.step')
    create_cad_attachment('drawing.dxf')

    get(:show, :params => {:id => 1})
    assert_response :success
    assert_select 'div.attachments a.icon-attachment', :text => /model\.step/ do
      assert_select 'use[href*="plugin_assets/redmine_cad_preview/icons"][href$="#icon--file-3d"]'
    end
    assert_select 'div.attachments a.icon-attachment', :text => /drawing\.dxf/ do
      assert_select 'use[href*="plugin_assets/redmine_cad_preview/icons"][href$="#icon--file-vector"]'
    end
  end

  def test_show_should_not_display_cad_file_icons_for_disabled_formats
    create_cad_attachment('model.step')

    with_cad_settings('formats' => %w[dxf]) do
      get(:show, :params => {:id => 1})
    end
    assert_select 'div.attachments a.icon-attachment', :text => /model\.step/ do
      assert_select 'use[href*="redmine_cad_preview"]', 0
    end
  end
end
