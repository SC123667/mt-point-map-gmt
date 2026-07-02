# Changelog

All notable changes to this project are recorded in this file.

## Unreleased

## v0.9.14 - 2026-07-03

- Reworked the workbench toolbar into overlay command menus so future features can be added under Data, Mapping, Layers, Labels, Export, or Tools without crowding the main interface.
- Kept MT plot selection and period selection visible while moving secondary commands into lightweight floating menus with outside-click and Escape dismissal.

## v0.9.13 - 2026-07-03

- Reworked the main UI into a grouped MT/GMT workbench toolbar for Data, Mapping, Layers, Labels, Export, and Tools while keeping the preview as the primary workspace.
- Added platform-specific UI polish: lighter macOS glass-style chrome and steadier Windows/Fluent-style controls with clearer focus and hover states.
- Added status-bar runtime feedback for GMT detection, terrain preparation, preview/export progress, cache operations, and output location.
- Added GMT cache management and workbench layout reset menu entries, plus consistent weak-danger styling for destructive cleanup actions.

## v0.9.12 - 2026-07-03

- Fixed EDI directory imports that could fail with `import-worker.js 后台任务异常结束：退出码 0` when the worker exited before a large IPC result finished transferring.
- Added bulk EDI import worker coverage so large multi-period EDI results are returned before the worker disconnects.

## v0.9.11 - 2026-07-03

- Added original table-row coordinate validation so the quality panel can count mapped source rows with invalid, placeholder, or out-of-range coordinates.
- Added terrain cache deletion for the current map range and resolution while keeping the existing resolution-wide cache cleanup.
- Added draggable preview handles for the scale bar and north arrow, with custom positions written into GMT scripts and project files.
- Added regression coverage for custom scale-bar and north-arrow GMT positions.

## v0.9.10 - 2026-07-03

- Added a legend item order control so station symbols can appear before or after MT/structural overlay entries.
- Added regression coverage for overlay-first legend generation.

## v0.9.9 - 2026-07-03

- Added `.mtgmt` project save/open support for restoring imported data, filters, terrain settings, structural overlays, legend settings, and plotting parameters.
- Added a data quality panel with counts for duplicate station names, duplicate coordinates, invalid coordinates, missing MT responses, out-of-frame stations, and exportable skipped-EDI lists.
- Added large-dataset plotting filters by survey line, station-name prefix, current map region, and MT-response availability while preserving the full imported dataset.
- Added cancellable GMT preview/export rendering with stage progress messages surfaced in the preview area.
- Added terrain cache management by cached resolution, plus first-pass plotting presets for paper, field, terrain, structural-line, and phase-tensor workflows.
- Added finer label and map-element controls, including MT-only/prefix/every-N station labels and selectable scale-bar/north-arrow corners.

## v0.9.8 - 2026-07-03

- Moved large point/Excel/EDI imports, field remapping, and structural-line summaries into an isolated import worker so thousand-file datasets do not block the Electron main process.
- Moved GMT preview/export rendering into an isolated worker, including large station table generation, overlay file generation, and Windows ASCII workspace handling.
- Added reusable Windows terrain input caching so large local GRD/shade files are not copied again for every preview/export when the source file has not changed.
- Replaced Base64 preview image transfer and native-title image embedding with local file URL loading to reduce high-DPI PNG memory pressure.
- Added worker smoke tests for large station rendering and background import paths, and adjusted auto-preview debounce timing for multi-thousand-station datasets.

## v0.9.7 - 2026-07-03

- Moved high-resolution SRTM terrain preparation into an isolated worker process so large basemap jobs no longer run inside the Electron main process.
- Reworked SRTM XYZ generation to stream buffered chunks with backpressure instead of pushing very large text output through uncontrolled writes.
- Added SRTM worker smoke coverage to verify terrain worker startup, grid generation handoff, and shade generation handoff.

## v0.9.6 - 2026-07-03

- Removed the hard terrain-size safety stop so large SRTM basemap preparation can continue after showing a performance warning.
- Restored basemap previews to the selected terrain resolution instead of silently downgrading preview terrain.
- Removed the SRTM XYZ point cap that could stop high-resolution terrain preparation after downloads had started.

## v0.9.5 - 2026-07-03

- Added fast low-resolution PNG previews while keeping high-resolution terrain and DPI settings for formal exports.
- Reused existing terrain grid and shade cache files before starting another GMT terrain download/preparation task.
- Added a PNG export DPI dialog so manual PNG exports can set raster resolution before running GMT.

## v0.9.4 - 2026-07-03

- Added Windows/Linux in-app window controls for minimize, close, and exiting fullscreen when native window chrome is hidden.
- Added fullscreen-safe shortcuts: `F11` toggles fullscreen, `Esc` exits fullscreen, and `Ctrl+W` closes the window on Windows.
- Synced renderer window-control visibility with Electron fullscreen state so the escape control appears only when needed.

## v0.9.3 - 2026-07-03

