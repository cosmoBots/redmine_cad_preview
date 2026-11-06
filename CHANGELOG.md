# Changelog

## v1.2.1 (unreleased)
* feat: saved views of CAD attachments: save the current view under a name and restore it from the toolbar, for 3D models and 2D drawings (#3)
* feat: the default view is restored when the preview is opened, and its image is the thumbnail of the attachment (#3)
* feat: each view is saved with an image without background, cropped to the model or drawing, which can be downloaded with the attachments API of Redmine (#3)
* feat: permissions to save views of own attachments or of all attachments (#3)
* feat: views in Ruby (`RedmineCadPreview::Views`) and with the REST API, with a conflict instead of overwriting a view changed in the meantime (#3)
* feat: macro `{{cad_preview(attachment, view=name, height=520, png)}}` to show the viewer of an attachment in wiki pages, issues and other texts, with a saved view, all views (`view=*`) or the images of the views (#3)
* feat: the macro shows the images of the views in the PDF export, in emails and in Atom feeds, or the thumbnail of the attachment without default view (#3)
* feat: suggestions for the macro in text fields: the CAD attachments of the issue, wiki page or document, then the options, the saved views of the file and heights; Enter closes the macro, Tab adds the next argument (Redmine 6.1 and later) (#3)
* feat: the image of the view is shown until the viewer is ready, so that a page with viewers looks complete before the files are loaded (#3)
* feat: the list of views shows "Changed view" when the view has been changed, and choosing the view again restores it (#3)
* feat: the downloaded PNG and PDF files get the name of the view if the view has not been changed
* feat: the buttons of the toolbar are grouped, and the downloads are aligned to the right
* feat: reverting the migration when the plugin is uninstalled deletes the saved views and the converted DWG files
* perf: the 3D view is rendered only when it changes, instead of continuously, and the viewers of a page are started one after another, so that pages with several viewers stay responsive (#3)
* perf: DXF and DWG drawings are parsed in a worker, so that large drawings do not block the page and the other viewers
* perf: STEP, IGES and BREP files are read in a worker
* perf: large drawings are rendered once when they are loaded or a view is restored, instead of several times, which made the browser report that the page is not responding
* perf: the WebAssembly file of the STEP, IGES and BREP reader is loaded only once, also if the server does not send it as application/wasm
* chore: the plugin has a database migration
* fix: the command of the DWG converter is set in `config/configuration.yml` instead of the plugin settings, so that it cannot be changed in the browser; the settings page shows whether it is available

## v1.1.0 (2026-10-27)
* feat: material (original or matte) and lighting (original or studio) in the toolbar of the 3D viewer, with the defaults in the plugin settings. The studio lighting adds reflections, so that metallic models are not displayed dark. Thanks to Txinto Vaz (cosmoBots) for the contribution (#2)
* feat: JavaScript API for other plugins: `cad-preview:ready` and `cad-preview:error` events, `exportView()`, `restoreView()`, `setProjection()` and `getRenderContext()` (#2)
* feat: other plugins can set the material and lighting of an attachment with `RedmineCadPreview::ViewerOptions.register`
* test: tests of the viewer in `frontend/test`, run in CI

## v1.0.0 (2026-10-25)
* First stable release, with all changes of the versions 0.1.0 to 0.3.0 below
* fix: a test of an Inventor file could fail depending on the order of the tests
* chore: updated GitHub Actions (checkout, setup-node, action-gh-release)

## v0.3.0 (unreleased)
* feat: 3D preview of FreeCAD documents (.FCStd)
* feat: 3D preview of PLY, Collada (.dae), FBX, VRML (.wrl), AMF and 3DS files
* feat: preview image of SolidWorks files (.sldprt, .sldasm, .slddrw)
* fix: Cobertura coverage report for Codecov with Redmine 6.1 and 7.0
* fix: tests with Redmine 6.0, 6.1 and 7.0
* chore: Dependabot checks the libraries of the viewer monthly, and the viewer is rebuilt in its pull requests
* docs: screenshots side by side in the README
* docs: fflate in the third-party notices

## v0.2.0 (unreleased)
* feat: preview image of Solid Edge files (.par, .asm, .psm, .pwd, .dft)
* feat: thumbnails of CAD attachments, from the image saved in the file (Inventor, Solid Edge, 3MF, DXF, DWG) or a snapshot of the viewer
* feat: file icons for 3D models and 2D drawings in the attachment lists (Redmine 7.0 and later)
* feat: notice for 3D solids in DXF and DWG drawings, which cannot be displayed
* fix: fitting of DXF and DWG drawings that are not at the origin
* fix: STL files without normals were displayed black
* chore: no Gemfile anymore, so the plugin can be installed without bundle install
* chore: the release archive contains only the files needed at runtime
* test: Redmine 6.0 in CI

## v0.1.0 (unreleased)
* feat: interactive 3D preview of STEP, IGES, BREP, STL, OBJ, 3MF and glTF/GLB attachments in the browser
* feat: 2D preview of DXF attachments
* feat: preview of DWG attachments, converted to DXF with LibreDWG in the background after the upload
* feat: measuring of the overall dimensions, distances and angles in 3D models and 2D drawings
* feat: download of the current view as PNG or PDF
* feat: maximize the viewer to the browser window (remembered) and full screen
* feat: preview image of Autodesk Inventor files (.ipt, .iam, .ipn, .idw, .ide)
* feat: settings for the previewed formats, the maximum file size and the DWG converter
* feat: translations for 14 languages
