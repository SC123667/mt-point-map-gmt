"""Scientific color regression, including negative determinants and real artists."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from tempfile import TemporaryDirectory
import numpy as np
from mtpy import MT
from matplotlib.patches import Ellipse
from mtpy.imaging import mtcolors

spec=importlib.util.spec_from_file_location('backend',Path(__file__).parents[1]/'electron/mtpy_backend.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
raw,angle=w.phi2_values(SimpleNamespace(det=np.array([1.,4.,0.,-1.,np.nan,np.inf])))
np.testing.assert_allclose(raw[:3],[1,2,0]);np.testing.assert_allclose(angle[:3],[45,np.degrees(np.arctan(2)),0]);assert np.isnan(raw[3:]).all()
with TemporaryDirectory(prefix='mt-phase-colors-') as tmp:
 root=Path(tmp);files=[];tensors=[]
 for name,x,phi in [('ONE',88,np.eye(2)),('TWO',88.1,np.diag([1.,4.])),('NEG',88.2,np.diag([2.,-1.]))]:
  mt=MT();mt.station=name;mt.survey='color';mt.latitude=30.;mt.longitude=x;mt.frequency=np.array([1.,.1]);mt.impedance=np.repeat(np.array([np.eye(2)+1j*phi]),2,axis=0);mt.impedance_error=np.full((2,2,2),.001)
  file=root/(name+'.edi');mt.write(fn=file,file_type='edi');files.append(str(file));tensors.append(mt.pt)
 before=[Path(f).read_bytes() for f in files];captured=[];export=w.export_ai_artwork
 def capture(plot,*args):
  captured.append([(p.center,p.width,p.height,p.angle,p.get_facecolor()) for p in plot.ax.patches if isinstance(p,Ellipse)])
  return export(plot,*args)
 w.export_ai_artwork=capture;rows=[]
 for mode in ['beta','phimin','phimax','phi2']:
  result=w.render(dict(action='render',files=files,periods=[1],output=str(root/mode),mode='phase',aiLayers=True,presentation={'colorBy':mode}))
  rows.append(result['rows']);assert len(captured[-1])==3
  for i,(artist,pt) in enumerate(zip(captured[-1],tensors)):
   if mode=='beta':val=pt.beta[0];lo,hi=-9,9;cmap='mt_seg_bl2wh2rd';key='skew'
   else:
    val=(w.phi2_values(pt)[1] if mode=='phi2' else getattr(pt,mode))[0];lo,hi=0,90;cmap='mt_bl2gr2rd';key='phidet' if mode=='phi2' else mode
   np.testing.assert_allclose(artist[-1],mtcolors.get_plot_color(val,key,cmap,lo,hi),atol=1e-10)
  if mode=='phi2':
   assert captured[-1][-1][-1][-1]==0,'Negative determinant must be unfilled'
   assert result['rows'][-1]['phi2'] is None and result['rows'][-1]['phi2_reason'];assert result['omissions']
 for artists in captured[1:]:assert [a[:4] for a in artists]==[a[:4] for a in captured[0]],'Changing color cannot change ellipse geometry'
 assert all(r==rows[0] for r in rows),'Analysis invariant across color choices'
 assert [Path(f).read_bytes() for f in files]==before
 np.testing.assert_allclose(rows[0][1]['phi2_phase_deg'],np.degrees(np.arctan(2)))
 print('PHASE_COLORS_OK: official phimax, explicit Phi2 arctangent, negative determinant, actual artist colors, unchanged geometry and inputs')
