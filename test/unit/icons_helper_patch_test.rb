# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewIconsHelperPatchTest < Redmine::HelperTest
  include RedmineCadPreview::TestHelper

  def test_icon_for_cad_filename
    assert_equal 'file-3d', send(:icon_for_mime_type, 'application/octet-stream', 'model.step')
    assert_equal 'file-vector', send(:icon_for_mime_type, 'image/vnd.dwg', 'drawing.dwg')
  end

  def test_icon_for_cad_filename_of_disabled_format
    with_cad_settings('formats' => %w[dxf]) do
      assert_not_equal 'file-3d', send(:icon_for_mime_type, 'application/octet-stream', 'model.step')
    end
  end

  # Redmine 7.0 passes only the content type
  def test_icon_for_cad_content_type
    assert_equal 'file-vector', send(:icon_for_mime_type, 'image/vnd.dxf')
    assert_equal 'file-3d', send(:icon_for_mime_type, 'model/iges')
  end

  def test_icon_for_other_content_type
    assert_equal 'application-pdf', send(:icon_for_mime_type, 'application/pdf')
    assert_equal 'text-plain', send(:icon_for_mime_type, 'text/plain')
  end

  def test_cad_icons_should_be_taken_from_the_plugin_sprite
    skip 'Redmine selects the sprite with sprite_source since 6.1' unless IconsHelper.method_defined?(:sprite_source)

    assert_match %r{plugin_assets/redmine_cad_preview/icons.*#icon--file-3d}, sprite_icon('file-3d')
    assert_no_match %r{redmine_cad_preview}, sprite_icon('file')
  end
end
