# frozen_string_literal: true

module RedmineCadPreview
  module AttachmentsControllerPatch
    def show
      if request.format.html? && @attachment && RedmineCadPreview.previewable?(@attachment)
        prepare_cad_preview_pagination
        @cad_format = RedmineCadPreview.format_of(@attachment.filename)
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
