"""JSON worker. Phase tensors and map geometry come from unmodified MTpy-v2.

The adapter selects samples, derives the documented Phi2 color scalar, and arranges outputs.
It never calls the application's JavaScript MT maths or GMT tensor renderer.
"""
import contextlib
import csv
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys
import traceback

os.environ.setdefault("MPLBACKEND", "Agg")


def progress(message, percent):
    print("MTPY_PROGRESS " + json.dumps(dict(message=message, percent=percent)), file=sys.stderr, flush=True)


def scalar(value, index=0):
    import numpy as np
    if value is None:
        return None
    number = float(np.asarray(value).reshape(-1)[index])
    return number if math.isfinite(number) else None


def dependencies():
    return {name: importlib.metadata.version(name) for name in
            ["mtpy-v2", "mt-metadata", "mth5", "numpy", "scipy", "matplotlib"]}


def read_files(files):
    import numpy as np
    from mtpy import MT
    loaded, skipped = [], []
    for number, filename in enumerate(dict.fromkeys(files)):
        progress(f"MTpy 读取 EDI：{number + 1}/{len(files)}", 5 + 20 * number / len(files))
        try:
            path = Path(filename).resolve(strict=True)
            if path.suffix.lower() != ".edi":
                raise ValueError("仅接受原始 EDI 文件")
            mt = MT()
            mt.read(path)
            periods = np.asarray(mt.period, dtype=float)
            if not periods.size or not np.isfinite(periods).all() or (periods <= 0).any():
                raise ValueError("周期包含无效值")
            if len(np.unique(periods)) != len(periods):
                raise ValueError("存在重复周期，请检查原始文件")
            if not (mt.has_impedance() or mt.has_tipper()):
                raise ValueError("MTpy 未读出阻抗或 Tipper")
            if not (math.isfinite(mt.longitude) and math.isfinite(mt.latitude)):
                raise ValueError("缺少有效测站坐标")
            loaded.append((mt, dict(path=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                                   station=mt.station, longitude=mt.longitude, latitude=mt.latitude,
                                   periods=periods.tolist(), has_impedance=mt.has_impedance(), has_tipper=mt.has_tipper())))
        except Exception as exc:
            skipped.append(dict(path=str(filename), reason=str(exc)))
    if not loaded:
        raise ValueError("MTpy 未读到可用测站：" + json.dumps(skipped, ensure_ascii=False))
    return loaded, skipped


def select_period(mt, period, max_gap):
    """No extrapolation, no nearest-period substitution. MTpy interpolates."""
    import numpy as np
    periods = np.asarray(mt.period)
    exact = np.flatnonzero(np.isclose(periods, period, rtol=1e-8, atol=0))
    if len(exact):
        return mt, int(exact[0]), "original"
    ordered = np.sort(periods)
    at = np.searchsorted(ordered, period)
    if at == 0 or at == len(ordered):
        raise ValueError("目标周期超出该站覆盖范围，未外推或替用端点")
    if math.log10(ordered[at] / ordered[at - 1]) > max_gap:
        raise ValueError("相邻周期间隔超过允许插值跨度")
    return mt.interpolate(np.array([period]), method="slinear", bounds_error=True), 0, "MT.interpolate(slinear, period)"


def phi2_values(pt):
    """Caldwell Phi2 = sqrt(det(Phi)); negative determinants have no real Phi2.

    This is not MTpy 2.1.4's phidet plotting shortcut sqrt(abs(det))*180/pi.
    Return the invariant and its arctangent phase in degrees, without mutating PT.
    """
    import numpy as np
    det = np.asarray(pt.det, dtype=float)
    valid = np.isfinite(det) & (det >= 0)
    raw = np.full(det.shape, np.nan, dtype=float)
    np.sqrt(det, out=raw, where=valid)
    return raw, np.degrees(np.arctan(raw))


