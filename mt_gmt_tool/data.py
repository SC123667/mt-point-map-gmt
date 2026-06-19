from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


@dataclass(frozen=True)
class FieldMapping:
    name: Optional[str]
    lon: str
    lat: str
    line: Optional[str] = None
    elevation: Optional[str] = None


@dataclass(frozen=True)
class StationRecord:
    name: str
    lon: float
    lat: float
    line: str = ""
    elevation: Optional[float] = None
    raw: Dict[str, str] = None


@dataclass(frozen=True)
class ParsedTable:
    path: Path
    columns: List[str]
    rows: List[Dict[str, str]]
    mapping: FieldMapping
    records: List[StationRecord]
    has_header: bool


NAME_HINTS = ("station", "site", "name", "point", "id", "no", "测点", "点号", "站点", "编号", "名称")
LON_HINTS = ("lon", "lng", "long", "longitude", "x", "经度", "东经")
LAT_HINTS = ("lat", "latitude", "y", "纬度", "北纬")
LINE_HINTS = ("line", "profile", "surveyline", "测线", "剖面", "线号")
ELEVATION_HINTS = ("elev", "alt", "height", "z", "高程", "海拔")


class DataParseError(ValueError):
    """Raised when a station file cannot be parsed into point records."""


def parse_station_file(path: str | Path) -> ParsedTable:
    file_path = Path(path)
    text = _read_text(file_path)
    rows = _split_rows(text)
    if not rows:
        raise DataParseError("文件为空，未读取到点位数据。")

    has_header = _looks_like_header(rows)
    if has_header:
        columns = _dedupe_columns([cell.strip() or f"col{i + 1}" for i, cell in enumerate(rows[0])])
        data_rows = rows[1:]
    else:
        width = max(len(row) for row in rows)
        columns = [f"col{i + 1}" for i in range(width)]
        data_rows = rows

    dict_rows = [_row_to_dict(columns, row) for row in data_rows if any(cell.strip() for cell in row)]
    if not dict_rows:
        raise DataParseError("文件里没有可用的数据行。")

    mapping = detect_mapping(columns, dict_rows, has_header)
    records = build_records(dict_rows, mapping)
    if not records:
        raise DataParseError("未能从文件中解析出有效经纬度点位。")

    return ParsedTable(
        path=file_path,
        columns=columns,
        rows=dict_rows,
        mapping=mapping,
        records=records,
        has_header=has_header,
    )


def detect_mapping(columns: Sequence[str], rows: Sequence[Dict[str, str]], has_header: bool = True) -> FieldMapping:
    lon = _first_hint(columns, LON_HINTS) if has_header else None
    lat = _first_hint(columns, LAT_HINTS) if has_header else None
    name = _first_hint(columns, NAME_HINTS) if has_header else None
    line = _first_hint(columns, LINE_HINTS) if has_header else None
    elevation = _first_hint(columns, ELEVATION_HINTS) if has_header else None

    if not lon or not lat:
        numeric_cols = _numeric_columns(columns, rows)
        lon, lat = _guess_lon_lat(numeric_cols, rows)

    if not name:
        name = _guess_name_column(columns, rows, lon, lat)

    if not lon or not lat:
        raise DataParseError("无法自动识别经度和纬度列，请检查表头或数据列顺序。")

    return FieldMapping(name=name, lon=lon, lat=lat, line=line, elevation=elevation)


def build_records(rows: Sequence[Dict[str, str]], mapping: FieldMapping) -> List[StationRecord]:
    records: List[StationRecord] = []
    for index, row in enumerate(rows, start=1):
        lon = _to_float(row.get(mapping.lon, ""))
        lat = _to_float(row.get(mapping.lat, ""))
        if lon is None or lat is None:
            continue
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            continue

        name_value = row.get(mapping.name, "") if mapping.name else ""
        name = name_value.strip() or f"MT{index:03d}"
        line = row.get(mapping.line, "").strip() if mapping.line else ""
        elevation = _to_float(row.get(mapping.elevation, "")) if mapping.elevation else None
        records.append(
            StationRecord(
                name=name,
                lon=lon,
                lat=lat,
                line=line,
                elevation=elevation,
                raw=dict(row),
            )
        )
    return records