- Replaced the Windows setup install section with a safe legacy-cleanup path that does not call the old installed uninstaller during updates.
- Added installer-side removal of stale per-user install directories and uninstall registry entries before extracting the new app.
- Strengthened the Windows install-repair batch file so it can remove stale install folders and matching uninstall entries before launching setup.

## v0.9.2 - 2026-07-03

- Strengthened the Windows installer update path so hidden residual processes are closed by executable name, executable path, and command-line match before installing.
- Added an early installer cleanup hook to reduce false "please close the app" failures when no app window is visible.
- Updated the Windows install-repair batch file to use the same broader cleanup before launching the setup program.

## v0.9.1 - 2026-07-03

- Fixed Windows update installs by adding an installer hook that closes old `MTPointMapGMT.exe` processes before overwriting the app.
- Added compatibility handling for older Windows builds that may still use the Chinese executable name during updates.

## v0.9.0 - 2026-07-03

- Added a terrain download-source selector with the USTC China GMT mirror as the default, plus official and custom server options.
- Added EPS vector export and an all-formats export path for PNG, vector PDF, and EPS.
- Kept PDF/EPS export on the GMT vector pipeline instead of rasterizing the rendered PNG into vector files.
- Added configurable PNG DPI for GMT raster export.
- Updated saved GMT scripts so they can generate PNG, PDF, and EPS outputs with the selected PNG DPI and terrain data server.

## v0.8.1 - 2026-07-03

- Refined the preview-first workspace with macOS-style translucent glass panels, softer depth, and a more polished toolbar.
- Added clearer hover, active, and keyboard-focus states for compact plot tabs, module buttons, forms, dialogs, and preview controls.
- Improved the preview canvas, status bar, table styling, and scrollbars while keeping the workflow and control density unchanged.

## v0.8.0 - 2026-07-03

- Redesigned the workspace around a large preview-first canvas with compact Photoshop-style module buttons in the top toolbar.
- Moved data, field mapping, MT response fields, frame, terrain, overlay/legend, symbol, label, element, and MT plot settings into separate confirmation dialogs.
- Moved all export actions and output-directory selection out of the main UI and into `File > Export`.
- Added automatic preview rendering after data import, plot-type switching, and confirmed settings changes, removing the main `Generate Preview` button.
- Moved the output directory and app version into a bottom status bar, and moved GMT detection/install controls into a dedicated desktop `GMT` menu.
- Added internal preview padding so rendered maps do not sit too close to the preview frame.

## v0.7.2 - 2026-07-02

- Replaced the visible text legend drag handle with a small unlabeled control point so the preview no longer appears to contain a second legend box.
- Kept the drag handle as preview-only UI; exported GMT maps are unchanged.

## v0.7.1 - 2026-07-02

- Fixed legend entries so station symbols follow the selected point shape, size, fill color, and border color instead of always using a red circle.
- Added plot-type legend entries for strike, phase tensor, and tipper maps, with strike legend color matching the plotted strike line.
- Added editable legend entry labels for the station item and the active MT overlay item.

## v0.7.0 - 2026-07-02

- Added editable legend styling for width, title size, label size, text color, background color, background transparency, border color, and border width.
- Added an in-preview draggable legend handle that writes back to GMT normalized legend coordinates.
- Added debounced automatic PNG preview regeneration for legend and structural-line overlay changes, with queued refreshes when GMT is already rendering.

## v0.6.1 - 2026-07-02

- Mark the current preview as stale when overlay or legend settings change, so users know to regenerate the map before expecting the legend to appear.

## v0.6.0 - 2026-07-02

- Added compact structural-line overlays for GMT multi-segment, BLN, and simple longitude/latitude files, with per-file color control.
- Added optional GMT legend generation for station points and imported structural-line layers.
- Kept the interface compact by placing overlays and legend controls inside a collapsible parameter section instead of adding another top-level plot tab.
- Added regression coverage for fault parsing, overlay data generation, legend specs, and generated GMT script wiring.
- Prepared the project for public GitHub distribution with a bilingual README, repository metadata, and an explicit MIT license file.
- Added Chinese/English parallel public documentation and package description for GitHub exposure.

## v0.5.8 - 2026-07-01

- Added local `.grd` terrain import in the terrain basemap panel, with controls to choose or clear a local GMT grid file.
- Routed local terrain grids directly into GMT `grdgradient`/`grdimage`, avoiding online terrain downloads while still producing shaded relief.
- Preserved Windows export reliability by copying local terrain grids into the ASCII temporary GMT workspace before rendering.

## v0.5.7 - 2026-06-29

- Added drag-to-pan behavior after a preview has been zoomed, so enlarged maps and MT curves can be moved left, right, up, and down inside the preview area.
- Reduced mouse-wheel zoom sensitivity for smoother preview zooming while keeping Shift-drag available for additional box zooming after a view is already enlarged.

## v0.5.6 - 2026-06-29

- Added interactive preview zooming: when the pointer is over the preview area, mouse-wheel scrolling zooms the generated map or MT curve without rerunning GMT.
- Added drag-box local magnification in the preview area, plus an in-preview zoom readout and fit-reset control.

## v0.5.5 - 2026-06-28