def ellipse_coloring(style):
    mode = style.get("colorBy", "beta")
    if mode not in ("beta", "phimin", "phimax", "phi2"):
        raise ValueError("未知相位张量着色量")
    phase = mode != "beta"
    prefix = "phase" if phase else "beta"
    defaults = (0, 90, 15) if phase else (-9, 9, 3)
    limits = tuple(float(style.get(prefix + key, default)) for key, default in zip(("Min", "Max", "Step"), defaults))
    if not all(math.isfinite(x) for x in limits) or limits[1] <= limits[0] or limits[2] <= 0:
        raise ValueError("无效色标范围")
    labels = {"beta":"β (°)", "phimin":"φmin (°)", "phimax":"φmax (°)", "phi2":r"$\Phi_2=\sqrt{\det(\Phi)}$" + "\n" + r"$\varphi_2=\arctan(\Phi_2)\times180/\pi$ (°)"}
    return {"beta":"skew", "phi2":"phidet"}.get(mode, mode), limits, "mt_bl2gr2rd" if phase else "mt_seg_bl2wh2rd", labels[mode]


def metric_row(mt, source, period, index, method, skew, eccentricity):
    import numpy as np
    row = dict(station=source["station"], source=source["path"], longitude=mt.longitude,
               latitude=mt.latitude, period_s=period, actual_period_s=float(mt.period[index]),
               sampling=method, beta_deg=None, beta_error_deg=None, eccentricity=None,
               eccentricity_error=None, azimuth_deg=None, phase_min_deg=None, phase_max_deg=None,
               phi2=None, phi2_phase_deg=None, phi2_reason="",
               dimension=None, tipper_real_magnitude=None, tipper_real_azimuth=None,
               tipper_imag_magnitude=None, tipper_imag_azimuth=None, reason="")
    valid_z = False
    if mt.has_impedance():
        z = mt.Z
        sample = z.z[index]
        if np.isfinite(sample).all() and np.linalg.cond(sample.real) < 1e12:
            pt = z.phase_tensor
            for target, attribute in [("beta_deg","beta"),("beta_error_deg","beta_error"),
                                      ("eccentricity","eccentricity"),("eccentricity_error","eccentricity_error"),
                                      ("azimuth_deg","azimuth"),("phase_min_deg","phimin"),("phase_max_deg","phimax")]:
                row[target] = scalar(getattr(pt, attribute, None), index)
            phi2, phi2_phase = phi2_values(pt)
            row["phi2"] = scalar(phi2, index)
            row["phi2_phase_deg"] = scalar(phi2_phase, index)
            if row["phi2"] is None:
                row["phi2_reason"] = "相位张量行列式为负或非有限值，Φ₂ 无实值；未取绝对值"
            valid_z = row["beta_deg"] is not None and row["eccentricity"] is not None
            if valid_z:
                row["dimension"] = int(z.estimate_dimensionality(skew_threshold=skew, eccentricity_threshold=eccentricity)[index])
        if not valid_z:
            row["reason"] = "阻抗缺测或实部矩阵奇异/病态，维性未判定"
    else:
        row["reason"] = "无阻抗，维性未判定"
    valid_t = False
    if mt.has_tipper():
        tipper = mt.Tipper
        valid_t = bool(np.isfinite(tipper.tipper[index]).all())
        if valid_t:
            for target, attribute in [("tipper_real_magnitude","mag_real"),("tipper_real_azimuth","angle_real"),
                                      ("tipper_imag_magnitude","mag_imag"),("tipper_imag_azimuth","angle_imag")]:
                row[target] = scalar(getattr(tipper, attribute), index)
    return row, valid_z, valid_t


