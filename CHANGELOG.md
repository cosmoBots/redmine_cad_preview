# Changelog

## v0.2.0 (unreleased)
* feat: 3D preview of FreeCAD documents (.FCStd)
* feat: 3D preview of PLY, Collada (.dae), FBX, VRML (.wrl), AMF and 3DS files
* feat: preview image of Solid Edge files (.par, .asm, .psm, .pwd, .dft)
* feat: preview image of SolidWorks files (.sldprt, .sldasm, .slddrw)
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
