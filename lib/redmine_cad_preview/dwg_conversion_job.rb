# frozen_string_literal: true

module RedmineCadPreview
  # Converts an uploaded DWG file to DXF in the background, so that the
  # preview is ready when it is opened.
  class DwgConversionJob < ApplicationJob
    def perform(attachment_id)
      attachment = Attachment.find_by(:id => attachment_id)
      return unless attachment && RedmineCadPreview.previewable?(attachment)

      DwgConverter.dxf_for(attachment)
    end
  end
end
