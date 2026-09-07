// Names are metadata: language selection never changes scientific geometry.
const key = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s_–—−-]+/g, ' ').trim();
const terms = [
 ['雅鲁藏布缝合带','Indus–Yarlung Suture Zone','IYZS',['Indus-Yarlung Suture Zone','Yarlung Zangbo Suture Zone','雅鲁藏布江缝合带']],
 ['班公湖—怒江缝合带','Bangong–Nujiang Suture Zone','BNS',['Bangong-Nujiang Suture Zone','班公怒江缝合带','班公湖怒江缝合带']],
 ['金沙江缝合带','Jinsha Suture Zone','',[]],
 ['拉萨地块','Lhasa Terrane','',[]],
 ['侏罗纪岩浆弧','Jurassic Arc','',['JurasslcArc','JurassicArc','侏罗纪弧']],
 ['雄村','Xiongcun','XC',[]],
 ['拉萨','Lhasa','',[]],['林芝','Nyingchi','',['林芝市']],['日喀则','Xigaze','',['Shigatse','日喀则市']],
 ['城市','Cities','',['City']],['地点','Places','',['Place']],['矿床','Deposits','',['Deposit']],
 ['断层','Faults','',['Fault']],['活动断层','Active faults','',['Active fault']],['缝合带','Suture zones','',['Suture zone']],
 ['构造区域','Tectonic regions','',[]],['研究区','Study area','',[]],['板块边界','Plate boundaries','',[]],['板块区域','Tectonic plates','',[]],
 ['火山岩','Volcanic rocks','',[]],['地质构造','Geological structures','',[]],
 ['测点','Station','',['Stations']],['走向','Strike','',[]],['相位张量','Phase tensor','',[]],['感应矢量','Tipper','',[]],['图例','Legend','',[]]
].map(([nameZh,nameEn,abbreviation,aliases])=>({nameZh,nameEn,abbreviation,aliases}));
const index = new Map();
for(const t of terms)for(const a of [t.nameZh,t.nameEn,t.abbreviation,...t.aliases])if(a)index.set(key(a),t);
function known(name){return index.get(key(name));}
function enrich(f){
 const p=f.properties||{},originalName=String(f.originalName??p.originalName??f.name??'');
 const t=known(originalName)||known(f.name);
 return {...f,originalName,nameZh:String(f.nameZh??p.nameZh??p['name:zh']??t?.nameZh??(/[\u3400-\u9fff]/.test(f.name)?f.name:'')),nameEn:String(f.nameEn??p.nameEn??p['name:en']??t?.nameEn??(/^[\x20-\x7e\u00c0-\u024f–—]+$/.test(f.name)&&!/^未命名/.test(f.name)?f.name:'')),abbreviation:f.abbreviation||t?.abbreviation||''};
}
function settings(c={}){return {language:['zh','en','original'].includes(c.language)?c.language:'original',nameFormat:['name','abbreviation','both'].includes(c.nameFormat)?c.nameFormat:'name'};}
function label(f,s={},c={}){
 const cfg=settings(c),v=enrich(f);
 if(cfg.language==='original')return (s.labelMode==='custom'?f.label:s.labelMode==='abbreviation'?v.abbreviation:f.name)||f.name;
 const full=cfg.language==='zh'?v.nameZh:v.nameEn;
 // Explicit abbreviations are shared by both languages; never silently fall back
 // to an untranslated source name when the user requested a uniform language.
 if(cfg.nameFormat==='abbreviation')return v.abbreviation||full||'';
 return full ? full+(cfg.nameFormat==='both'&&v.abbreviation?` (${v.abbreviation})`:'') : '';
}
function pending(c){return (c.features||[]).filter(f=>f.visible!==false&&({...c.categoryStyles?.[f.category],...f.style}).showLabel!==false&&!label(f,{},c));}
function translated(text,language){if(language==='original'||!language)return text;const t=known(text);if(t)return language==='zh'?t.nameZh:t.nameEn;return language==='zh'?(/[\u3400-\u9fff]/.test(text)?text:''):(/^[\x20-\x7e\u00c0-\u024f–—]+$/.test(text)?text:'');}
function queryAliases(q){const t=known(q);return [...new Set([q,...(t?[t.nameZh,t.nameEn,t.abbreviation,...t.aliases]:[])].filter(Boolean).map(key))];}
function categoryLabel(category,c={}){const language=settings(c).language;if(language==='original')return category;return c.categoryNames?.[category]?.[language==='zh'?'nameZh':'nameEn']||translated(category,language);}
function plotConfig(c={}){const language=settings(c.cartography).language;if(language==='original')return c;return {...c,legend:{...c.legend,title:translated(c.legend?.title||'Legend',language)||(language==='zh'?'图例':'Legend')}};}
function identity(f){return `${f.source?.id||'manual'}|${f.id}`;}
function applyDictionary(f,dictionary={}){return enrich({...f,...dictionary[identity(f)]});}
module.exports={key,known,enrich,settings,label,pending,translated,queryAliases,categoryLabel,plotConfig,identity,applyDictionary};
