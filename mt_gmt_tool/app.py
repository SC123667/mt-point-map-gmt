from __future__ import annotations

import shutil
import tkinter as tk
from pathlib import Path
from tkinter import colorchooser, filedialog, messagebox, ttk
from typing import Dict, List, Optional

from .data import DataParseError, FieldMapping, ParsedTable, StationRecord, build_records, parse_station_file
from .gmt import GmtError, PlotConfig, auto_region, build_script, gmt_available, run_gmt_script, save_script


APP_TITLE = "MT点位图制作工具—GMT"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "outputs"


class MTPointMapApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1280x820")
        self.minsize(1080, 700)

        self.parsed: Optional[ParsedTable] = None
        self.records: List[StationRecord] = []
        self.preview_image: Optional[tk.PhotoImage] = None

        self.column_vars: Dict[str, tk.StringVar] = {
            "name": tk.StringVar(value=""),
            "lon": tk.StringVar(value=""),
            "lat": tk.StringVar(value=""),
            "line": tk.StringVar(value=""),
            "elevation": tk.StringVar(value=""),
        }
        self.controls = self._make_control_vars()
        self.status_var = tk.StringVar(value=self._initial_status())
        self.data_summary_var = tk.StringVar(value="未导入点位文件")

        self._build_style()
        self._build_layout()

    def _make_control_vars(self) -> Dict[str, tk.Variable]:
        return {
            "title": tk.StringVar(value="MT Survey Stations"),
            "region": tk.StringVar(value=""),
            "projection": tk.StringVar(value="M16c"),
            "frame": tk.StringVar(value="af"),
            "show_grid": tk.BooleanVar(value=True),
            "show_labels": tk.BooleanVar(value=True),
            "show_scale": tk.BooleanVar(value=True),
            "show_north_arrow": tk.BooleanVar(value=True),
            "point_symbol": tk.StringVar(value="c"),
            "point_size": tk.DoubleVar(value=0.22),
            "point_fill": tk.StringVar(value="#d7191c"),
            "point_pen_width": tk.DoubleVar(value=0.35),
            "point_pen_color": tk.StringVar(value="black"),
            "label_font_size": tk.DoubleVar(value=8.0),
            "label_color": tk.StringVar(value="black"),
            "label_dx": tk.DoubleVar(value=0.08),
            "label_dy": tk.DoubleVar(value=0.08),
            "output_name": tk.StringVar(value="mt_point_map"),
        }

    def _build_style(self) -> None:
        style = ttk.Style(self)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("TFrame", background="#f6f7f9")
        style.configure("Panel.TFrame", background="#ffffff")
        style.configure("TLabel", background="#ffffff", foreground="#1f2937", font=("Helvetica", 11))
        style.configure("Muted.TLabel", background="#ffffff", foreground="#64748b", font=("Helvetica", 10))
        style.configure("Title.TLabel", background="#ffffff", foreground="#111827", font=("Helvetica", 16, "bold"))
        style.configure("TButton", font=("Helvetica", 11), padding=(10, 6))
        style.configure("Accent.TButton", font=("Helvetica", 11, "bold"), padding=(12, 7))
        style.configure("TCheckbutton", background="#ffffff", foreground="#1f2937", font=("Helvetica", 10))
        style.configure("TLabelframe", background="#ffffff", bordercolor="#d8dee9")
        style.configure("TLabelframe.Label", background="#ffffff", foreground="#111827", font=("Helvetica", 11, "bold"))
        style.configure("Treeview", rowheight=26, font=("Helvetica", 10))
        style.configure("Treeview.Heading", font=("Helvetica", 10, "bold"))

    def _build_layout(self) -> None:
        root = ttk.Frame(self, style="TFrame")
        root.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(root, style="Panel.TFrame", padding=(18, 14))
        header.pack(fill=tk.X)
        ttk.Label(header, text=APP_TITLE, style="Title.TLabel").pack(side=tk.LEFT)
        ttk.Label(header, textvariable=self.status_var, style="Muted.TLabel").pack(side=tk.RIGHT)

        body = ttk.PanedWindow(root, orient=tk.HORIZONTAL)
        body.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

        self.left_panel = ttk.Frame(body, style="Panel.TFrame", padding=12)
        self.center_panel = ttk.Frame(body, style="Panel.TFrame", padding=12)
        self.right_panel = ttk.Frame(body, style="Panel.TFrame", padding=12)
        body.add(self.left_panel, weight=0)
        body.add(self.center_panel, weight=1)
        body.add(self.right_panel, weight=0)

        self._build_left_panel()
        self._build_center_panel()
        self._build_right_panel()

    def _build_left_panel(self) -> None:
        ttk.Label(self.left_panel, text="数据", style="Title.TLabel").pack(anchor=tk.W)
        ttk.Label(self.left_panel, textvariable=self.data_summary_var, style="Muted.TLabel", wraplength=270).pack(
            anchor=tk.W, pady=(4, 12)
        )

        button_row = ttk.Frame(self.left_panel, style="Panel.TFrame")
        button_row.pack(fill=tk.X, pady=(0, 10))
        ttk.Button(button_row, text="导入 TXT/CSV", command=self.import_file, style="Accent.TButton").pack(
            side=tk.LEFT, fill=tk.X, expand=True
        )
        ttk.Button(button_row, text="示例", command=self.load_sample).pack(side=tk.LEFT, padx=(8, 0))

        mapping = ttk.LabelFrame(self.left_panel, text="字段识别", padding=10)
        mapping.pack(fill=tk.X, pady=(0, 12))
        for key, label in (
            ("name", "测点名"),
            ("lon", "经度"),
            ("lat", "纬度"),
            ("line", "测线"),
            ("elevation", "高程"),
        ):
            row = ttk.Frame(mapping, style="Panel.TFrame")
            row.pack(fill=tk.X, pady=3)
            ttk.Label(row, text=label, width=7).pack(side=tk.LEFT)
            combo = ttk.Combobox(row, textvariable=self.column_vars[key], state="readonly", width=20)
            combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
            combo.bind("<<ComboboxSelected>>", lambda _event: self.apply_mapping())
            setattr(self, f"{key}_combo", combo)

        ttk.Button(mapping, text="应用字段映射", command=self.apply_mapping).pack(fill=tk.X, pady=(8, 0))

        preview_frame = ttk.LabelFrame(self.left_panel, text="数据预览", padding=8)
        preview_frame.pack(fill=tk.BOTH, expand=True)
        columns = ("name", "lon", "lat")
        self.table = ttk.Treeview(preview_frame, columns=columns, show="headings", height=14)
        self.table.heading("name", text="测点")
        self.table.heading("lon", text="经度")
        self.table.heading("lat", text="纬度")
        self.table.column("name", width=90, anchor=tk.W)
        self.table.column("lon", width=90, anchor=tk.E)
        self.table.column("lat", width=90, anchor=tk.E)
        self.table.pack(fill=tk.BOTH, expand=True)

    def _build_center_panel(self) -> None:
        top = ttk.Frame(self.center_panel, style="Panel.TFrame")
        top.pack(fill=tk.X)
        ttk.Label(top, text="地图预览", style="Title.TLabel").pack(side=tk.LEFT)
        ttk.Button(top, text="生成预览", command=self.preview_map, style="Accent.TButton").pack(side=tk.RIGHT)

        preview_shell = ttk.Frame(self.center_panel, style="Panel.TFrame", padding=(0, 12, 0, 0))
        preview_shell.pack(fill=tk.BOTH, expand=True)
        self.preview_canvas = tk.Canvas(
            preview_shell,
            bg="#eef2f7",
            highlightthickness=1,
            highlightbackground="#d8dee9",
        )
        self.preview_canvas.pack(fill=tk.BOTH, expand=True)
        self.preview_canvas.bind("<Configure>", lambda _event: self._render_preview_placeholder())

        bottom = ttk.Frame(self.center_panel, style="Panel.TFrame")
        bottom.pack(fill=tk.X, pady=(12, 0))
        ttk.Button(bottom, text="导出 PNG", command=lambda: self.export_map(("png",))).pack(side=tk.LEFT)
        ttk.Button(bottom, text="导出 PDF", command=lambda: self.export_map(("pdf",))).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(bottom, text="导出 PNG + PDF", command=lambda: self.export_map(("png", "pdf"))).pack(
            side=tk.LEFT, padx=(8, 0)
        )
        ttk.Button(bottom, text="保存 GMT 脚本", command=self.save_gmt_script_dialog).pack(side=tk.RIGHT)

    def _build_right_panel(self) -> None:
        ttk.Label(self.right_panel, text="绘图参数", style="Title.TLabel").pack(anchor=tk.W)
        ttk.Label(self.right_panel, text="改完参数后点击生成预览或导出。", style="Muted.TLabel").pack(
            anchor=tk.W, pady=(4, 12)
        )

        canvas = tk.Canvas(self.right_panel, bg="#ffffff", highlightthickness=0, width=310)
        scrollbar = ttk.Scrollbar(self.right_panel, orient=tk.VERTICAL, command=canvas.yview)
        scroll_frame = ttk.Frame(canvas, style="Panel.TFrame")
        scroll_frame.bind("<Configure>", lambda event: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scroll_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self._map_controls(scroll_frame)
        self._point_controls(scroll_frame)
        self._label_controls(scroll_frame)
        self._decoration_controls(scroll_frame)

    def _map_controls(self, parent: ttk.Frame) -> None:
        box = ttk.LabelFrame(parent, text="图幅", padding=10)
        box.pack(fill=tk.X, pady=(0, 10))
        self._entry(box, "标题", "title")
        self._entry(box, "范围 -R", "region")
        self._entry(box, "投影 -J", "projection")
        self._entry(box, "经纬网 -B", "frame")
        ttk.Button(box, text="根据点位自动范围", command=self.set_auto_region).pack(fill=tk.X, pady=(6, 0))

    def _point_controls(self, parent: ttk.Frame) -> None:
        box = ttk.LabelFrame(parent, text="点位符号", padding=10)
        box.pack(fill=tk.X, pady=(0, 10))
        self._combo(box, "形状", "point_symbol", [("圆形", "c"), ("三角", "t"), ("方形", "s"), ("菱形", "d")])
        self._spin(box, "大小 cm", "point_size", 0.05, 1.5, 0.01)
        self._color(box, "填充色", "point_fill")
        self._spin(box, "边框宽 p", "point_pen_width", 0.0, 3.0, 0.05)
        self._color(box, "边框色", "point_pen_color")

    def _label_controls(self, parent: ttk.Frame) -> None:
        box = ttk.LabelFrame(parent, text="测点标签", padding=10)
        box.pack(fill=tk.X, pady=(0, 10))
        ttk.Checkbutton(box, text="显示测点名", variable=self.controls["show_labels"]).pack(anchor=tk.W)
        self._spin(box, "字号 pt", "label_font_size", 5, 18, 0.5)
        self._color(box, "文字色", "label_color")
        self._spin(box, "右移 cm", "label_dx", -0.5, 0.8, 0.01)
        self._spin(box, "上移 cm", "label_dy", -0.5, 0.8, 0.01)

    def _decoration_controls(self, parent: ttk.Frame) -> None:
        box = ttk.LabelFrame(parent, text="图件元素", padding=10)
        box.pack(fill=tk.X, pady=(0, 10))
        ttk.Checkbutton(box, text="经纬网", variable=self.controls["show_grid"]).pack(anchor=tk.W)
        ttk.Checkbutton(box, text="比例尺", variable=self.controls["show_scale"]).pack(anchor=tk.W)
        ttk.Checkbutton(box, text="指北针", variable=self.controls["show_north_arrow"]).pack(anchor=tk.W)
        self._entry(box, "输出名", "output_name")

    def _entry(self, parent: ttk.Frame, label: str, key: str) -> None:
        row = ttk.Frame(parent, style="Panel.TFrame")
        row.pack(fill=tk.X, pady=3)
        ttk.Label(row, text=label, width=9).pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=self.controls[key]).pack(side=tk.LEFT, fill=tk.X, expand=True)

    def _combo(self, parent: ttk.Frame, label: str, key: str, values: List[tuple[str, str]]) -> None:
        row = ttk.Frame(parent, style="Panel.TFrame")
        row.pack(fill=tk.X, pady=3)
        ttk.Label(row, text=label, width=9).pack(side=tk.LEFT)
        labels = [item[0] for item in values]
        value_map = {item[0]: item[1] for item in values}
        reverse_map = {item[1]: item[0] for item in values}
        display_var = tk.StringVar(value=reverse_map.get(self.controls[key].get(), labels[0]))
        combo = ttk.Combobox(row, textvariable=display_var, values=labels, state="readonly")
        combo.pack(side=tk.LEFT, fill=tk.X, expand=True)
        combo.bind("<<ComboboxSelected>>", lambda _event: self.controls[key].set(value_map[display_var.get()]))

    def _spin(self, parent: ttk.Frame, label: str, key: str, min_value: float, max_value: float, step: float) -> None:
        row = ttk.Frame(parent, style="Panel.TFrame")
        row.pack(fill=tk.X, pady=3)
        ttk.Label(row, text=label, width=9).pack(side=tk.LEFT)
        ttk.Spinbox(
            row,
            from_=min_value,
            to=max_value,
            increment=step,
            textvariable=self.controls[key],
            width=10,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True)

    def _color(self, parent: ttk.Frame, label: str, key: str) -> None:
        row = ttk.Frame(parent, style="Panel.TFrame")
        row.pack(fill=tk.X, pady=3)
        ttk.Label(row, text=label, width=9).pack(side=tk.LEFT)
        entry = ttk.Entry(row, textvariable=self.controls[key], width=12)
        entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(row, text="选择", command=lambda: self.choose_color(key)).pack(side=tk.LEFT, padx=(6, 0))

    def import_file(self) -> None:
        path = filedialog.askopenfilename(
            title="选择点位 TXT/CSV 文件",
            filetypes=(("点位文件", "*.txt *.csv *.dat *.tsv"), ("所有文件", "*.*")),
        )
        if path:
            self.load_file(Path(path))

    def load_sample(self) -> None:
        self.load_file(PROJECT_ROOT / "sample_points.csv")

    def load_file(self, path: Path) -> None:
        try:
            parsed = parse_station_file(path)
        except (OSError, DataParseError) as exc:
            messagebox.showerror("导入失败", str(exc))
            return

        self.parsed = parsed
        self.records = parsed.records
        self._populate_mapping_controls(parsed)
        self._refresh_data_table()
        self.set_auto_region(show_error=False)
        self.data_summary_var.set(
            f"{path.name}\n已识别 {len(self.records)} 个点位；"
            f"经度列 {parsed.mapping.lon}，纬度列 {parsed.mapping.lat}。"
        )
        self.status_var.set("点位文件已导入，可以生成预览。")
        self._render_preview_placeholder()

    def _populate_mapping_controls(self, parsed: ParsedTable) -> None:
        values = [""] + parsed.columns
        for key in self.column_vars:
            combo = getattr(self, f"{key}_combo")
            combo.configure(values=values)
        self.column_vars["name"].set(parsed.mapping.name or "")
        self.column_vars["lon"].set(parsed.mapping.lon)
        self.column_vars["lat"].set(parsed.mapping.lat)
        self.column_vars["line"].set(parsed.mapping.line or "")
        self.column_vars["elevation"].set(parsed.mapping.elevation or "")

    def apply_mapping(self) -> None:
        if not self.parsed:
            return
        lon = self.column_vars["lon"].get()
        lat = self.column_vars["lat"].get()
        if not lon or not lat:
            messagebox.showwarning("字段不完整", "经度和纬度列必须选择。")
            return
        mapping = FieldMapping(
            name=self.column_vars["name"].get() or None,
            lon=lon,
            lat=lat,
            line=self.column_vars["line"].get() or None,
            elevation=self.column_vars["elevation"].get() or None,
        )
        records = build_records(self.parsed.rows, mapping)
        if not records:
            messagebox.showerror("字段映射错误", "当前字段映射没有解析出有效点位。")
            return
        self.records = records
        self._refresh_data_table()
        self.set_auto_region(show_error=False)
        self.data_summary_var.set(f"当前映射已应用；有效点位 {len(records)} 个。")
        self.status_var.set("字段映射已更新。")

    def _refresh_data_table(self) -> None:
        self.table.delete(*self.table.get_children())
        for record in self.records[:200]:
            self.table.insert("", tk.END, values=(record.name, f"{record.lon:.6f}", f"{record.lat:.6f}"))

    def choose_color(self, key: str) -> None:
        initial = str(self.controls[key].get())
        color = colorchooser.askcolor(color=initial, title="选择颜色")
        if color and color[1]:
            self.controls[key].set(color[1])

    def set_auto_region(self, show_error: bool = True) -> None:
        if not self.records:
            if show_error:
                messagebox.showwarning("没有点位", "请先导入点位文件。")
            return
        self.controls["region"].set(auto_region(self.records))

    def preview_map(self) -> None:
        if not self._ensure_records():
            return
        config = self._config()
        try:
            script = build_script(self.records, config, DEFAULT_OUTPUT_DIR, ("png",))
            run_gmt_script(script, DEFAULT_OUTPUT_DIR, config.output_name)
        except GmtError as exc:
            save_script(build_script(self.records, config, DEFAULT_OUTPUT_DIR, ("png",)), DEFAULT_OUTPUT_DIR, config.output_name)
            self.status_var.set("GMT 未执行，已保存脚本。")
            messagebox.showwarning("GMT 暂不可用", str(exc))
            return
        except Exception as exc:
            messagebox.showerror("预览失败", str(exc))
            return

        png = DEFAULT_OUTPUT_DIR / f"{config.output_name}.png"
        self._load_preview_image(png)
        self.status_var.set(f"预览已生成：{png}")

    def export_map(self, formats: tuple[str, ...]) -> None:
        if not self._ensure_records():
            return
        config = self._config()
        try:
            script = build_script(self.records, config, DEFAULT_OUTPUT_DIR, formats)
            run_gmt_script(script, DEFAULT_OUTPUT_DIR, config.output_name)
        except GmtError as exc:
            save_script(build_script(self.records, config, DEFAULT_OUTPUT_DIR, formats), DEFAULT_OUTPUT_DIR, config.output_name)
            self.status_var.set("GMT 未执行，已保存脚本。")
            messagebox.showwarning("GMT 暂不可用", str(exc))
            return
        except Exception as exc:
            messagebox.showerror("导出失败", str(exc))
            return

        produced = ", ".join(str(DEFAULT_OUTPUT_DIR / f"{config.output_name}.{fmt}") for fmt in formats)
        if "png" in formats:
            self._load_preview_image(DEFAULT_OUTPUT_DIR / f"{config.output_name}.png")
        self.status_var.set(f"导出完成：{produced}")
        messagebox.showinfo("导出完成", produced)

    def save_gmt_script_dialog(self) -> None:
        if not self._ensure_records():
            return
        config = self._config()
        path = filedialog.asksaveasfilename(
            title="保存 GMT 脚本",
            defaultextension=".gmt",
            initialfile=f"{config.output_name}.gmt",
            filetypes=(("GMT 脚本", "*.gmt"), ("Shell 脚本", "*.sh"), ("所有文件", "*.*")),
        )
        if not path:
            return
        script = build_script(self.records, config, Path(path).parent, ("png", "pdf"))
        script_path = Path(path)
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        self.status_var.set(f"GMT 脚本已保存：{script_path}")

    def _ensure_records(self) -> bool:
        if not self.records:
            messagebox.showwarning("没有点位", "请先导入 TXT/CSV 点位文件。")
            return False
        return True

    def _config(self) -> PlotConfig:
        return PlotConfig(
            title=str(self.controls["title"].get()),
            region=str(self.controls["region"].get()),
            projection=str(self.controls["projection"].get()),
            frame=str(self.controls["frame"].get()),
            show_grid=bool(self.controls["show_grid"].get()),
            show_labels=bool(self.controls["show_labels"].get()),
            show_scale=bool(self.controls["show_scale"].get()),
            show_north_arrow=bool(self.controls["show_north_arrow"].get()),
            point_symbol=str(self.controls["point_symbol"].get()),
            point_size_cm=float(self.controls["point_size"].get()),
            point_fill=str(self.controls["point_fill"].get()),
            point_pen_width=float(self.controls["point_pen_width"].get()),
            point_pen_color=str(self.controls["point_pen_color"].get()),
            label_font_size=float(self.controls["label_font_size"].get()),
            label_color=str(self.controls["label_color"].get()),
            label_dx_cm=float(self.controls["label_dx"].get()),
            label_dy_cm=float(self.controls["label_dy"].get()),
            output_name=str(self.controls["output_name"].get()).strip() or "mt_point_map",
        )

    def _load_preview_image(self, path: Path) -> None:
        if not path.exists():
            self._render_preview_placeholder(f"未找到预览图：{path}")
            return
        try:
            self.preview_image = tk.PhotoImage(file=str(path))
        except tk.TclError:
            self._render_preview_placeholder("当前 Tk 无法直接显示该 PNG，但文件已生成。")
            return
        self.preview_canvas.delete("all")
        width = self.preview_canvas.winfo_width()
        height = self.preview_canvas.winfo_height()
        image_width = self.preview_image.width()
        image_height = self.preview_image.height()
        self.preview_canvas.create_image(
            max((width - image_width) // 2, 10),
            max((height - image_height) // 2, 10),
            anchor=tk.NW,
            image=self.preview_image,
        )

    def _render_preview_placeholder(self, text: Optional[str] = None) -> None:
        if self.preview_image:
            return
        self.preview_canvas.delete("all")
        width = self.preview_canvas.winfo_width() or 700
        height = self.preview_canvas.winfo_height() or 500
        message = text or ("导入点位后生成预览" if not self.records else "点击“生成预览”绘制点位图")
        self.preview_canvas.create_text(
            width / 2,
            height / 2,
            text=message,
            fill="#64748b",
            font=("Helvetica", 15),
            width=max(width - 100, 260),
            justify=tk.CENTER,
        )

    def _initial_status(self) -> str:
        if gmt_available():
            return f"GMT 已就绪：{shutil.which('gmt')}"
        return "未检测到 GMT；可先导入数据和保存脚本。"


def main() -> None:
    app = MTPointMapApp()
    app.mainloop()
