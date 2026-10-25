# frozen_string_literal: true

require 'fileutils'
require 'json'
require 'shellwords'
require 'timeout'

module RedmineCadPreview
  # Converts DWG files to DXF with LibreDWG (dwg2dxf), like the markdownized
  # preview of Redmine converts Office documents with Pandoc.
  #
  # The conversion runs in the background after the upload (see
  # CadPreviewJob). Its state is kept in files next to the converted file:
  #
  #   <digest>_<filesize>.dxf     the converted file
  #   <digest>_<filesize>.failed  the number of failed attempts
  #   <digest>_<filesize>.lock    a conversion is running
  #
  # A failed conversion is attempted at most MAX_ATTEMPTS times, so that
  # opening the preview does not start a new conversion every time.
  module DwgConverter
    MAX_ATTEMPTS = 2

    def self.storage_path
      File.join(Attachment.storage_path, 'derived_cache', 'cad_previews')
    end

    def self.cache_path(attachment)
      File.join(storage_path, "#{attachment.digest}_#{attachment.filesize}.dxf")
    end

    def self.failure_path(attachment)
      cache_path(attachment).sub(/\.dxf\z/, '.failed')
    end

    def self.lock_path(attachment)
      cache_path(attachment).sub(/\.dxf\z/, '.lock')
    end

    # Returns :converted, :converting, :failed or :pending
    def self.state(attachment)
      if File.file?(cache_path(attachment))
        :converted
      elsif locked?(attachment)
        :converting
      elsif failed_attempts(attachment) >= MAX_ATTEMPTS
        :failed
      else
        :pending
      end
    end

    def self.failed_attempts(attachment)
      JSON.parse(File.read(failure_path(attachment)))['attempts'].to_i
    rescue Errno::ENOENT, JSON::ParserError
      0
    end

    # Returns the path of the DXF file converted from the attachment. Converts
    # the file if needed and allowed, and returns nil otherwise.
    def self.dxf_for(attachment)
      case state(attachment)
      when :converted
        cache_path(attachment)
      when :pending
        convert_attachment(attachment)
      end
    end

    def self.convert_attachment(attachment)
      return nil unless available? && File.file?(attachment.diskfile)

      FileUtils.mkdir_p(storage_path)
      lock = lock_path(attachment)
      return nil unless acquire_lock(lock)

      begin
        target = cache_path(attachment)
        if convert(attachment.diskfile, target)
          FileUtils.rm_f(failure_path(attachment))
          target
        else
          record_failure(attachment)
          nil
        end
      ensure
        FileUtils.rm_f(lock)
      end
    end

    def self.convert(source, target)
      return nil unless available? && File.file?(source)

      FileUtils.mkdir_p(File.dirname(target))
      temporary = "#{target}.#{Process.pid}.tmp.dxf"
      # dwg2dxf may exit with an error code for recoverable warnings, so the
      # result is checked by the output file.
      args = command_arguments + ['-y', '-o', temporary, source.to_s]
      status = run(args, 'DWG to DXF conversion')
      unless File.size?(temporary)
        logger.error("DWG to DXF conversion failed (#{status&.exitstatus}):\nCommand: #{args.shelljoin}") if status
        return nil
      end

      File.rename(temporary, target)
      target
    ensure
      FileUtils.rm_f(temporary) if temporary
    end

    # Runs the command with the timeout. Returns the exit status, or nil if
    # the command timed out or could not be run.
    def self.run(args, description)
      pid = nil
      Timeout.timeout(timeout) do
        pid = Process.spawn(*args, out: File::NULL, err: File::NULL, pgroup: true)
        _waited_pid, status = Process.wait2(pid)
        pid = nil
        status
      end
    rescue Timeout::Error
      terminate_process_group(pid)
      logger.error("#{description} timed out:\nCommand: #{args.shelljoin}")
      nil
    rescue StandardError => e
      terminate_process_group(pid)
      logger.error("#{description} failed:\nCommand: #{args.shelljoin}\nException was: #{e.class}: #{e.message}")
      nil
    end
    private_class_method :run

    # Removes the converted file and the state files of the attachment
    def self.delete(attachment)
      FileUtils.rm_f([cache_path(attachment), failure_path(attachment), lock_path(attachment)])
    end

    # Returns true if the configured command can be run. The result is cached
    # for each command, so that changing the command in the settings takes
    # effect immediately.
    def self.available?
      @available ||= {}
      return @available[command] if @available.key?(command)

      @available[command] =
        begin
          _pid, status = Process.wait2(
            Process.spawn(*command_arguments, '--version', out: File::NULL, err: File::NULL)
          )
          status.success?
        rescue SystemCallError, IOError
          false
        end
      logger.warn("DWG converter command (#{command}) not available") unless @available[command]
      @available[command]
    end

    def self.command
      RedmineCadPreview.settings['dwg2dxf_command'].presence || DEFAULT_SETTINGS['dwg2dxf_command']
    end

    def self.timeout
      value = RedmineCadPreview.settings['conversion_timeout'].to_i
      value.positive? ? value : DEFAULT_SETTINGS['conversion_timeout'].to_i
    end

    def self.reset_availability!
      @available = {}
    end

    def self.logger
      Rails.logger
    end

    # A lock older than twice the timeout belongs to a conversion that was
    # interrupted (e.g. by a restart) and is ignored.
    def self.locked?(attachment)
      lock = lock_path(attachment)
      File.file?(lock) && File.mtime(lock) > Time.now - (timeout * 2)
    end
    private_class_method :locked?

    def self.acquire_lock(lock)
      FileUtils.rm_f(lock) if File.file?(lock) && File.mtime(lock) <= Time.now - (timeout * 2)
      File.open(lock, File::WRONLY | File::CREAT | File::EXCL) {|f| f.write(Process.pid.to_s)}
      true
    rescue Errno::EEXIST
      false
    end
    private_class_method :acquire_lock

    def self.record_failure(attachment)
      attempts = failed_attempts(attachment) + 1
      File.write(failure_path(attachment), {'attempts' => attempts, 'failed_at' => Time.now.utc.iso8601}.to_json)
    end
    private_class_method :record_failure

    def self.command_arguments
      Shellwords.split(command)
    end
    private_class_method :command_arguments

    def self.terminate_process_group(pid)
      return unless pid

      Process.kill('KILL', -pid)
      Process.wait(pid)
    rescue Errno::ESRCH, Errno::ECHILD
      nil
    end
    private_class_method :terminate_process_group
  end
end
