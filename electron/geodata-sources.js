const raw='https://raw.githubusercontent.com/';
const hima={homepage:'https://github.com/HimaTibetMap/HimaTibetMap',license:'ODC-By 1.0（原始第三方内容保留其授权）',licenseUrl:raw+'HimaTibetMap/HimaTibetMap/master/license.txt',citation:'Styron, Taylor & Okoronkwo (2010), Database of active structures from the Indo-Asian collision, Eos, 91(20), 181–182. DOI:10.1029/2010EO200001'};
const plates={homepage:'https://github.com/fraxen/tectonicplates',license:'ODC-By 1.0',licenseUrl:raw+'fraxen/tectonicplates/master/LICENSE.md',citation:'Bird (2003), An updated digital model of plate boundaries, Geochemistry Geophysics Geosystems, 4(3), 1027. DOI:10.1029/2001GC000252'};
const SOURCES=[
 {id:'hima-faults',name:'HimaTibetMap · 喜马拉雅—青藏活动断层',category:'活动断层',url:raw+'HimaTibetMap/HimaTibetMap/master/geojson/HimaTibetMap.geojson',...hima},
 {id:'hima-sutures',name:'HimaTibetMap · 缝合带',category:'缝合带',url:raw+'HimaTibetMap/HimaTibetMap/master/geojson/sutures.geojson',...hima},
 {id:'hima-volcanics',name:'HimaTibetMap · 新生代火山岩',category:'火山岩',url:raw+'HimaTibetMap/HimaTibetMap/master/geojson/volcanic_rocks.geojson',...hima},
 {id:'gem-faults',name:'GEM · 全球活动断层',category:'活动断层',url:raw+'GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults.geojson',homepage:'https://github.com/GEMScienceTools/gem-global-active-faults',license:'CC BY-SA 4.0',licenseUrl:raw+'GEMScienceTools/gem-global-active-faults/master/LICENSE.txt',citation:'Styron & Pagani (2020), The GEM Global Active Faults Database. Earthquake Spectra 36(1_suppl),160–180. DOI:10.1177/8755293020944182'},
 {id:'pb-boundaries',name:'PB2002 · 全球板块边界',category:'板块边界',url:raw+'fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json',...plates},
 {id:'pb-plates',name:'PB2002 · 全球板块区域',category:'板块区域',url:raw+'fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json',...plates},
 {id:'china-faults',name:'中国活动断层数据中心',category:'活动断层',access:'portal',homepage:'https://www.activefault-datacenter.cn/',license:'以数据提供方授权为准',description:'在官网查询或申请数据，下载后导入 SHP / GeoJSON / GMT；未提供可验证的匿名批量矢量接口。'},
 {id:'cgs',name:'中国地质调查局 · 地质云',category:'地质构造',access:'portal',homepage:'https://geocloud.cgs.gov.cn/',license:'以具体数据集授权为准',description:'不同地质图的下载权限和比例尺不同。官网获取矢量文件后导入；如获 WFS 地址，可在服务连接中加载。'},
 {id:'onegeology',name:'OneGeology · 各国地质图服务',category:'地质构造',access:'wfs',homepage:'https://portal.onegeology.org/',license:'以各服务提供方授权为准',description:'从门户选择提供矢量 WFS 的服务，复制地址后查询图层并按当前范围加载。WMS 仅提供图片，不能转换为真实构造矢量。'},
 {id:'sarig',name:'SARIG · 南澳地质构造 WFS',category:'地质构造',access:'wfs',serviceUrl:'https://services.sarig.sa.gov.au/vector/geology/wfs',homepage:'https://www.geoscience.gov.au/web-services',license:'以 South Australia DEM 服务授权为准',description:'已配置真实地质 WFS，可查询不同年代断层、地质单元和盆地。覆盖南澳大利亚；请先切换至该区域。'},
 {id:'custom-wfs',name:'自定义 WFS / GeoJSON 数据服务',category:'地质构造',access:'wfs',description:'支持 WFS 2.0/1.1（GeoJSON 输出）或直接 GeoJSON 下载地址。数据须允许你的使用和下载。'}
].map(s=>({...s,access:s.access||'download'}));
module.exports={SOURCES};
