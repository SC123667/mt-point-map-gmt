# Changelog

All notable changes to this project are recorded in this file.

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
