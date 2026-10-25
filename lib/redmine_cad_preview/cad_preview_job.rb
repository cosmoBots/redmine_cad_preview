# frozen_string_literal: true

module RedmineCadPreview
  # Prepares the preview of an uploaded file in the background: reads the
  # image saved in the file and converts DWG files to DXF, so that the
  # thumbnail and the preview are ready when they are displayed.
  class CadPreviewJob < ApplicationJob
    def self.needed?(attachment)
      format = RedmineCadPreview.format_of(attachment.filename)
      (format == 'dwg' || PreviewImage::EMBEDDED_FORMATS.include?(format)) && RedmineCadPreview.previewable?(attachment)
    end

    def perform(attachment_id)
      attachment = Attachment.find_by(:id => attachment_id)
      return unless attachment && RedmineCadPreview.previewable?(attachment)

      # The image of a DWG file is read from the converted file
      DwgConverter.dxf_for(attachment) if RedmineCadPreview.format_of(attachment.filename) == 'dwg'
      PreviewImage.extract(attachment)
    end
  end
end
