# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class CadPreviewDwgConverterTest < ActiveSupport::TestCase
  include RedmineCadPreview::TestHelper

  fixtures :projects, :users, :email_addresses, :issues, :trackers, :projects_trackers,
           :issue_statuses, :enumerations

  def setup
    set_tmp_attachments_directory
    clear_cad_preview_cache
  end

  def test_dxf_for_should_convert_and_cache_the_file
    attachment = create_cad_attachment('drawing.dwg')

    with_fake_dwg2dxf do
      path = RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert_equal RedmineCadPreview::DwgConverter.cache_path(attachment), path
      assert File.file?(path)
    end
    # The cached file is used without converting again
    with_fake_dwg2dxf(:mode => 'fail') do
      assert RedmineCadPreview::DwgConverter.dxf_for(attachment)
    end
  end

  def test_failing_conversion_should_return_nil
    attachment = create_cad_attachment('drawing.dwg')

    with_fake_dwg2dxf(:mode => 'fail') do
      assert_nil RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert_not File.exist?(RedmineCadPreview::DwgConverter.cache_path(attachment))
    end
  end

  def test_failed_conversion_should_be_attempted_at_most_twice
    attachment = create_cad_attachment('drawing.dwg')

    with_fake_dwg2dxf(:mode => 'fail') do
      assert_nil RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert_equal :pending, RedmineCadPreview::DwgConverter.state(attachment)
      assert_nil RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert_equal :failed, RedmineCadPreview::DwgConverter.state(attachment)
    end
    # No further attempt, even if the conversion would succeed now
    with_fake_dwg2dxf do
      assert_nil RedmineCadPreview::DwgConverter.dxf_for(attachment)
      assert_not File.exist?(RedmineCadPreview::DwgConverter.cache_path(attachment))
    end
  end

  def test_running_conversion_should_not_be_started_again
    attachment = create_cad_attachment('drawing.dwg')
    FileUtils.mkdir_p(RedmineCadPreview::DwgConverter.storage_path)
    FileUtils.touch(RedmineCadPreview::DwgConverter.lock_path(attachment))

    with_fake_dwg2dxf do
      assert_equal :converting, RedmineCadPreview::DwgConverter.state(attachment)
      assert_nil RedmineCadPreview::DwgConverter.dxf_for(attachment)
    end
  end

  def test_interrupted_conversion_lock_should_be_ignored
    attachment = create_cad_attachment('drawing.dwg')
    lock = RedmineCadPreview::DwgConverter.lock_path(attachment)
    FileUtils.mkdir_p(File.dirname(lock))
    FileUtils.touch(lock, :mtime => 1.hour.ago.to_time)

    with_fake_dwg2dxf do
      assert_equal :pending, RedmineCadPreview::DwgConverter.state(attachment)
      assert RedmineCadPreview::DwgConverter.dxf_for(attachment)
    end
  end

  def test_upload_of_dwg_file_should_convert_it_in_the_background
    with_fake_dwg2dxf do
      attachment = create_cad_attachment('drawing.dwg', :convert => true)
      assert_equal :converted, RedmineCadPreview::DwgConverter.state(attachment)
    end
  end

  def test_upload_of_other_file_should_not_schedule_a_conversion
    RedmineCadPreview::DwgConversionJob.expects(:perform_later).never
    with_fake_dwg2dxf do
      create_cad_attachment('model.step', :convert => true)
    end
  end

  def test_conversion_job_with_missing_attachment
    assert_nothing_raised { RedmineCadPreview::DwgConversionJob.perform_now(99999) }
  end

  def test_conversion_should_time_out
    attachment = create_cad_attachment('drawing.dwg')

    with_fake_dwg2dxf(:mode => 'sleep', :timeout => '1') do
      assert_nil RedmineCadPreview::DwgConverter.dxf_for(attachment)
    end
  end

  def test_unavailable_converter
    with_cad_settings('dwg2dxf_command' => '/nonexistent/dwg2dxf') do
      RedmineCadPreview::DwgConverter.reset_availability!
      assert_not RedmineCadPreview::DwgConverter.available?
      assert_nil RedmineCadPreview::DwgConverter.convert('/nonexistent.dwg', '/nonexistent.dxf')
    end
  ensure
    RedmineCadPreview::DwgConverter.reset_availability!
  end

  def test_destroying_the_attachment_should_delete_the_cached_file
    attachment = create_cad_attachment('drawing.dwg')
    path = nil
    with_fake_dwg2dxf do
      path = RedmineCadPreview::DwgConverter.dxf_for(attachment)
    end
    assert File.file?(path)

    File.write(RedmineCadPreview::DwgConverter.failure_path(attachment), '{"attempts":1}')

    attachment.destroy
    assert_not File.exist?(path)
    assert_not File.exist?(RedmineCadPreview::DwgConverter.failure_path(attachment))
  end

  def test_format_of
    assert_equal 'step', RedmineCadPreview.format_of('part.STP')
    assert_equal 'iges', RedmineCadPreview.format_of('part.igs')
    assert_equal 'dwg', RedmineCadPreview.format_of('plan.dwg')
    assert_nil RedmineCadPreview.format_of('readme.txt')
  end

  def test_settings_fallbacks
    with_settings :plugin_redmine_cad_preview => {'formats' => 'invalid', 'max_file_size' => '0'} do
      assert_equal RedmineCadPreview::FORMATS.keys, RedmineCadPreview.enabled_formats
      assert_equal 50.megabytes, RedmineCadPreview.max_file_size
    end
  end
end
