# frozen_string_literal: true

module RedmineCadPreview
  module AttachmentPatch
    def self.included(base)
      base.prepend(Thumbnail)
      base.after_commit :convert_cad_preview_later, :on => :create
      base.after_commit :delete_cad_preview, :on => :destroy
    end

    # Thumbnails of Inventor files, made from the preview image in the file
    module Thumbnail
      def thumbnailable?
        super || (cad_inventor_file? && Redmine::Thumbnail.convert_available?)
      end

      def thumbnail(options={})
        return super unless cad_inventor_file?

        source = RedmineCadPreview::InventorThumbnail.png_for(self)
        return nil unless source && thumbnailable?

        size = options[:size].to_i
        size = size > 0 ? [(size / 50.0).ceil * 50, 800].min : Setting.thumbnails_size.to_i
        size = 100 unless size > 0
        Redmine::Thumbnail.generate(source, thumbnail_path(size), size)
      rescue StandardError => e
        Rails.logger.error("An error occurred while generating thumbnail for #{disk_filename}: #{e.message}")
        nil
      end

      private

      def cad_inventor_file?
        RedmineCadPreview.format_of(filename) == 'inventor' && RedmineCadPreview.previewable?(self)
      end
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
      RedmineCadPreview::InventorThumbnail.delete(self)
    rescue StandardError => e
      Rails.logger.error("Could not remove CAD preview for #{disk_filename}: #{e.message}")
    end
  end
end
