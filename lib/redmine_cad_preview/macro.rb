# frozen_string_literal: true

module RedmineCadPreview
  # The macro {{cad_preview(attachment, view=name, height=520, png, readonly)}},
  # which shows the viewer of an attachment in wiki pages, issues and other texts.
  #
  # The attachment is given by its file name, among the attachments of the
  # object of the text, or by its ID. Without view, the default view is
  # restored. view=* shows all saved views. With png, and where no viewer can
  # be shown (PDF export, emails), the images of the views are shown. With
  # readonly, the viewer has no controls to save, delete or set views.
  module Macro
    DEFAULT_HEIGHT = 520
    # Heights of the viewer, and maximum heights of the images
    HEIGHTS = (240..1200)
    IMAGE_HEIGHTS = (16..1200)
    ALL_VIEWS = '*'
    # Size of the thumbnail shown instead of a default view (the largest
    # thumbnail is 800 pixels)
    THUMBNAIL_SIZE = 400

    class << self
      # Registers the macro, called by init.rb
      def register
        Redmine::WikiFormatting::Macros.register do
          desc "Shows the CAD viewer of an attachment. Examples:\n\n" \
               "{{cad_preview(model.step)}} -- attachment of this page or issue, with its default view\n" \
               "{{cad_preview(123, view=front, height=420)}} -- attachment 123 with the view front, 420 pixels high\n" \
               "{{cad_preview(model.step, view=*)}} -- all saved views\n" \
               "{{cad_preview(model.step, view=front, png)}} -- the image of the view instead of the viewer\n" \
               "{{cad_preview(model.step, view=front, readonly)}} -- the viewer without the controls to save views"
          macro :cad_preview do |obj, args|
            uploaded = @attachments if controller_path == 'previews' || action_name == 'preview'
            RedmineCadPreview::Macro.render(self, obj, args, :attachments => uploaded.to_a,
                                                             :static => @only_path == false)
          end
        end
      end

      # view is the view context of the text, obj the object of the text.
      # attachments are the attachments uploaded with the text (preview).
      # static is true where no viewer can be shown.
      def render(view, obj, args, attachments: [], static: false)
        args = args.map {|arg| arg.to_s.strip}
        png = args.reject! {|arg| arg.casecmp?('png')}.present?
        # The viewer without the controls to save, delete and set views, e.g. for
        # a temporary state that must not replace a prepared view
        readonly = args.reject! {|arg| arg.casecmp?('readonly')}.present?
        args, options = view.send(:extract_macro_options, args, :view, :height)
        raise ::I18n.t(:text_cad_preview_macro_usage) unless args.size == 1

        attachment = find_attachment(args.first, obj, attachments)
        unless attachment&.visible? && RedmineCadPreview.previewable?(attachment)
          raise ::I18n.t(:error_attachment_not_found, :name => args.first)
        end

        views = find_views(attachment, options[:view])
        if png || static
          render_images(view, attachment, views, options[:height] && height(options[:height], IMAGE_HEIGHTS), static)
        else
          # Without view, the viewer restores the current default view
          names = options[:view] ? views.map(&:name) : [nil]
          render_viewers(view, attachment, names, height(options[:height] || DEFAULT_HEIGHT, HEIGHTS), readonly)
        end
      end

      private

      # Finds the attachment by its file name among the attachments of the
      # object of the text (the issue of a note, the page of a wiki text), or
      # by its ID
      def find_attachment(reference, obj, uploaded)
        container = obj.is_a?(Journal) ? obj.journalized : obj
        attachments = container.respond_to?(:attachments) ? container.attachments.to_a : []
        attachment = Attachment.latest_attach(attachments + uploaded.to_a, reference) if reference.present?
        attachment || (Attachment.find_by(:id => reference) if /\A\d+\z/.match?(reference))
      end

      # Returns the views to show: the named view, all views, or the default
      # view (nil if the attachment has no default view)
      def find_views(attachment, name)
        if name == ALL_VIEWS
          views = Views.all(attachment).to_a
          raise ::I18n.t(:text_cad_preview_no_views) if views.empty?

          views
        elsif name
          view = Views.find(attachment, name)
          # A view that was asked for is not replaced by another view
          raise ::I18n.t(:text_cad_preview_view_not_found, :name => name) unless view

          [view]
        else
          [Views.default(attachment)]
        end
      end

      def height(value, range)
        height = value.to_s
        unless /\A\d+\z/.match?(height) && range.cover?(height.to_i)
          raise ::I18n.t(:text_cad_preview_macro_height, :min => range.min, :max => range.max)
        end

        height.to_i
      end

      def render_viewers(view, attachment, names, height, readonly)
        format = RedmineCadPreview.format_of(attachment.filename)
        viewers = names.map do |name|
          view.render(:partial => 'cad_previews/viewer',
                      :locals => {:attachment => attachment, :cad_format => format,
                                  :cad_image => PreviewImage.extract(attachment), :snapshot => false,
                                  :view => name, :embedded => true, :height => height,
                                  :readonly => readonly})
        end
        view.safe_join([assets(view), *viewers])
      end

      # The images of the views, linked to the attachment. Without default
      # view (nil), the thumbnail of the attachment is shown, if it has one.
      def render_images(view, attachment, views, height, static)
        only_path = !static
        images = views.map do |saved_view|
          url = saved_view ? view_image_url(view, saved_view, only_path) : thumbnail_url(view, attachment, height, only_path)
          alt = saved_view ? "#{attachment.filename} (#{saved_view.name})" : attachment.filename
          img = view.image_tag(url, :alt => alt, :style => ("max-block-size: #{height}px" if height))
          # The name of the view is shown when the mouse is over the image
          link = view.link_to(img, view.url_for(:controller => 'attachments', :action => 'show',
                                                :id => attachment, :only_path => only_path), :title => alt)
          view.content_tag(:figure, link, :class => 'cad-preview-figure')
        end
        view.safe_join(images)
      end

      def view_image_url(view, saved_view, only_path)
        image = saved_view.image
        view.url_for(:controller => 'attachments', :action => 'download', :id => image,
                     :filename => image.filename, :only_path => only_path)
      end

      def thumbnail_url(view, attachment, height, only_path)
        raise ::I18n.t(:text_cad_preview_no_views) unless attachment.thumbnailable?

        view.url_for(:controller => 'attachments', :action => 'thumbnail', :id => attachment,
                     :size => [height || THUMBNAIL_SIZE, 800].min, :only_path => only_path)
      end

      # The stylesheet and the script of the viewer, once per page. They are
      # included here, as wiki pages and issues do not load them.
      def assets(view)
        return ''.html_safe if view.instance_variable_get(:@cad_preview_assets)

        view.instance_variable_set(:@cad_preview_assets, true)
        view.safe_join([view.stylesheet_link_tag('cad_preview', :plugin => 'redmine_cad_preview'),
                        view.javascript_include_tag('cad_preview', :plugin => 'redmine_cad_preview',
                                                                   :type => 'module')])
      end
    end
  end
end
