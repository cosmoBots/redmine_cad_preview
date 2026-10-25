# frozen_string_literal: true

module RedmineCadPreview
  # Shows CAD icons next to CAD files in the attachment lists. Redmine selects
  # the icon by the content type and takes it from its own sprite, so the
  # icons of the plugin sprite are used for these names.
  module IconsHelperPatch
    FILE_ICONS = %w[file-3d file-vector].freeze
    DRAWING_FORMATS = %w[dxf dwg].freeze

    def sprite_source(icon_name, sprite: IconsHelper::DEFAULT_SPRITE, plugin: nil)
      return super unless plugin.nil? && sprite == IconsHelper::DEFAULT_SPRITE && FILE_ICONS.include?(icon_name)
      # Icons of the theme are used first, like for the icons of Redmine
      return super if theme_cad_icon?(icon_name, sprite)

      super(icon_name, sprite: sprite, plugin: 'redmine_cad_preview')
    end

    private

    # Themes can provide icons since Redmine 6.1 (theme_icon_set)
    def theme_cad_icon?(icon_name, sprite)
      current_theme.present? && respond_to?(:theme_icon_set, true) && theme_icon_set(sprite).include?(icon_name)
    end

    def icon_for_mime_type(mime, filename = nil)
      format = RedmineCadPreview.format_of(filename)
      return super unless format && RedmineCadPreview.enabled_formats.include?(format)

      DRAWING_FORMATS.include?(format) ? 'file-vector' : 'file-3d'
    end
  end
end
