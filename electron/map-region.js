// Shared by the GMT worker and the renderer's inline bridge.
function geographicRegionIssue(value, projection = "") {
  const parts = String(value || "").trim().split("/");
  if (parts.length !== 4 || parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(part.trim()))) {
    return "请填写完整的西、东、南、北边界（十进制度）。";
  }
  const [west, east, south, north] = parts.map(Number);
  if (west < -180 || east > 360 || east - west > 360 || east <= west) {
    return "经度须满足西 < 东，范围在 -180°～360°，跨度不超过 360°。跨日期变更线可填写 170°～190°。";
  }
  if (south < -90 || north > 90 || north <= south) {
    return "纬度须满足南 < 北，且在 -90°～90°之间。";
  }
  if (/^m/i.test(String(projection).trim()) && (south <= -90 || north >= 90)) {
    return "墨卡托投影不能包含南北极，请缩小纬度范围或更换投影。";
  }
  return "";
}

module.exports = { geographicRegionIssue };
