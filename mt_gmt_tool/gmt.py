from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

from .data import StationRecord


@dataclass
class PlotConfig:
    title: str = "MT Survey Stations"
    region: str = ""
    projection: str = "M16c"
    frame: str = "af"
    show_grid: bool = True
    show_labels: bool = True
    show_scale: bool = True
    show_north_arrow: bool = True
    point_symbol: str = "c"
    point_size_cm: float = 0.22
    point_fill: str = "#d7191c"
    point_pen_width: float = 0.35
    point_pen_color: str = "black"
    label_font_size: float = 8.0
    label_color: str = "black"
    label_dx_cm: float = 0.08
    label_dy_cm: float = 0.08
    coast_resolution: str = "i"
    land_fill: str = "gray95"
    water_fill: str = "white"
    coast_pen: str = "0.25p,gray45"
    output_name: str = "mt_point_map"


class GmtError(RuntimeError):
    """Raised when GMT is unavailable or returns an error."""


def gmt_available() -> bool:
    return shutil.which("gmt") is not None


def auto_region(records: Sequence[StationRecord], padding_ratio: float = 0.12, min_padding: float = 0.03) -> str:
    if not records:
        raise ValueError("没有点位，无法计算绘图范围。")
    lons = [record.lon for record in records]
    lats = [record.lat for record in records]
    west, east = min(lons), max(lons)
    south, north = min(lats), max(lats)
    lon_pad = max((east - west) * padding_ratio, min_padding)
    lat_pad = max((north - south) * padding_ratio, min_padding)
    return f"{west - lon_pad:.6f}/{east + lon_pad:.6f}/{south - lat_pad:.6f}/{north + lat_pad:.6f}"


def write_gmt_inputs(records: Sequence[StationRecord], output_dir: str | Path) -> Tuple[Path, Path]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    points_path = out / "stations_points.tsv"
    labels_path = out / "stations_labels.tsv"

    points_lines = [f"{record.lon:.8f}\t{record.lat:.8f}\t{record.name}" for record in records]
    labels_lines = [f"{record.lon:.8f}\t{record.lat:.8f}\t{record.name}" for record in records]
    points_path.write_text("\n".join(points_lines) + "\n", encoding="utf-8")
    labels_path.write_text("\n".join(labels_lines) + "\n", encoding="utf-8")
    return points_path, labels_path


def build_script(
    records: Sequence[StationRecord],
    config: PlotConfig,
    output_dir: str | Path,
    formats: Iterable[str] = ("png",),
) -> str:
    out = Path(output_dir)
    points_path, labels_path = write_gmt_inputs(records, out)
    region = config.region.strip() or auto_region(records)
    frame = config.frame.strip() or "af"
    grid_prefix = "g" if config.show_grid else ""
    output_prefix = out / config.output_name
    fmt = ",".join(formats)
    point_size = f"{config.point_size_cm:.3f}c"
    point_pen = f"{config.point_pen_width:.3f}p,{config.point_pen_color}"
    label_font = f"{config.label_font_size:.1f}p,Helvetica,{config.label_color}"
    offset = f"{config.label_dx_cm:.3f}c/{config.label_dy_cm:.3f}c"

    lines: List[str] = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        f"gmt begin {quote(str(output_prefix))} {quote(fmt)}",
        "  gmt set MAP_FRAME_TYPE plain FONT_ANNOT_PRIMARY 9p FONT_LABEL 10p FORMAT_GEO_MAP ddd:mm:ssF",
        f"  gmt basemap -R{region} -J{config.projection} -B{grid_prefix}{frame}+t{quote(config.title)}",
        (
            f"  gmt coast -R -J -D{config.coast_resolution} "
            f"-G{quote(config.land_fill)} -S{quote(config.water_fill)} -W{quote(config.coast_pen)}"
        ),
        (
            f"  gmt plot {quote(str(points_path))} -R -J "
            f"-S{config.point_symbol}{point_size} -G{quote(config.point_fill)} -W{quote(point_pen)}"
        ),
    ]
    if config.show_labels:
        lines.append(
            f"  gmt text {quote(str(labels_path))} -R -J -F+f{quote(label_font)}+jLB -D{offset}"
        )
    if config.show_scale:
        lines.append("  gmt basemap -R -J -LjBR+w20k+o0.5c/0.5c+f+lkm")
    if config.show_north_arrow:
        lines.append("  gmt basemap -R -J -TdjTR+w1.0c+o0.4c/0.4c")
    lines.extend(["gmt end show", ""])
    return "\n".join(lines)


def save_script(script: str, output_dir: str | Path, output_name: str = "mt_point_map") -> Path:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    script_path = out / f"{output_name}.gmt"
    script_path.write_text(script, encoding="utf-8")
    script_path.chmod(0o755)
    return script_path


def run_gmt_script(script: str, output_dir: str | Path, output_name: str = "mt_point_map") -> Path:
    if not gmt_available():
        raise GmtError("未找到 GMT 命令。请先安装 GMT 6，例如：brew install gmt")
    script_path = save_script(script, output_dir, output_name)
    result = subprocess.run(
        ["/bin/bash", str(script_path)],
        cwd=str(Path(output_dir)),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise GmtError((result.stderr or result.stdout or "GMT 执行失败。").strip())
    return script_path


def quote(value: str) -> str:
    if not value:
        return "''"
    safe = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_+-./:=,#")
    if all(char in safe for char in value):
        return value
    return "'" + value.replace("'", "'\"'\"'") + "'"
