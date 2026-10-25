# frozen_string_literal: true

Redmine::Plugin.register :redmine_cad_preview do
  name 'Redmine CAD Preview'
  author 'Florian Walchshofer'
  author_url 'https://github.com/flowalchs/'
  description 'Interactive preview of CAD attachments (STEP, IGES, STL, 3MF, glTF, DXF, DWG and more, preview images of Inventor and Solid Edge) in the browser'
  url 'https://github.com/flowalchs/redmine_cad_preview/'
  version RedmineCadPreview::VERSION
  requires_redmine :version_or_higher => '6.0.0'

  settings :default => RedmineCadPreview::DEFAULT_SETTINGS,
           :partial => 'settings/cad_preview'
end

unless AttachmentsController.include?(RedmineCadPreview::AttachmentsControllerPatch)
  AttachmentsController.prepend(RedmineCadPreview::AttachmentsControllerPatch)
end

unless Attachment.include?(RedmineCadPreview::AttachmentPatch)
  Attachment.include(RedmineCadPreview::AttachmentPatch)
end

unless IconsHelper.include?(RedmineCadPreview::IconsHelperPatch)
  IconsHelper.prepend(RedmineCadPreview::IconsHelperPatch)
end
