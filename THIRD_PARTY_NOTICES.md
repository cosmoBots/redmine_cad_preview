# Third-party software

The plugin itself is licensed under the MIT License (see [LICENSE](LICENSE)).
The files in `assets/` contain the following third-party software, each under
its own license. The license texts are in [licenses/](licenses).

| Software | Version | License | Used for | Source |
| --- | --- | --- | --- | --- |
| [three.js](https://threejs.org/) | 0.186.1 | MIT | 3D viewer, loaders for STL, OBJ, 3MF and glTF | https://github.com/mrdoob/three.js |
| [occt-import-js](https://github.com/kovacsv/occt-import-js) | 0.0.23 | LGPL-2.1 | Reading STEP, IGES and BREP files (WebAssembly) | https://github.com/kovacsv/occt-import-js |
| [Open CASCADE Technology](https://dev.opencascade.org/) | (in occt-import-js) | LGPL-2.1 with exception | CAD kernel of occt-import-js | https://github.com/Open-Cascade-SAS/OCCT |
| [dxf-viewer](https://github.com/vagran/dxf-viewer) | 1.0.50 | MPL-2.0 | DXF viewer | https://github.com/vagran/dxf-viewer |
| [opentype.js](https://opentype.js.org/) | 1.3.4 | MIT | Fonts for texts in DXF drawings | https://github.com/opentypejs/opentype.js |
| [earcut](https://github.com/mapbox/earcut) | 3.2.4 | ISC | Polygon triangulation in dxf-viewer | https://github.com/mapbox/earcut |
| [loglevel](https://github.com/pimterry/loglevel) | (in dxf-viewer) | MIT | Logging in dxf-viewer | https://github.com/pimterry/loglevel |
| [Tabler Icons](https://tabler.io/icons) | 3.49.0 | MIT | Toolbar icons (`assets/images/icons.svg`) | https://github.com/tabler/tabler-icons |
| [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) | 5.3.0 (Fontsource) | OFL-1.1 | Font for texts in DXF drawings | https://github.com/notofonts/latin-greek-cyrillic |

`assets/javascripts/cad_preview.js` is built from the unmodified packages with
esbuild (see `frontend/`). `assets/javascripts/occt-import-js.js` and
`assets/javascripts/occt-import-js.wasm` are the unmodified files of the
occt-import-js package and can be replaced with another build of it.

The DWG converter [LibreDWG](https://www.gnu.org/software/libredwg/) (GPL-3.0)
is not included. It is installed separately on the server and run as an
external command.
