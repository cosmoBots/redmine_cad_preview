# Redmine CAD Preview Plugin

[![build](https://github.com/flowalchs/redmine_cad_preview/actions/workflows/build.yml/badge.svg)](https://github.com/flowalchs/redmine_cad_preview/actions/workflows/build.yml)
[![Last release](https://img.shields.io/github/v/release/flowalchs/redmine_cad_preview?label=latest%20release&logo=github&style=flat-square)](https://github.com/flowalchs/redmine_cad_preview/releases/latest)
[![Rate at redmine.org](http://img.shields.io/badge/rate%20at-redmine.org-blue.svg?style=flat-square)](https://www.redmine.org/plugins/redmine_cad_preview)
[![Redmine](https://img.shields.io/badge/redmine->=6.0-blue?logo=redmine&logoColor=%23B32024&labelColor=f0f0f0)](https://www.redmine.org)
[![codecov](https://codecov.io/gh/flowalchs/redmine_cad_preview/graph/badge.svg)](https://codecov.io/gh/flowalchs/redmine_cad_preview)

This plugin shows CAD attachments directly in Redmine: 3D models can be rotated, zoomed and panned, 2D drawings can be zoomed and panned. Instead of "No preview available", the attachment page shows an interactive viewer for issues, documents, files and wiki pages.

## 🧠 How it works

- **In the browser**: The files are displayed by a viewer that runs in the browser (three.js, OpenCASCADE as WebAssembly, dxf-viewer). The libraries are included in the plugin, so no internet access is needed.
- **Files stay in Redmine**: The browser loads the file from Redmine with the same permissions as a download. No file is sent to a third party.
- **DWG on the server**: DWG files are converted to DXF on the server with [LibreDWG](https://www.gnu.org/software/libredwg/). The conversion runs in the background right after the upload, so the preview is ready when it is opened.

## 🌟 Features

- **3D preview** – STEP (.step, .stp), IGES (.iges, .igs), BREP (.brep, .brp), STL, OBJ, 3MF, glTF (.gltf, .glb)
- **2D preview** – DXF, and DWG converted to DXF
- **Viewer controls** – Rotate, zoom, pan, fit to view, wireframe
- **Background conversion of DWG files** – Started after the upload. A failed conversion is attempted at most twice, so opening the preview does not start a new conversion every time.
- **Settings** – Previewed formats, maximum file size, DWG converter command and timeout
- **No migration and no additional gems**

## ⚙️ Plugin Configuration

Configure the plugin under **Administration → Plugins → Redmine CAD Preview → Configure**:

| Setting                       | Description                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- |
| Previewed formats             | Formats shown in the viewer (default: all)                                  |
| Maximum file size             | Larger files are not previewed, as large models need a lot of memory in the browser (default: 50 MB) |
| dwg2dxf command (LibreDWG)    | Command of the DWG converter, e.g. `/usr/local/bin/dwg2dxf` (default: `dwg2dxf`) |
| Conversion timeout            | Maximum time of a DWG conversion in seconds (default: 30)                   |

The settings page shows whether the DWG converter is available. Without it, DWG files are not previewed, and all other formats still work.

## 📐 DWG conversion with LibreDWG

LibreDWG is installed separately on the server. It is not included in the plugin. On Ubuntu 24.04, there is no package for it, so it is built from source:

```bash
sudo apt-get install build-essential
curl -LO https://ftp.gnu.org/gnu/libredwg/libredwg-0.14.tar.xz
tar xf libredwg-0.14.tar.xz
cd libredwg-0.14
./configure --prefix=/usr/local --disable-bindings --disable-python --disable-docs
make -j"$(nproc)"
sudo make install
sudo ldconfig
dwg2dxf --version
```

The converted files are stored in `files/derived_cache/cad_previews` and deleted together with the attachment.

The conversion runs as an Active Job. With the default queue adapter of Redmine, it runs in the background of the Redmine process.

## ⚠️ Limitations

- **DWG**: LibreDWG reads older DWG versions well. Newer DWG versions (2018 and later) are only partly supported, e.g. some texts may be missing.
- **glTF**: `.gltf` files that reference external `.bin` or texture files are not supported. Use `.glb` instead.
- **Large models**: STEP and IGES files are converted to triangles in the browser. Very large models can take a while and need a lot of memory.
- **Autodesk Inventor** (.ipt, .iam) is not supported. Export the model as STEP from Inventor to preview it.

## 📋 Requirements

- **Redmine**: 6.0 or higher
- **Ruby**: as required by your Redmine version (tested with 3.2 – 4.0)
- **Database**: MySQL or PostgreSQL
- **Browser**: with WebGL and WebAssembly support (all current browsers)
- **Optional**: LibreDWG for the preview of DWG files

## 🚀 Installation

```bash
cd $REDMINE_ROOT/plugins
git clone https://github.com/flowalchs/redmine_cad_preview.git
```
Restart your Redmine server to load the plugin. No database migration is needed.

## 🧪 Tests

```bash
cd $REDMINE_ROOT
bundle exec rake redmine:plugins:test NAME=redmine_cad_preview RAILS_ENV=test
```

The tests use a stand-in for `dwg2dxf` (`test/support/fake_dwg2dxf`), so LibreDWG is not needed to run them.

## 🛠️ Development

The viewer is built from the sources in `frontend/` into `assets/`. The built files are included in the repository, so users do not need Node.js.

```bash
cd frontend
npm ci
npm run build
```

## ❌ Uninstall

Remove the directory `plugins/redmine_cad_preview` and restart your Redmine server. The converted DWG files in `files/derived_cache/cad_previews` can be deleted.

## 📜 License

MIT License. The included third-party libraries have their own licenses, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
