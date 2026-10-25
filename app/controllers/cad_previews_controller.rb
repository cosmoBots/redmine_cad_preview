# frozen_string_literal: true

# Sends the files displayed by the CAD viewer. The files are sent here instead
# of by AttachmentsController#download, so that showing a preview does not
# increase the download counter of the attachment.
class CadPreviewsController < ApplicationController
  before_action :find_attachment, :authorize_attachment

  # Sends the attachment
  def file
    send_cad_file @attachment.diskfile, @attachment.filename
  end

  # Sends the DXF file converted from a DWG attachment
  def dxf
    path = RedmineCadPreview::DwgConverter.dxf_for(@attachment)
    if path
      send_cad_file path, "#{File.basename(@attachment.filename, '.*')}.dxf"
    else
      render_error :status => 422, :message => l(:text_cad_preview_conversion_failed)
    end
  end

  private

  def find_attachment
    @attachment = Attachment.find(params[:id])
    raise ActiveRecord::RecordNotFound unless RedmineCadPreview.previewable?(@attachment)

    @project = @attachment.project
  rescue ActiveRecord::RecordNotFound
    render_404
  end

  def authorize_attachment
    @attachment.visible? ? true : deny_access
  end

  def send_cad_file(path, filename)
    if stale?(:etag => @attachment.digest, :template => false)
      send_file path, :filename => filename, :type => 'application/octet-stream', :disposition => 'attachment'
    end
  end
end
