# frozen_string_literal: true

module RedmineCadPreview
  module AttachmentsControllerPatch
    def show
      if request.format.html? && @attachment && RedmineCadPreview.previewable?(@attachment)
        prepare_cad_preview_pagination
        @cad_format = RedmineCadPreview.format_of(@attachment.filename)
        # The image is read here for files uploaded before the plugin was installed
        @cad_image = RedmineCadPreview::PreviewImage.extract(@attachment)
        @cad_snapshot = @cad_image.nil? && RedmineCadPreview::PreviewImage.path(@attachment).nil? &&
                        @attachment.editable?
        render :action => 'cad_preview'
        return
      end

      super
    end

    private

    def prepare_cad_preview_pagination
      return unless @attachment.container.respond_to?(:attachments)

      @attachments = @attachment.container.attachments.to_a
      index = @attachments.index(@attachment)
      @paginator = Redmine::Pagination::Paginator.new(@attachments.size, 1, index + 1) if index
    end
  end
end
