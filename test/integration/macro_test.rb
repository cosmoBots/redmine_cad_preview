# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewMacroTest < Redmine::IntegrationTest
  include RedmineCadPreview::TestHelper

  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles, :enabled_modules,
           :issues, :trackers, :projects_trackers, :issue_statuses, :enumerations,
           :wikis, :wiki_pages, :wiki_contents

  STATE = {'version' => 1, 'projection' => 'perspective'}.freeze

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
    @issue = Issue.find(1)
    @attachment = create_cad_attachment('model.step', :container => @issue)
    log_user('jsmith', 'jsmith')
  end

  def test_macro_with_file_name_and_default_view
    save_view('front')
    show_issue_with('{{cad_preview(model.step)}} {{cad_preview(model.step, height=300)}}')

    assert_select '.wiki div.cad-preview[data-embedded=true]', 2
    assert_select '.wiki div.cad-preview:not([data-view])', 2
    assert_select ".wiki div.cad-preview[data-views-url=?]", "/cad_previews/#{@attachment.id}/views"
    assert_select '.wiki div.cad-preview .cad-preview-canvas[style*="--cad-preview-height: 520px"]'
    assert_select '.wiki div.cad-preview .cad-preview-canvas[style*="--cad-preview-height: 300px"]'
    # The toolbar shows only the icons
    assert_select '.wiki a.icon-only[data-cad-action=fit][title=?]', 'Fit to view'
    # The assets are included once
    assert_select '.wiki link[href*="cad_preview"]', 1
    assert_select '.wiki script[type=module][src*="cad_preview"]', 1
  end

  def test_macro_with_attachment_id_in_a_wiki_page
    page = WikiPage.find(1)
    page.content.update_column(:text, "{{cad_preview(#{@attachment.id}, view=Front)}}")
    save_view('front')

    get "/projects/#{page.project.identifier}/wiki/#{page.title}"
    assert_response :success
    assert_select '.wiki div.cad-preview[data-view=front]'
  end

  def test_macro_with_all_views
    save_view('front')
    save_view('detail')
    show_issue_with('{{cad_preview(model.step, view=*)}}')

    assert_equal %w[detail front], css_select('.wiki div.cad-preview').pluck('data-view')
  end

  def test_macro_should_show_the_image_of_the_view_until_the_viewer_is_ready
    front = save_view('front')
    detail = save_view('detail')
    show_issue_with('{{cad_preview(model.step)}} {{cad_preview(model.step, view=detail)}}')

    assert_equal ["/attachments/download/#{front.image.id}/front.png", "/attachments/download/#{detail.image.id}/detail.png"],
                 css_select('.wiki .cad-preview-canvas img.cad-preview-placeholder').pluck('src')
  end

  def test_macro_without_views_should_not_show_an_image_until_the_viewer_is_ready
    show_issue_with('{{cad_preview(model.step)}}')

    assert_select '.wiki div.cad-preview'
    assert_select '.wiki img.cad-preview-placeholder', 0
  end

  def test_macro_with_readonly_should_not_show_the_controls_to_save_views
    Role.find(1).add_permission!(:save_cad_preview_views)
    save_view('front')
    show_issue_with('{{cad_preview(model.step, view=front)}} {{cad_preview(model.step, view=front, readonly)}}')

    assert_select '.wiki div.cad-preview[data-view=front]', 2
    assert_select '.wiki a[data-cad-action=save-view]', 1
    assert_select '.wiki form.cad-preview-view-form', 1
    assert_select '.wiki select[data-cad-view]', 2
  end

  def test_macro_with_png
    view = save_view('front')
    show_issue_with('{{cad_preview(model.step, view=front, png, height=300)}}')

    assert_select '.wiki div.cad-preview', 0
    assert_select '.wiki figure.cad-preview-figure a[href=?][title=?]', "/attachments/#{@attachment.id}", 'model.step (front)' do
      assert_select 'img[src=?][style*="300px"]', "/attachments/download/#{view.image.id}/front.png"
    end
    assert_select '.wiki figcaption', 0
  end

  def test_macro_with_unknown_view_should_show_an_error
    save_view('front')
    show_issue_with('{{cad_preview(model.step, view=back)}}')

    assert_select '.wiki div.flash.error', :text => /The view "back" does not exist/
    assert_select '.wiki div.cad-preview', 0
  end

  def test_macro_with_png_and_without_views_should_show_an_error
    show_issue_with('{{cad_preview(model.step, png)}}')

    assert_select '.wiki div.flash.error', :text => /no saved views/
  end

  def test_macro_with_invalid_arguments_should_show_an_error
    show_issue_with('{{cad_preview(model.step, height=100)}} {{cad_preview(model.step, png, height=10)}} ' \
                    '{{cad_preview(model.step, size=3)}} {{cad_preview(other.step)}}')

    assert_select '.wiki div.flash.error', :text => /between 240 and 1200/
    assert_select '.wiki div.flash.error', :text => /between 16 and 1200/
    assert_select '.wiki div.flash.error', :text => /Usage/
    assert_select '.wiki div.flash.error', :text => /other.step/
  end

  def test_macro_with_attachment_that_is_not_visible_should_show_an_error
    other = create_cad_attachment('model.stl', :container => Issue.find(4))
    Project.find(2).update_column(:is_public, false)
    reset!
    show_issue_with("{{cad_preview(#{other.id})}}")

    assert_select '.wiki div.flash.error', :text => /#{other.id}/
  end

  private

  def show_issue_with(text)
    @issue.update_column(:description, text)
    get "/issues/#{@issue.id}"
    assert_response :success
  end

  def save_view(name)
    RedmineCadPreview::Views.save(@attachment, name, :user => User.find(2), :state => STATE, :image => png_image)
  end
end
