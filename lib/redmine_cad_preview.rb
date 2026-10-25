# frozen_string_literal: true

module RedmineCadPreview
  VERSION = '0.1.0'

  # Formats and file extensions. DWG files are converted to DXF on the server.
  # Inventor and Solid Edge files are shown with the preview image saved in
  # the file (IMAGE_FORMATS).
  FORMATS = {
    'step' => %w[.step .stp],
    'iges' => %w[.iges .igs],
    'brep' => %w[.brep .brp],
    'stl' => %w[.stl],
    'obj' => %w[.obj],
    '3mf' => %w[.3mf],
    'gltf' => %w[.gltf],
    'glb' => %w[.glb],
    'dxf' => %w[.dxf],
    'dwg' => %w[.dwg],
    'inventor' => %w[.ipt .iam .ipn .idw .ide],
    'solid_edge' => %w[.par .asm .psm .pwd .dft]
  }.freeze

  # Formats that cannot be displayed in the viewer, only with the image
  # saved in the file
  IMAGE_FORMATS = %w[inventor solid_edge].freeze

  DEFAULT_SETTINGS = {
    'formats' => FORMATS.keys,
    'max_file_size' => '50',
    'dwg2dxf_command' => 'dwg2dxf',
    'conversion_timeout' => '30'
  }.freeze

  class << self
    def settings
      Setting.plugin_redmine_cad_preview || {}
    end

    def enabled_formats
      formats = settings['formats']
      formats = DEFAULT_SETTINGS['formats'] unless formats.is_a?(Array)
      formats & FORMATS.keys
    end

    # Maximum file size for the preview in bytes
    def max_file_size
      size = settings['max_file_size'].to_i
      (size > 0 ? size : DEFAULT_SETTINGS['max_file_size'].to_i).megabytes
    end

    # Returns the format of the file, or nil if it is not supported
    def format_of(filename)
      extension = File.extname(filename.to_s).downcase
      FORMATS.find {|_, extensions| extensions.include?(extension)}&.first
    end

    def previewable?(attachment)
      format = format_of(attachment.filename)
      return false unless format && enabled_formats.include?(format)
      return false unless attachment.readable? && attachment.filesize <= max_file_size
      return DwgConverter.available? if format == 'dwg'
      # .asm is also the extension of assembler source files
      return CompoundFile.signature?(attachment.diskfile) if format == 'solid_edge'

      true
    end
  end
end