- Fixed the MT apparent-resistivity/phase curve layout by drawing the phase panel at the page base and placing the resistivity panel above it, preventing GMT from clipping the lower phase subplot.
- Kept the discrete square-marker rho/phase style and error-bar overlays unchanged while giving the two panels a stable vertical layout.

## v0.5.4 - 2026-06-28

- Reworked the in-app preview renderer to place generated PNGs as a contained preview-panel background, avoiding Electron image-element clipping when MT sounding-curve figures are taller than the viewport.
- Cleared stale preview backgrounds whenever placeholders or read errors are shown, so switching plot types cannot leave an old image behind.

## v0.5.3 - 2026-06-28

- Strengthened preview image fitting by making the rendered PNG fill the preview viewport with `object-fit: contain`, preventing MT curve previews from being displayed by width only.
- Replaced the previously copied app after quitting any running old instance, so reopening the app loads the updated preview code.

## v0.5.2 - 2026-06-28

- Fixed in-app preview scaling so tall MT sounding-curve figures fit completely inside the preview panel instead of being clipped vertically.
- Kept exported PNG/PDF resolution unchanged; only the renderer preview sizing was adjusted.

## v0.5.1 - 2026-06-28

- Changed MT sounding curves from connected lines to discrete red/green square markers matching common MT apparent-resistivity and phase curve style.
- Switched the response-curve x axis to reversed `log10 frequency (Hz)` instead of `log10 Period (s)`.
- Parsed EDI `ZXY.VAR` and `ZYX.VAR` arrays and used them to draw approximate black vertical error bars when available.
- Added light grid lines and adjusted curve plot margins so axis labels are not clipped.
- Made the in-app preview area scrollable so tall curve figures display fully inside the software.

## v0.5.0 - 2026-06-28

- Redesigned the app into a professional workbench layout with top analysis tabs for station maps, impedance strike, phase tensor ellipses, tipper vectors, and apparent-resistivity/phase curves.
- Added EDI impedance/tipper response parsing across all periods, including `ZXX/ZXY/ZYX/ZYY` real/imaginary arrays and `TX/TY` tipper arrays.
- Added Excel `.xlsx/.xls` table import and manual MT column mapping for period/frequency, impedance tensor, tipper, provided strike, phase-tensor axes, and beta/skew columns.
- Added GMT overlay generation for electric/impedance strike segments, phase tensor ellipses colored by beta, Parkinson/Wiese tipper arrows, and single-station rho/phase curves.
- Added in-app table-format help and clearer messages when MT-specific plots are requested from coordinate-only data.

## v0.4.6 - 2026-06-28

- Changed the Windows internal executable name to `MTPointMapGMT.exe` while keeping the Chinese app title, avoiding NSIS installer close-detection problems with the previous Chinese executable name.
- Added a Windows install-repair batch file that closes old MT Point Map GMT processes before starting the x64 installer.
- Kept installer and portable build names unchanged for user-facing distribution.

## v0.4.5 - 2026-06-28

- Fixed Windows GMT export failures when the output directory contains Chinese characters by running GMT in an ASCII temporary workspace and copying completed files back afterward.
- Changed generated Windows GMT scripts to use relative station files and output names, avoiding Ghostscript failures on non-ASCII absolute paths.
- Made saved Windows `.bat` scripts switch to their own folder before running so double-click execution is more reliable.

## v0.4.4 - 2026-06-20

- Added a terrain-resolution safety guard that blocks oversized high-resolution SRTM basemaps before they can freeze or crash the app.
- Added clearer terrain-size warnings with recommended coarser resolutions when the selected map range is too large.
- Added a defensive SRTM conversion limit so very large grids stop with an explanation instead of locking the Electron main process.

## v0.4.3 - 2026-06-20

- Moved data import actions into the desktop menu under `文件 > 导入`, with separate TXT/CSV and EDI-folder import entries.
- Removed the crowded import buttons from the left data panel for a cleaner professional layout.
- Added menu entries for opening sample data and choosing the export directory.
- Generalized no-data prompts so they apply to both table imports and EDI folder imports.

## v0.4.2 - 2026-06-20

- Added EDI folder import with recursive scanning of subfolders for `.edi` files.
- Extracted station coordinates from `LAT/LONG` or fallback `REFLAT/REFLONG` fields, including degree-minute-second values.
- Used EDI file names as station names and skipped placeholder `0/0` coordinates with a visible import summary.
- Added a Node regression test for EDI coordinate parsing and invalid-coordinate rejection.

## v0.4.1 - 2026-06-20

- Switched 1m, 30s, 15s, 3s, and 1s terrain basemap preparation to direct SRTM HGT downloads, avoiding the GMT App JP2/OpenJPEG failure path on high-resolution earth-relief data.
- Added SRTM tile download, pause, resume, cancel, decompression, cropping, GMT grid generation, and shaded-relief generation inside the existing terrain workflow.
- Updated terrain resolution labels and size estimates so high-resolution options show realistic SRTM download and cache sizes.
- Made GMT script saving prepare the local terrain grid first when a terrain basemap is enabled.

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
