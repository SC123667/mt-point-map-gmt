from pathlib import Path

from mt_gmt_tool.data import parse_station_file
from mt_gmt_tool.gmt import PlotConfig, build_script


def test_parse_sample_points() -> None:
    parsed = parse_station_file(Path(__file__).resolve().parents[1] / "sample_points.csv")

    assert len(parsed.records) == 10
    assert parsed.mapping.name == "station"
    assert parsed.mapping.lon == "lon"
    assert parsed.mapping.lat == "lat"
    assert parsed.records[0].name == "MT001"
    assert parsed.records[0].lon == 101.23
    assert parsed.records[0].lat == 36.45


def test_build_gmt_script_writes_inputs(tmp_path: Path) -> None:
    parsed = parse_station_file(Path(__file__).resolve().parents[1] / "sample_points.csv")
    config = PlotConfig(title="Test MT Map", output_name="test_map")
    script = build_script(parsed.records, config, tmp_path, ("png", "pdf"))

    assert "gmt begin" in script
    assert "gmt plot" in script
    assert "gmt text" in script
    assert "gmt basemap -R -J -TdjTR" in script
    assert (tmp_path / "stations_points.tsv").exists()
    assert (tmp_path / "stations_labels.tsv").exists()
