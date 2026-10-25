# frozen_string_literal: true

get 'cad_previews/:id/file', :to => 'cad_previews#file', :id => /\d+/, :as => 'cad_preview_file'
get 'cad_previews/:id/image', :to => 'cad_previews#image', :id => /\d+/, :as => 'cad_preview_image'
get 'cad_previews/:id/dxf', :to => 'cad_previews#dxf', :id => /\d+/, :as => 'cad_preview_dxf'
