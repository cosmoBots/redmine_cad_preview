# frozen_string_literal: true

module RedmineCadPreview
  # Optional integrations supply defaults without replacing the viewer or
  # teaching it about specific domains. Values are always allow-listed.
  module ViewerOptions
    DEFAULTS = { 'material_mode' => 'original', 'lighting' => 'studio' }.freeze
    CHOICES = { 'material_mode' => %w[original matte], 'lighting' => %w[studio original] }.freeze

    def self.register(key, &provider)
      providers[key.to_sym] = provider
    end

    def self.for(attachment)
      options = DEFAULTS.merge(RedmineCadPreview.settings.slice(*DEFAULTS.keys))
      providers.each_value { |provider| options.merge!(provider.call(attachment).stringify_keys.slice(*DEFAULTS.keys)) }
      CHOICES.to_h { |key, choices| [key, choices.include?(options[key]) ? options[key] : DEFAULTS.fetch(key)] }
    end

    def self.providers
      @providers ||= {}
    end
    private_class_method :providers
  end
end
