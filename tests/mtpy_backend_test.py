"""Scientific integration tests against installed MTpy, not the old JS maths."""
import importlib.util
import json
from pathlib import Path
import tempfile
import numpy as np
from mtpy import MT

spec=importlib.util.spec_from_file_location("worker",Path(__file__).parents[1]/"electron"/"mtpy_backend.py")
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)


def station(name, longitude, tensor):
    mt=MT()
    mt.station=name;mt.survey="synthetic";mt.latitude=30.0;mt.longitude=longitude
    mt.frequency=np.array([1.,.1,.01])
    mt.impedance=np.repeat(np.asarray(tensor,dtype=complex)[None,:,:],3,axis=0)
    mt.impedance_error=np.full((3,2,2),.01)
    mt.tipper=np.repeat(np.array([[[.15+.05j,.25+.1j]]]),3,axis=0)
    mt.tipper_error=np.full((3,1,2),.005)
    return mt


with tempfile.TemporaryDirectory(prefix="mtpy-scientific-") as directory:
    root=Path(directory)
    one=station('ONE',88.,[[0,1+1j],[-1-1j,0]])
    two=station('TWO',88.1,[[0,1+2j],[-1-1j,0]])
    three=station('THREE',88.2,[[1+1j,2j],[0,1+1j]])
    for mt,expected in [(one,1),(two,2),(three,3)]:
        source=dict(station=mt.station,path='synthetic')
        selected,index,method=worker.select_period(mt,10.,1.)
        row,valid_z,valid_t=worker.metric_row(selected,source,10.,index,method,5.,.1)
        assert valid_z and valid_t
        assert row['dimension']==expected, row
        np.testing.assert_allclose(row['beta_deg'],mt.pt.beta[index],rtol=1e-12)
        np.testing.assert_allclose(row['eccentricity'],mt.pt.eccentricity[index],rtol=1e-12)
        np.testing.assert_allclose(row['tipper_real_magnitude'],mt.Tipper.mag_real[index],rtol=1e-12)
        selected,index,method=worker.select_period(mt,3.,1.)
        direct=mt.interpolate(np.array([3.]),method='slinear',bounds_error=True)
        np.testing.assert_allclose(selected.Z.z,direct.Z.z,rtol=1e-12)
        assert method!='original'
        try:worker.select_period(mt,1000.,1.)
        except ValueError:pass
        else:raise AssertionError('out-of-range period was accepted')
        try:worker.select_period(mt,3.,.5)
        except ValueError:pass
        else:raise AssertionError('interpolation across forbidden gap')
    bad=station('BAD',88.3,[[1+1j,1+2j],[1+3j,1+4j]])
    row,valid,_=worker.metric_row(bad,dict(station='BAD',path='synthetic'),10.,1,'original',5.,.1)
    assert row['dimension'] is None and not valid
    paths=[]
    for mt in [one,two,three]:
        filename=root/(mt.station+'.edi')
        mt.write(fn=filename,file_type='edi');paths.append(str(filename))
    before=[Path(p).read_bytes() for p in paths]
    result=worker.render(dict(action='render',files=paths,periods=[1,10,100,1000],output=str(root/'result'),columns=2,aiLayers=True))
    assert result['ok'] and len(result['panels'])==3
    assert all(p['stations']==3 for p in result['panels'])
    for panel in result['panels']:
        artwork={p['role']:p for p in panel['aiArtwork']}
        assert artwork['ellipses']['artists']==3
        assert artwork['real']['artists']==artwork['imag']['artists']==3
        assert all(Path(p['file']).stat().st_size>100 for p in artwork.values())
    for panel in result['panels']:
        reference=panel['arrowReference'];assert reference['magnitude']==.5
        assert len(reference['components'])==2
        for component in reference['components']:
            np.testing.assert_allclose(component['visiblePoints'],component['shaftPoints']+reference['headPoints'],rtol=1e-9)
    assert result['panels'][0]['arrowReference']==result['panels'][1]['arrowReference']
    assert len(result['rows'])==9
    assert any(o['period_s']==1000 for o in result['omissions'])
    assert Path(result['preview']).stat().st_size>10000
    assert all(Path(p['files']['pdf']).read_bytes().startswith(b'%PDF-') for p in result['panels'])
    assert before==[Path(p).read_bytes() for p in paths]
    resized=worker.render(dict(action='render',files=paths,periods=[1],output=str(root/'resized'),ellipseScale=1.4,arrowScale=.85))
    assert resized['rows']==[r for r in result['rows'] if r['period_s']==1]
    original=result['panels'][0]['obstacles'];changed=resized['panels'][0]['obstacles']
    assert [b for b in original if b['kind']=='arrow']==[b for b in changed if b['kind']=='arrow']
    a=[b for b in original if b['kind']=='ellipse'];b=[b for b in changed if b['kind']=='ellipse']
    assert len(a)==len(b)>0 and all(y['width']>x['width']*1.7 for x,y in zip(a,b))
    assert resized['panels'][0]['arrowReference']==result['panels'][0]['arrowReference']
    scaled=worker.render(dict(action='render',files=paths,periods=[1],output=str(root/'scaled'),arrowScale=1.7,mode='tipper',component='yi',convention='wiese'))
    assert [c['component'] for c in scaled['panels'][0]['arrowReference']['components']]==['Imag']
    for old,new in zip(result['panels'][0]['arrowReference']['components'][1:],scaled['panels'][0]['arrowReference']['components']):
        np.testing.assert_allclose(new['visiblePoints'],old['visiblePoints']*2,rtol=1e-9)
    phase=worker.render(dict(action='render',files=paths,periods=[1],output=str(root/'phase'),mode='phase'))
    assert phase['panels'][0]['arrowReference'] is None
    report=json.loads((root/'result'/'MTpy分析记录.json').read_text())
    assert report['versions']['mtpy-v2']=='2.1.4'
    print('MTPY_SCIENTIFIC_OK: known 1D/2D/3D tensors; exact official values; bounded interpolation; invalid tensor exclusion; original EDI roundtrip; official plots; input integrity')
