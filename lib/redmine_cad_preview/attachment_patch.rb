# frozen_string_literal: true

module RedmineCadPreview
  module AttachmentPatch
    def self.included(base)
      base.after_commit :convert_cad_preview_later, :on => :create
      base.after_commit :delete_cad_preview, :on => :destroy
    end

    private

    def convert_cad_preview_later
      return unless RedmineCadPreview.format_of(filename) == 'dwg' && RedmineCadPreview.previewable?(self)

      RedmineCadPreview::DwgConversionJob.perform_later(id)
    rescue StandardError => e
      Rails.logger.error("Could not schedule the CAD preview conversion of #{disk_filename}: #{e.message}")
    end

    def delete_cad_preview
      RedmineCadPreview::DwgConverter.delete(self)
    rescue StandardError => e
      Rails.logger.error("Could not remove CAD preview for #{disk_filename}: #{e.message}")
    end
  end
end