def _read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _split_rows(text: str) -> List[List[str]]:
    clean_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith(("#", "//", ";"))
    ]
    if not clean_lines:
        return []

    sample = "\n".join(clean_lines[:20])
    if any(mark in sample for mark in (",", "\t", ";")):
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
            reader = csv.reader(clean_lines, dialect)
            return [[cell.strip() for cell in row] for row in reader]
        except csv.Error:
            pass

    return [re.split(r"\s+", line.strip()) for line in clean_lines]


def _looks_like_header(rows: Sequence[Sequence[str]]) -> bool:
    first = rows[0]
    first_numeric = sum(_to_float(cell) is not None for cell in first)
    if len(rows) == 1:
        return first_numeric < max(2, len(first) // 2)
    second = rows[1]
    second_numeric = sum(_to_float(cell) is not None for cell in second)
    return first_numeric < 2 and second_numeric >= 2


def _dedupe_columns(columns: Sequence[str]) -> List[str]:
    seen: Dict[str, int] = {}
    output: List[str] = []
    for column in columns:
        key = column.strip() or "col"
        count = seen.get(key, 0)
        seen[key] = count + 1
        output.append(key if count == 0 else f"{key}_{count + 1}")
    return output


def _row_to_dict(columns: Sequence[str], row: Sequence[str]) -> Dict[str, str]:
    result = {column: "" for column in columns}
    for column, value in zip(columns, row):
        result[column] = value.strip()
    return result


def _normalized(value: str) -> str:
    return re.sub(r"[\s_\-()（）/\\]+", "", value.strip().lower())


def _first_hint(columns: Sequence[str], hints: Iterable[str]) -> Optional[str]:
    normalized_hints = tuple(_normalized(hint) for hint in hints)
    for column in columns:
        col = _normalized(column)
        if any(hint == col or hint in col for hint in normalized_hints):
            return column
    return None


def _numeric_columns(columns: Sequence[str], rows: Sequence[Dict[str, str]]) -> List[str]:
    output: List[str] = []
    for column in columns:
        values = [_to_float(row.get(column, "")) for row in rows[:20]]
        valid = [value for value in values if value is not None]
        if len(valid) >= max(2, len(rows[:20]) // 2):
            output.append(column)
    return output


def _guess_lon_lat(numeric_cols: Sequence[str], rows: Sequence[Dict[str, str]]) -> Tuple[Optional[str], Optional[str]]:
    candidates: List[Tuple[int, str, str]] = []
    for lon_col in numeric_cols:
        for lat_col in numeric_cols:
            if lon_col == lat_col:
                continue
            lon_values = [_to_float(row.get(lon_col, "")) for row in rows]
            lat_values = [_to_float(row.get(lat_col, "")) for row in rows]
            score = 0
            for lon, lat in zip(lon_values, lat_values):
                if lon is None or lat is None:
                    continue
                if -180 <= lon <= 180:
                    score += 2
                if -90 <= lat <= 90:
                    score += 2
                if abs(lon) > abs(lat):
                    score += 1
            candidates.append((score, lon_col, lat_col))
    if not candidates:
        return None, None
    candidates.sort(reverse=True)
    _, lon, lat = candidates[0]
    return lon, lat


def _guess_name_column(
    columns: Sequence[str],
    rows: Sequence[Dict[str, str]],
    lon_col: Optional[str],
    lat_col: Optional[str],
) -> Optional[str]:
    for column in columns:
        if column in (lon_col, lat_col):
            continue
        values = [row.get(column, "").strip() for row in rows[:20]]
        if values and sum(_to_float(value) is None and bool(value) for value in values) >= max(1, len(values) // 2):
            return column
    return None


def _to_float(value: str) -> Optional[float]:
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    text = text.replace("°", "")
    try:
        return float(text)
    except ValueError:
        return None
