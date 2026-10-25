# frozen_string_literal: true

if ENV['COVERAGE']
  require 'simplecov'
  require 'simplecov-cobertura'

  SimpleCov.coverage_dir 'coverage'

  SimpleCov.formatters = [
    SimpleCov::Formatter::HTMLFormatter,
    SimpleCov::Formatter::CoberturaFormatter
  ]

  SimpleCov.start :rails do
    add_filter 'init.rb'
    root File.expand_path("#{File.dirname __FILE__}/..")
  end

  # Cobertura-XML at the end
  at_exit do
    result = SimpleCov.result
    # Cobertura-file
    SimpleCov::Formatter::CoberturaFormatter.new.format(result)
    # html also
    SimpleCov::Formatter::HTMLFormatter.new.format(result)
  end
end

$VERBOSE = nil if ENV['SUPPRESS_WARNINGS']

# Load the normal Rails helper
require File.expand_path('../../../test/test_helper', __dir__)

module RedmineCadPreview
  module TestHelper
    FIXTURES_DIR = File.expand_path('fixtures/files', __dir__)
    FAKE_DWG2DXF = File.expand_path('support/fake_dwg2dxf', __dir__)

    # Creates an attachment. The DWG conversion after the upload is disabled
    # unless convert is true.
    # The attachment can be given another name than the fixture file with as.
    def create_cad_attachment(filename, container: Issue.find(1), convert: false, as: filename)
      create = lambda do
        Attachment.create!(
          :container => container,
          :file => Rack::Test::UploadedFile.new(File.join(FIXTURES_DIR, filename), 'application/octet-stream',
                                                :original_filename => as),
          :author => User.find(1)
        )
      end
      return create.call if convert

      without_dwg2dxf(&create)
    end

    def without_dwg2dxf(&)
      RedmineCadPreview::DwgConverter.reset_availability!
      with_cad_settings({'dwg2dxf_command' => '/nonexistent/dwg2dxf'}, &)
    ensure
      RedmineCadPreview::DwgConverter.reset_availability!
    end

    def clear_cad_preview_cache
      FileUtils.rm_rf(RedmineCadPreview::DwgConverter.storage_path)
    end

    def with_cad_settings(settings, &)
      with_settings(:plugin_redmine_cad_preview => RedmineCadPreview::DEFAULT_SETTINGS.merge(settings), &)
    end

    # Runs the block with the fake dwg2dxf command of the tests
    def with_fake_dwg2dxf(mode: nil, timeout: '30', &)
      RedmineCadPreview::DwgConverter.reset_availability!
      previous = ENV.fetch('FAKE_DWG2DXF_MODE', nil)
      ENV['FAKE_DWG2DXF_MODE'] = mode
      with_cad_settings({'dwg2dxf_command' => FAKE_DWG2DXF, 'conversion_timeout' => timeout}, &)
    ensure
      ENV['FAKE_DWG2DXF_MODE'] = previous
      RedmineCadPreview::DwgConverter.reset_availability!
    end
  end
end
