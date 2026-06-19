# Changelog

All notable changes to this project are recorded in this file.

## v0.4.0 - 2026-06-20

- Added an optional GMT earth-relief terrain basemap workflow with selectable 30s, 15s, 03s, and 01s resolutions.
- Added estimated local terrain working-file size before download/preparation so large resolutions are easier to avoid.
- Added terrain preparation progress, pause, resume, cancel, local terrain deletion, GMT earth data cache cleanup, and a remote-data documentation link.
- Added deletion for the current exported map files from inside the app.

## v0.3.9 - 2026-06-20

- Replaced manual color text boxes with preset color dropdowns plus native color pickers for point fill, point border, and station label text.
- Added a selectable export directory that is used by preview, PNG/PDF export, and the GMT script save dialog.
- Remembered the selected export directory across app launches.

## v0.3.8 - 2026-06-19

- Fixed Chinese map titles rendering as mojibake in GMT output by drawing non-ASCII titles with Electron's native font renderer after GMT creates the base map.
- Kept ASCII titles in the pure GMT script path while avoiding GMT title rendering for Chinese text.

## v0.3.7 - 2026-06-19

- Fixed broken in-app preview images by loading generated PNG files through an Electron IPC data URL instead of a `file://` URL.
- Added a visible preview loading error message if the generated image cannot be read.

## v0.3.6 - 2026-06-19

- Stopped generated GMT preview/export scripts from using `gmt end show`, so macOS Preview no longer opens automatically.
- Tightened automatic map regions for small survey lines so station maps do not get excessive empty margins.
- Made the scale bar length adapt to the map width instead of always drawing a 20 km scale bar.
- Matched scale bar unit labels to the adaptive scale length, using meters for small survey maps.
- Defaulted dense projected-coordinate imports to hide station labels for a cleaner first preview while keeping the label toggle available.

## v0.3.5 - 2026-06-19

- Added support for field-survey TXT files with point name plus 3-degree Gauss-Kruger meter coordinates with zone prefixes, such as `点号 北向坐标/m 东向坐标/m`.
- Added GB18030/GBK decoding for Chinese TXT coordinate files.
- Improved whitespace parsing so mixed spaces and tabs are handled as one TXT-style delimiter.
- Improved header detection so descriptive lines like `线距200 m点距20 m` are ignored instead of breaking column recognition.

## v0.3.4 - 2026-06-19

- Fixed GMT detection on macOS when GMT is installed as the official `/Applications/GMT-*.app` bundle.
- Added the detected GMT bin directory to generated scripts and export runs so map output works even when GUI apps do not inherit terminal PATH.
- Added visible feedback for the "重新检测 GMT" button, including the detected version and executable path.
- Fixed GMT 6.5 basemap frame/title syntax by writing the title as a separate `-B+t...` option.
- Replaced modern-mode shorthand `-R -J` with full region/projection options in generated scripts.
- Added `GS_LIB` setup for the Ghostscript bundled inside the official GMT macOS app.

## v0.3.3 - 2026-06-19

- Added visible GMT installer download progress with transferred size, total size, speed, and status.
- Added pause, resume, and cancel controls for GMT installer downloads.
- Changed GMT installer download IPC so the UI receives progress events instead of waiting silently.

## v0.3.2 - 2026-06-19

- Fixed the packaged app rendering bug where JavaScript source text could appear above the interface.
- Changed the Electron renderer loading path to inline CSS and renderer code from the main process.
- Removed the runtime dependency on the preload bridge for the visible UI.

## v0.3.1 - 2026-06-19

- Changed the GMT install button to directly download the official GMT installer for the current system.
- Added download failure handling so network or GitHub access problems show a clear message.
- Kept official GMT documentation links as secondary help instead of relying on them for the main install action.

## v0.3.0 - 2026-06-19

- Added a cross-platform Electron implementation for macOS and Windows distribution.
- Added native file import, station parsing, GMT script generation, preview/export commands, and cross-platform output path handling in the Electron app.
- Added packaging configuration for macOS `.app`/DMG and Windows portable/installer builds.
- Kept the Python prototype for development reference, but made Electron the recommended distributable app route.

## v0.2.0 - 2026-06-19

- Replaced the distributable macOS app runtime with a native SwiftUI implementation.
- Removed Tk from the delivered `.app` launch path so the app can run on Macs where Tk fails.
- Kept GMT script generation, TXT/CSV import, station labels, point styling, grid, scale bar, north arrow, and PNG/PDF export in the native app.

## v0.1.1 - 2026-06-19

- Added a repeatable macOS `.app` bundle builder.
- Adjusted runtime paths so exported maps go to `~/Documents/MT点位图制作工具—GMT输出`.
- Prepared the tool for double-click launch from a copied app bundle.

## v0.1.0 - 2026-06-19

- Initial tracked release of `MT点位图制作工具—GMT`.
- Added TXT/CSV station import with automatic station, longitude, and latitude detection.
- Added GMT script generation, preview/export workflow, label controls, point styling, grid, scale bar, and north arrow options.
- Added sample station data and Chinese usage documentation.