def add_arrow_reference(plot):
    """Calibration legend drawn with the same official Tipper patch as the data."""
    import numpy as np
    from matplotlib.patches import Rectangle
    from mtpy.core.transfer_function.tipper import Tipper
    if "y" not in plot.plot_tipper:
        return None
    old_legend=plot.ax.get_legend()
    if old_legend:
        old_legend.remove()
    plot.fig.canvas.draw()
    axis=plot.ax.get_window_extent(plot.fig.canvas.get_renderer())
    to_points=72/plot.fig.dpi
    xlo,xhi=plot.ax.get_xlim();ylo,yhi=plot.ax.get_ylim()
    xunit=(xhi-xlo)/(axis.width*to_points)
    yunit=(yhi-ylo)/(axis.height*to_points)
    magnitude=.5
    while magnitude*plot.arrow_size/xunit>axis.width*to_points*.22:
        magnitude/=2
    shaft=magnitude*plot.arrow_size/xunit
    head=plot.arrow_head_length/xunit
    components=[(c,name) for c,name in [('r','Real'),('i','Imag')] if c in plot.plot_tipper]
    style=getattr(plot,"_display_style",{});display_scale=getattr(plot,"_display_scale",1)
    text_scale=(float(style.get("fontSize",8))/8)/display_scale
    width=max(shaft+head,14)+45*text_scale
    height=(8+len(components)*12)*text_scale
    left=xhi-(width+5)*xunit;top=yhi-5*yunit
    box=Rectangle((left,top-height*yunit),width*xunit,height*yunit,
                  facecolor='white',edgecolor='#bbbbbb',linewidth=.4,alpha=.96,zorder=20)
    box._mtpy_reference=True;plot.ax.add_patch(box);plot._mtpy_reference_box=box
    original=plot.plot_tipper
    lengths=[]
    try:
        # A horizontal reference is only a length key; the actual vectors retain
        # the user's direction convention and all official head/shaft settings.
        sign=-1 if plot.arrow_direction==1 else 1
        for row,(component,label) in enumerate(components):
            vector=sign*magnitude*(1 if component=='r' else 1j)
            reference=Tipper(tipper=np.array([[[0j,vector]]]),frequency=np.array([1.]))
            plot.plot_tipper='y'+component
            x=left+5*xunit;y=top-(10+12*row)*text_scale*yunit
            start=len(plot.ax.patches)
            plot._get_tipper_patch(x,y,reference)
            for patch in list(plot.ax.patches)[start:]:
                patch.set_zorder(21);patch._mtpy_reference=True
                b=patch.get_window_extent(plot.fig.canvas.get_renderer())
                lengths.append(dict(component=label,shaftPoints=shaft,visiblePoints=b.width*to_points))
            label_text=plot.ax.text(left+(width-3)*xunit,y,f"{label} {magnitude:g}",ha='right',va='center',
                         fontfamily=style.get('fontFamily','Times New Roman'),fontsize=8*text_scale,zorder=22)
            label_text._mtpy_reference=True
    finally:
        plot.plot_tipper=original
    return dict(magnitude=magnitude,components=lengths,headPoints=head,
                lengthIncludesHead=False,engine='MTpy._get_tipper_patch')


def export_ai_artwork(plot, output, name):
    """Separate existing upstream artists; never recreate their geometry or values."""
    from matplotlib.patches import Ellipse, FancyArrow
    from matplotlib.colors import to_rgba
    artists=list(plot.ax.get_children())
    visible=[a.get_visible() for a in artists]
    groups={key:[] for key in ['ellipses','real','imag','axes','legend']}
    for artist in artists:
        if getattr(artist,'_mtpy_reference',False):key='legend'
        elif isinstance(artist,Ellipse):key='ellipses'
        elif isinstance(artist,FancyArrow):
            key='real' if artist.get_facecolor()==to_rgba(plot.arrow_color_real) else 'imag'
        else:key='axes'
        groups[key].append(artist)
    result=[]
    try:
        for key,items in groups.items():
            if not items:continue
            for artist,was_visible in zip(artists,visible):artist.set_visible(was_visible and artist in items)
            file=output/f'{name}_AI_{key}.pdf'
            plot.fig.savefig(file,transparent=True)
            result.append(dict(role=key,file=str(file),artists=sum(a in items and v for a,v in zip(artists,visible))))
    finally:
        for artist,was_visible in zip(artists,visible):artist.set_visible(was_visible)
    return result


