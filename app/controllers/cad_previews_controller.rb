# frozen_string_literal: true

# Sends the files displayed by the CAD viewer. The files are sent here instead
# of by AttachmentsController#download, so that showing a preview does not
# increase the download counter of the attachment.
class CadPreviewsController < ApplicationController
  before_action :find_attachment, :authorize_attachment
  before_action :authorize_snapshot, :only => :snapshot

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

  # Sends the image saved in the file (Inventor, Solid Edge, SolidWorks, FreeCAD,
  # 3MF, DXF, DWG)
  def image
    path = RedmineCadPreview::PreviewImage.extract(@attachment)
    return render_404 unless path

    if stale?(:etag => @attachment.digest, :template => false)
      send_file path, :filename => "#{File.basename(@attachment.filename, '.*')}.png",
                      :type => 'image/png', :disposition => 'inline'
    end
  end

  # Stores the snapshot of the viewer that is used for the thumbnail of the
  # attachment. The browser sends it when the preview of an attachment
  # without image is opened.
  def snapshot
    data = request.body.read(RedmineCadPreview::PreviewImage::MAX_SNAPSHOT_SIZE + 1)
    if RedmineCadPreview::PreviewImage.store_snapshot(@attachment, data.to_s)
      head :no_content
    else
      head 422 # rubocop:disable Rails/HttpStatus -- the name of the status differs between Rack versions
    end
  end

  private

  # Only users who can edit the attachment can set its thumbnail
  def authorize_snapshot
    @attachment.editable? ? true : deny_access
  end

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
