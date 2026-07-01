# MT Point Map GMT

**MT点位图制作工具-GMT** is a cross-platform desktop application for magnetotelluric (MT/AMT/LMT) field-station mapping and GMT-based geophysical figure production.

It turns common GMT plotting workflows into a graphical interface: import TXT/CSV/Excel station tables or recursively scan EDI folders, preview the map, adjust publication-style parameters, and export PNG/PDF plus reproducible GMT scripts.

> 中文名：MT点位图制作工具-GMT  
> Domain: magnetotellurics, geophysics, GMT mapping, EDI data, phase tensor, tipper, apparent resistivity and phase curves.

## Why This Tool

MT field work usually needs many quick maps: station distribution maps, line maps, terrain-backed figures, and paper-ready exports. Writing GMT scripts every time is powerful but repetitive. This app keeps GMT as the rendering engine while providing a desktop UI for routine MT plotting.

## Highlights

- Import TXT, CSV, DAT, TSV, XLSX, and XLS station tables.
- Recursively scan folders for `.edi` files and extract station coordinates plus MT response data.
- Auto-detect station name, longitude, latitude, line, and elevation columns.
- Support longitude/latitude tables and common 3-degree Gauss projected field coordinates.
- Draw MT station maps with labels, symbols, grid, scale bar, and north arrow.
- Add GMT terrain shaded-relief basemaps from online/cache terrain data.
- Import local GMT `.grd`/`.nc` terrain grids as basemaps without downloading terrain data.
- Draw impedance/electric strike maps by period.
- Draw phase tensor ellipses by period.
- Draw Tipper induction vectors with Parkinson/Wiese convention choices.
- Draw apparent-resistivity and phase sounding curves from EDI impedance tensors.
- Preview images inside the app with wheel zoom, box zoom, and drag-to-pan.
- Export PNG, PDF, PNG+PDF, and save reproducible GMT scripts.
- Build distributable macOS and Windows desktop packages.

## Screens and Figure Types

The app currently supports five main plotting modes:

- Station map
- Impedance strike / electric principal axis
- Phase tensor ellipse map
- Tipper / induction vector map
- Apparent resistivity and phase sounding curve

## Input Data

### Station Table

Recommended CSV:

```csv
station,lon,lat,line,elevation
A01,101.23,36.45,L1,1850
A02,101.51,36.62,L1,1878
```

Chinese headers are supported:

```text
测点 经度 纬度 测线 高程
A01 101.23 36.45 L1 1850
A02 101.51 36.62 L1 1878
```

Tables without headers are also accepted. The app tries to infer coordinate columns from numeric ranges.

### Gauss Projected Coordinates

Common field files with 3-degree Gauss projected coordinates are supported:

```text
点号 北向坐标/m 东向坐标/m
线距200 m点距20 m
L3401 38515597.72 4079993.372
L3402 38515597.72 4080013.372
```

Values such as `38515597.72` are interpreted as belt-prefixed Gauss coordinates where appropriate.

### EDI Folder

Use `File > Import EDI Folder` to scan all `.edi` files in a directory and its subfolders. The parser reads station coordinates and MT response arrays when available.

### Local Terrain Grid

In the terrain panel, use **Import Local GRD** to select a GMT grid file:

- `.grd`
- `.nc`

The app uses the selected grid directly with GMT `grdgradient` and `grdimage`, so no online terrain download is required.

## Requirements

- GMT 6.x must be installed and available to the app.
- macOS or Windows for the Electron desktop app.
- Node.js for development/building from source.

The app can detect GMT and offers an installer/download workflow for supported platforms. If GMT is not available, data import and GMT script saving still work, but preview/export rendering needs GMT.

## Development

```bash
npm install
npm start
```

## Tests

```bash
npm run test:node
```

## Build

macOS:

```bash
npm run dist:mac
```

Windows:

```bash
npm run dist:win
```

The project uses Electron Builder and writes release artifacts to `release/`.

## Output

Default output directory:

```text
~/Documents/MT点位图制作工具-GMT输出
```

Typical files:

- `mt_point_map.png`
- `mt_point_map.pdf`
- `mt_point_map.gmt`
- intermediate station and terrain files

## Technology

- Electron desktop app
- GMT command-line rendering
- Node.js data parsing
- XLSX table import
- EDI coordinate and response parsing
- Optional local GMT terrain grids

## Repository Topics

Suggested GitHub topics:

`magnetotelluric`, `gmt`, `geophysics`, `edi`, `phase-tensor`, `tipper`, `apparent-resistivity`, `earth-science`, `electron`, `mapping`

## License

MIT License. See [LICENSE](LICENSE).