def artist_obstacles(plot):
    """Read upstream artists in axes-relative screen coordinates; never alter MT values."""
    import numpy as np
    from matplotlib.patches import Ellipse
    plot.fig.canvas.draw()
    renderer = plot.fig.canvas.get_renderer()
    axis = plot.ax.get_window_extent(renderer)
    obstacles = []
    def add(x0, y0, x1, y1, kind):
        pad = plot.fig.dpi / 72  # one physical point
        x0, x1 = max(axis.x0, x0-pad), min(axis.x1, x1+pad)
        y0, y1 = max(axis.y0, y0-pad), min(axis.y1, y1+pad)
        if x1 > x0 and y1 > y0:
            obstacles.append(dict(x=(x0-axis.x0)/axis.width, y=(axis.y1-y1)/axis.height,
                                  width=(x1-x0)/axis.width, height=(y1-y0)/axis.height, kind=kind))
    for patch in plot.ax.patches:
        if not patch.get_visible() or (getattr(patch,"_mtpy_reference",False) or getattr(patch,"_presentation_frame",False)):
            continue
        if isinstance(patch, Ellipse):
            b = patch.get_window_extent(renderer)
            add(b.x0,b.y0,b.x1,b.y1,"ellipse")
        else:
            # Small edge boxes follow diagonal arrows instead of blocking their
            # entire rectangular extent, leaving genuine space for labels.
            for polygon in patch.get_path().transformed(patch.get_transform()).to_polygons():
                for a,b in zip(polygon[:-1],polygon[1:]):
                    count = max(1,min(500,int(np.linalg.norm(b-a)/(4*plot.fig.dpi/72))+1))
                    points = np.linspace(a,b,count+1)
                    for u,v in zip(points[:-1],points[1:]):
                        add(min(u[0],v[0]),min(u[1],v[1]),max(u[0],v[0]),max(u[1],v[1]),"arrow")
    for item in [*plot.ax.texts, plot.ax.get_legend(),getattr(plot,"_mtpy_reference_box",None)]:
        if item is not None and item.get_visible():
            b=item.get_window_extent(renderer)
            add(b.x0,b.y0,b.x1,b.y1,"text")
    return obstacles


def decorate_map(plot, style, scale, period, index):
    """Vector-only presentation; upstream MTpy geometry stays untouched."""
    from matplotlib.patches import Rectangle, Ellipse
    font = style.get("fontFamily", "Times New Roman")
    fs = float(style.get("fontSize", 8)) / scale
    size = float(style.get("panelFontSize", 9)) / scale
    for patch in plot.ax.patches:
        if isinstance(patch, Ellipse):
            patch.set_edgecolor("black")
            patch.set_linewidth(float(style.get("ellipsePen", .35))/scale)
    plot.ax.tick_params(labelsize=fs, direction="in", width=.5/scale)
    for text in plot.ax.get_xticklabels()+plot.ax.get_yticklabels():
        text.set_fontfamily(font)
    for spine in plot.ax.spines.values():
        spine.set_linewidth(float(style.get("framePen", .5))/scale)
        spine.set_edgecolor("black")
    if style.get("frameStyle", "fancy") == "fancy":
        plot.fig.canvas.draw()
        bbox=plot.ax.get_window_extent(plot.fig.canvas.get_renderer())
        band=float(style.get("frameWidth",2))/scale*plot.fig.dpi/72
        dx,dy=band/bbox.width,band/bbox.height
        n=int(style.get("frameSegments",8))
        for i in range(n):
            color="black" if i%2==0 else "white"
            for x,y,w,h in [(i/n,0,1/n,dy),(i/n,1-dy,1/n,dy),(0,i/n,dx,1/n),(1-dx,i/n,dx,1/n)]:
                patch=Rectangle((x,y),w,h,transform=plot.ax.transAxes,facecolor=color,
                                edgecolor="black",linewidth=.15/scale,zorder=30,clip_on=True)
                patch._presentation_frame=True
                plot.ax.add_patch(patch)
    corners={"topLeft":(.04,.96,"left","top"),"topRight":(.96,.96,"right","top"),
             "bottomLeft":(.04,.04,"left","bottom"),"bottomRight":(.96,.04,"right","bottom")}
    if getattr(plot,"_show_geographic_scale",False):
        corners["bottomRight"]=(.96,.11,"right","bottom")
    if "y" in plot.plot_tipper:
        corners["topRight"]=(.96,.76,"right","top")
    def label(text,location):
        x,y,ha,va=corners[location]
        plot.ax.text(x,y,text,transform=plot.ax.transAxes,ha=ha,va=va,fontsize=size,
                     fontfamily=font,bbox=dict(facecolor="white",edgecolor="none",alpha=.85,pad=1),zorder=31)
    period_corner=style.get("periodPosition","bottomLeft")
    panel_corner=style.get("panelPosition","bottomRight")
    if panel_corner==period_corner:
        label(f"({chr(97+index)})  {period:g} s",period_corner)
    else:
        label(f"{period:g} s",period_corner)
        if panel_corner!="none":label(f"({chr(97+index)})",panel_corner)


