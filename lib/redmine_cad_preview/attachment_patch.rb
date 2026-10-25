# frozen_string_literal: true

module RedmineCadPreview
  module AttachmentPatch
    def self.included(base)
      base.prepend(Thumbnail)
      base.after_commit :prepare_cad_preview_later, :on => :create
      base.after_commit :delete_cad_preview, :on => :destroy
    end

    # Thumbnails of CAD files, made from the image saved in the file or from
    # the snapshot of the viewer (see PreviewImage)
    module Thumbnail
      def thumbnailable?
        super || (Redmine::Thumbnail.convert_available? && cad_preview_image.present?)
      end

      def thumbnail(options={})
        source = cad_preview_image
        return super unless source && Redmine::Thumbnail.convert_available?

        size = options[:size].to_i
        size = size > 0 ? [(size / 50.0).ceil * 50, 800].min : Setting.thumbnails_size.to_i
        size = 100 unless size > 0
        Redmine::Thumbnail.generate(source, thumbnail_path(size), size)
      rescue StandardError => e
        Rails.logger.error("An error occurred while generating thumbnail for #{disk_filename}: #{e.message}")
        nil
      end

      private

      def cad_preview_image
        return nil unless RedmineCadPreview.format_of(filename) && RedmineCadPreview.previewable?(self)

        RedmineCadPreview::PreviewImage.path(self)
      end
    end

    private

    def prepare_cad_preview_later
      return unless RedmineCadPreview::CadPreviewJob.needed?(self)

      RedmineCadPreview::CadPreviewJob.perform_later(id)
    rescue StandardError => e
      Rails.logger.error("Could not schedule the CAD preview of #{disk_filename}: #{e.message}")
    end

    def delete_cad_preview
      RedmineCadPreview::DwgConverter.delete(self)
      RedmineCadPreview::PreviewImage.delete(self)
    rescue StandardError => e
      Rails.logger.error("Could not remove CAD preview for #{disk_filename}: #{e.message}")
    end
  end
end