def render(request):
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import mtpy.imaging.plot_phase_tensor_maps as maps

    versions = dependencies()
    if versions["mtpy-v2"] != "2.1.4":
        raise ValueError("需要经过验证的 MTpy-v2 2.1.4，当前为 " + versions["mtpy-v2"])
    loaded, skipped = read_files(request["files"])
    sources = [source for _, source in loaded]
    if request.get("action") == "inspect":
        return dict(versions=versions, stations=sources, skipped=skipped,
                    periods=sorted({p for s in sources for p in s["periods"]}))

    periods = list(dict.fromkeys(float(p) for p in request.get("periods", [])))
    if not periods or len(periods) > 12 or any(not math.isfinite(p) or p <= 0 for p in periods):
        raise ValueError("请选择 1–12 个有限正周期")
    skew, eccentricity = float(request.get("skew",5)), float(request.get("eccentricity",.1))
    max_gap = float(request.get("maxGap",1))
    ellipse_size = float(request.get("ellipseScale",.7*float(request.get("symbolScale",1))))
    arrow_size = float(request.get("arrowScale",.85*float(request.get("symbolScale",1))))
    if not all(math.isfinite(x) and x>0 for x in [skew,eccentricity,max_gap,ellipse_size,arrow_size]):
        raise ValueError("阈值、插值跨度和符号大小必须是有限正数")
    mode = request.get("mode","combined")
    if mode not in ["combined","phase","tipper"]:
        raise ValueError("未知图件类型")
    component = request.get("component","yri")
    if component not in ["yr","yi","yri"]:
        raise ValueError("未知箭头分量")
    convention = request.get("convention","parkinson")
    if convention not in ["parkinson","wiese"]:
        raise ValueError("未知箭头约定")
    output = Path(request["output"])
    output.mkdir(parents=True, exist_ok=True)
    # Official optional basemap is disabled explicitly: deterministic offline maps.
    # The installed library stays untouched; Phi2 adapts only this plot instance
    # color values. MTpy still supplies the tensor, geometry and arrows.
    maps.has_cx = False
    plt.rcParams.update({"pdf.fonttype":42,"ps.fonttype":42,"svg.fonttype":"none","font.family":"Times New Roman","mathtext.fontset":"stix"})
    all_rows, panels, omissions = [], [], []
    lon = [s["longitude"] for s in sources]
    lat = [s["latitude"] for s in sources]
    if max(lon)-min(lon)>180:
        raise ValueError("测区跨越日期变更线；当前 MTpy 经纬度地图需先拆分测区")
    span = max(max(lon)-min(lon), max(lat)-min(lat), .04)
    bounds = [min(lon)-span*.12, max(lon)+span*.12, min(lat)-span*.12,max(lat)+span*.12]
    if request.get("bounds") is not None:
        bounds = [float(v) for v in request["bounds"]]
        if len(bounds)!=4 or not all(math.isfinite(v) for v in bounds) or not (-180<=bounds[0]<bounds[1]<=180 and -90<bounds[2]<bounds[3]<90):
            raise ValueError("GMT 地图范围无效")
        span=max(bounds[1]-bounds[0],bounds[3]-bounds[2])
    legend_position=request.get("colorbarPosition",request.get("legendPosition","bottom"))
    if legend_position not in ["top","bottom","left","right"]: raise ValueError("无效图例位置")
    style=request.get("presentation") or {}
    scale=1.0
    columns=min(len(periods),max(1,min(4,int(request.get("columns",2)))))
    if style.get("outputWidthMM"):
        target=float(style["outputWidthMM"])*72/25.4
        compact=request.get("layout","compact")=="compact" and request.get("colorbarMode","shared")!="individual"
        grid_width=504*.78*columns+62 if compact else 504*columns
        scale=(target-float(request.get("panelGap",3))*72/25.4*(columns-1))/grid_width
        if scale<=0:raise ValueError("图幅宽度不足以容纳当前图间距")
    font=style.get("fontFamily","Times New Roman")
    font_size=float(style.get("fontSize",9))/scale
    color_by, limits, cmap, color_label = ellipse_coloring(style)
    plt.rcParams.update({"font.family":font})
    colorbar=None
    for position, period in enumerate(periods):
        progress(f"MTpy 绘制 {period:g} s（{position+1}/{len(periods)}）", 30 + 60*position/len(periods))
        eligible = {}
        tipper_count = 0
        for number, (mt, source) in enumerate(loaded):
            try:
                selected, index, method = select_period(mt,period,max_gap)
                row, valid_z, valid_t = metric_row(selected,source,period,index,method,skew,eccentricity)
                all_rows.append(row)
                if style.get("colorBy") == "phi2" and valid_z and row["phi2"] is None:
                    omissions.append(dict(station=source["station"], period_s=period, reason=row["phi2_reason"] + "；椭圆保留轮廓、不填色"))
                if (mode == "tipper" and not valid_t) or (mode != "tipper" and not valid_z):
                    raise ValueError(row["reason"] or "缺少有效 Tipper")
                eligible[str(number)] = selected
                if valid_t:
                    tipper_count += 1
                    if not (selected.Tipper.tipper[index] != 0).all() and mode != "phase":
                        omissions.append(dict(station=source["station"],period_s=period,reason="Tipper 含全零复分量，MTpy 官方地图不绘制该站箭头；未修改上游行为"))
                elif mode == "combined":
                    omissions.append(dict(station=source["station"],period_s=period,reason="无有效 Tipper，该站仅绘制相位张量"))
            except Exception as exc:
                omissions.append(dict(station=source["station"],period_s=period,reason=str(exc)))
        if not eligible:
            omissions.append(dict(station="ALL",period_s=period,reason="该周期没有可绘制测站"))
            continue
        # Upstream 2.1.4's ellipses branch leaves plot_x unset when plot_pt=False.
        # Its existing wedges branch supports arrow-only mode and calls the same
        # official _get_tipper_patch; no wedge is drawn when plot_pt=False.
        plot = maps.PlotPhaseTensorMaps(eligible, show_plot=False, plot_period=period,
            pt_type="wedges" if mode=="tipper" else "ellipses", plot_pt=mode!="tipper", plot_tipper="n" if mode=="phase" or not tipper_count else component,
            ellipse_colorby=color_by, ellipse_range=limits, ellipse_cmap=cmap,
            arrow_direction=1 if convention=="parkinson" else 0,
            fig_num=position+1, fig_size=(7,6), fig_dpi=150,
            plot_station=bool(request.get("labels",False)), station_id=(0,1000),
            plot_title=("Tipper " if mode=="tipper" else "Phase tensor "))
        if style.get("colorBy") == "phi2":
            # Use the phidet drawing channel, but supply the explicitly defined
            # angle. NaN gets Matplotlib's transparent bad color (outline kept).
            plot.get_pt_color_array = lambda pt: phi2_values(pt)[1]
        # All maps use the same symbol scales; MTpy generates ellipse geometry and vectors.
        plot.ellipse_size = span * .045 * ellipse_size
        plot.arrow_size = span * .12 * arrow_size
        plot.arrow_head_length = span*.008*arrow_size
        plot.arrow_head_width = span*.006*arrow_size
        plot.arrow_lw = span*.001*arrow_size
        plot.x_pad = plot.y_pad = span*.12
        plot.station_pad = span*.012
        plot._display_style=style;plot._display_scale=scale;plot._show_geographic_scale=bool(request.get("showScale"))
        plot.station_font_dict = {"size":float(request.get("labelFontSize") or 8),"weight":"normal","family":font}
        plot.plot(show=False)
        from matplotlib.ticker import FuncFormatter, MaxNLocator, FixedLocator
        plot.ax.set_xlim(bounds[:2]); plot.ax.set_ylim(bounds[2:])
        plot.ax.set_xlabel("");plot.ax.set_ylabel("")
        plot.ax.xaxis.set_major_formatter(FuncFormatter(lambda x,pos:f"{abs(x):.4f}".rstrip("0").rstrip(".")+"°"+("W" if x<0 else "E")))
        plot.ax.yaxis.set_major_formatter(FuncFormatter(lambda y,pos:f"{abs(y):.4f}".rstrip("0").rstrip(".")+"°"+("S" if y<0 else "N")))
        plot.ax.xaxis.set_major_locator(MaxNLocator(4,prune="both"));plot.ax.yaxis.set_major_locator(MaxNLocator(4,prune="both"))
        # Keep horizontal degree/direction labels clear of the compact panel seam.
        for axis_obj,lo,hi in [(plot.ax.xaxis,*bounds[:2]),(plot.ax.yaxis,*bounds[2:])]:
            ticks=MaxNLocator(4).tick_values(lo,hi)
            axis_obj.set_major_locator(FixedLocator([v for v in ticks if lo+.075*(hi-lo)<v<hi-.075*(hi-lo)]))
        plot.ax.tick_params(axis="both",labelrotation=0,labelsize=9)
        for text in plot.ax.get_xticklabels()+plot.ax.get_yticklabels():text.set_rotation(0);text.set_fontstyle("normal")
        # Keep MTpy's own Real/Imag legend inside EVERY map, independent of colorbar.
        if hasattr(plot,"ax2"):plot.fig.delaxes(plot.ax2)
        legend=plot.ax.get_legend()
        if legend and request.get("arrowLegend",True) is False:
            legend.remove();legend=None
        if legend:
            legend.set_loc("upper right")
            legend.set_bbox_to_anchor((.985,.985),transform=plot.ax.transAxes)
            legend.set_frame_on(True);legend.get_frame().set_facecolor("white");legend.get_frame().set_alpha(.92)
        vertical=legend_position in ["left","right"]
        if mode!="tipper" and colorbar is None:
            plot.cb_orientation="vertical" if vertical else "horizontal"
            plot.cb_position=[.45,.22,.025,.5] if vertical else [.2,.4,.5,.025]
            plot._add_colorbar_ellipse()
            if style:
                norm, palette = plot.cb.norm, plot.cb.cmap
                plot.ax2.clear()
                plot.cb = matplotlib.colorbar.ColorbarBase(plot.ax2, norm=norm, cmap=palette,
                    orientation=plot.cb_orientation, extend="both")
                if not vertical:
                    plot.cb.ax.xaxis.set_label_position("top")
            plot.cb.set_label(color_label,fontsize=font_size)
            if vertical or style:
                plot.cb.set_label("");plot.cb.ax.set_title(color_label,fontsize=font_size,pad=9)
            plot.cb.ax.tick_params(labelsize=font_size)
            plot.cb.set_ticks(__import__("numpy").arange(limits[0],limits[1]+limits[2]*.01,limits[2]))
            plot.ax.set_visible(False);plot.fig.canvas.draw()
            box=plot.cb.ax.get_tightbbox(plot.fig.canvas.get_renderer()).expanded(1.05,1.12)
            colorbar_path=output/"相位张量色标.pdf"
            plot.fig.savefig(colorbar_path,transparent=True,bbox_inches=box.transformed(plot.fig.dpi_scale_trans.inverted()))
            colorbar=dict(file=str(colorbar_path))
            plot.fig.delaxes(plot.ax2);plot.ax.set_visible(True)
        plot.ax.set_position([.15,.12,.78,.78]);plot.fig.canvas.draw()
        plot.ax.grid(bool(request.get("showGrid",True)),which="both")
        # Period labels stay inside the map in compact layout; no cropped titles.
        if request.get("layout","compact")=="compact" and not style:
            plot.ax.set_title("")
            plot.ax.text(.035,.965,f"T = {period:g} s",transform=plot.ax.transAxes,va="top",fontsize=11,
                         fontfamily="Times New Roman",bbox=dict(facecolor="white",edgecolor="none",alpha=.85,pad=2))
        if style:
            plot.ax.set_title("");decorate_map(plot,style,scale,period,position)
        arrow_reference = add_arrow_reference(plot) if request.get("arrowLegend",True) else None
        obstacles = artist_obstacles(plot)
        name=f"{position+1:02d}_{period:g}s"
        paths={}
        for ext in ["png","pdf","svg","eps"]:
            filename=output/f"{name}.{ext}"
            plot.fig.savefig(filename,format=ext,dpi=int(request.get("pngDpi",180)),transparent=True)
            paths[ext]=str(filename)
        panel=dict(period=period,stations=len(eligible),files=paths,obstacles=obstacles,arrowReference=arrow_reference,axis=list(plot.ax.get_position().bounds),
                   groupAxis=list(plot.ax.get_position().bounds),groupPDF=str(output/f"{name}_MTpy.pdf"))
        plot.fig.savefig(panel["groupPDF"],transparent=True)
        if request.get('aiLayers',False):panel['aiArtwork']=export_ai_artwork(plot,output,name)
        panels.append(panel)
        plt.close(plot.fig)
    if not panels:
        raise ValueError("所选周期均无可绘制数据："+json.dumps(omissions,ensure_ascii=False))
    report = dict(engine="MTpy-v2",versions=versions,sources=sources,settings={k:v for k,v in request.items() if k!="output"},
                  rules=dict(extrapolation=False,interpolation="MT.interpolate(method=slinear, bounds_error=True)",
                             dimensionality="Z.estimate_dimensionality; invalid tensors remain unclassified",
                             plot="mtpy.imaging.plot_phase_tensor_maps.PlotPhaseTensorMaps",
                             arrow_angles="MTpy native Tipper angles; plot uses arrow_direction",basemap="offline",
                             phi2="sqrt(det(Phi)); color = degrees(arctan(Phi2)); negative/nonfinite determinant = null, no absolute value"),
                  rows=all_rows,panels=panels,skipped=skipped,omissions=omissions)
    (output/"MTpy分析记录.json").write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding="utf-8")
    if all_rows:
        with (output/"维性与相位张量参数.csv").open("w",encoding="utf-8-sig",newline="") as handle:
            writer=csv.DictWriter(handle,fieldnames=list(all_rows[0]));writer.writeheader();writer.writerows(all_rows)
    # Assemble the official PNGs unchanged. Vector PDF layout is handled by pdf-lib in Node.
    from PIL import Image
    columns = min(len(panels), max(1,min(4,int(request.get("columns",2)))))
    images = [Image.open(p["files"]["png"]).convert("RGB") for p in panels]
    width,height = images[0].size
    grid = Image.new("RGB",(width*columns,height*math.ceil(len(images)/columns)),"white")
    for i,img in enumerate(images):grid.paste(img,((i%columns)*width,(i//columns)*height));img.close()
    preview = output/"多周期组图.png";grid.save(preview);grid.close()
    title_file=None
    if str(request.get("title","")).strip():
        fig=plt.figure(figsize=(8,1))
        text=fig.text(.5,.5,str(request["title"]).strip(),ha="center",va="center",fontsize=16,
                      fontfamily=["Times New Roman","Arial Unicode MS"])
        fig.canvas.draw()
        box=text.get_window_extent(fig.canvas.get_renderer()).expanded(1.03,1.3)
        title_file=str(output/"图件标题.pdf")
        fig.savefig(title_file,transparent=True,bbox_inches=box.transformed(fig.dpi_scale_trans.inverted()))
        plt.close(fig)
    progress("MTpy 计算与图件导出完成",100)
    return dict(ok=True,output=str(output),preview=str(preview),panels=panels,columns=columns,
                presentation=style,displayScale=scale,
                rows=all_rows,skipped=skipped,omissions=omissions,versions=versions,bounds=bounds,
                titlePDF=title_file,colorbar=colorbar,colorbarPosition=legend_position,colorbarMode=request.get("colorbarMode",request.get("legendMode","shared")),
                colorbarAlign=request.get("colorbarAlign","center"),colorbarGap=float(request.get("colorbarGap",3)),
                ellipseScale=ellipse_size,arrowScale=arrow_size,lastRowAlign=request.get("lastRowAlign","center"),
                layout=request.get("layout","compact"),panelGap=float(request.get("panelGap",0))/scale)


if __name__ == "__main__":
    try:
        request=json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            result=render(request)
        print(json.dumps(result,ensure_ascii=False,allow_nan=False))
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
