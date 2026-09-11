// Presentation only. Existing controls and their handlers are moved, never cloned.
const WORKBENCH_PANELS = window.WorkbenchPanels;
const wb = {ready:false, commands:[], returnFocus:null, wide:false};
const we = id => document.getElementById(id);
function wbElement(tag, className, text) {const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;}
function wbPanel(key,title){const f=wbElement('fieldset','workbench-section');f.dataset.settingsPanel=key;f.append(wbElement('legend','',title));we('workbenchStorage').append(f);return f;}
function wbMove(host, ids){for(const id of ids){const n=we(id);if(n)host.append(n);}}
function wbMoveLabel(host,id){const n=we(id);if(n)host.append(n.closest('label')||n);}
function wbSection(parent,title,first,last,open=true){
  if(!first||!last||first.parentNode!==parent||last.parentNode!==parent)return;
  const section=wbElement('details','wb-section');section.open=open;
  section.append(wbElement('summary','',title));parent.insertBefore(section,first);
  let n=first;while(n){const next=n.nextElementSibling;section.append(n);if(n===last)break;n=next;}
}
function initWorkbenchUI(){
  const storage=wbElement('div');storage.id='workbenchStorage';storage.hidden=true;document.body.append(storage);
  const navigation=document.querySelector('.settings-toolbar');
  const nav=wbElement('nav','wb-navigation');nav.id='workbenchNav';nav.setAttribute('aria-label','所有制图功能');
  const search=wbElement('button','wb-search-trigger','搜索功能');search.id='workbenchSearch';search.type='button';search.append(wbElement('kbd','',navigator.platform.includes('Mac')?'⌘ K':'Ctrl K'));search.onclick=openWorkbenchSearch;
  navigation.prepend(search,nav);
  navigation.querySelectorAll('.toolbar-menu,.sidebar-title,.sidebar-spacer').forEach(n=>n.hidden=true);
  for(const [group,key,title,description,keywords] of WORKBENCH_PANELS){
    SETTINGS_PANELS[key]=title;
    let section=[...nav.children].find(n=>n.dataset.group===group);
    if(!section){
      section=wbElement('section','wb-nav-group');section.dataset.group=group;
      const heading=wbElement('h2'),toggle=wbElement('button','wb-group-toggle',group);toggle.type='button';toggle.setAttribute('aria-expanded',String(group!=='测点与 MT'));
      toggle.onclick=()=>{const collapsed=section.classList.toggle('collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));};
      if(group==='测点与 MT')section.classList.add('collapsed');heading.append(toggle);section.append(heading);nav.append(section);
    }
    const b=wbElement('button','wb-nav-item',title);b.type='button';b.dataset.panel=key;b.title=description;b.onclick=()=>openSettingsPanel(key);section.append(b);
    wb.commands.push({key,title,description,keywords,group,run:()=>openSettingsPanel(key)});
  }
  const imports=wbPanel('imports','添加到当前工程');
  imports.append(wbElement('p','wb-intro','从点位表或 EDI 开始。只绘制区域底图时，直接设置经纬度范围即可。'));
  wbMove(imports,['sidebarImportFileBtn','sidebarImportEdiBtn','sidebarLoadSampleBtn','rangeMapBtn']);
  const outputs=wbPanel('export','输出文件');
  wbMoveLabel(outputs,'outputNameInput');wbMoveLabel(outputs,'pngDpiInput');
  outputs.append(wbElement('p','wb-export-note','直接导出 .ai 需要本机安装 Illustrator。AI 编辑包可在另一台电脑运行包内脚本；地形晕渲仍为影像。'));
  wbMove(outputs,['exportAiDirectBtn','exportAiBtn','exportPdfBtn','exportPngBtn','exportEpsBtn','exportAllBtn','saveScriptBtn']);
  const files=wbPanel('storage','工作目录');wbMove(files,['workspacePathText','openWorkspaceBtn']);wbMoveLabel(files,'terrainRegionNameInput');
  const terrain=document.querySelector('fieldset[data-settings-panel="terrain"]');
  const cache=we('terrainCacheSummaryText').closest('details');files.append(cache);
  const cleanup=wbElement('details','wb-section');cleanup.append(wbElement('summary','','清理地形文件'));wbMove(cleanup,['deleteTerrainBtn','clearTerrainCacheBtn']);files.append(cleanup);
  const names=wbPanel('names','统一绘图名称');
  const editor=document.querySelector('fieldset[data-settings-panel="cartography"]');
  let n=we('cart-language').closest('.cart-grid');const last=we('cart-paper-style').parentElement;
  while(n){const next=n.nextElementSibling;names.append(n);if(n===last)break;n=next;}
  we('library-label-settings').onclick=()=>openSettingsPanel('names');
  we('cart-pending').addEventListener('click',event=>{
    if(!event.target.closest('[data-name-id]'))return;
    openSettingsPanel('cartography');we('workbenchEditorTab0').click();
    const input=we(state.cartography.language==='zh'?'cart-name-zh':'cart-name-en');
    for(let parent=input.parentElement;parent&&parent!==editor;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    input.focus();
  });
  const elements=document.querySelector('fieldset[data-settings-panel="elements"]');
  wbMoveLabel(elements,'showTitleInput');wbMoveLabel(elements,'titleInput');
  // Group large editors into meaningful, independently collapsible sections.
  wbSection(editor,'对象与坐标',we('cart-selected').closest('.cart-grid'),we('cart-coordinates').closest('label').nextElementSibling,true);
  const objectSection=we('cart-selected').closest('.wb-section');
  wbSection(objectSection,'双语名称与类别',we('cart-name-zh').closest('.cart-grid'),we('cart-remember-names').closest('label'),false);
  createWorkbenchEditorTabs(editor,objectSection);
  wbSection(terrain,'外观',we('showTerrainInput').closest('label'),we('terrainIntensityInput').closest('label'),true);
  wbSection(terrain,'数据来源与下载',we('terrainAllowDownloadInput').closest('label'),we('terrainProgressPanel'),true);
  const contour=document.querySelector('fieldset[data-settings-panel="contours"]');
  const detailed=wbElement('details','wb-section');detailed.append(wbElement('summary','','线条与高程标注'));
  for(const id of ['cart-contour-width','cart-contour-majorWidth','cart-contour-color','cart-contour-fontSize','cart-contour-minLength','cart-contour-labelSpacing','cart-contour-labels'])wbMoveLabel(detailed,id);contour.append(detailed);
  const help=wbPanel('help','制图工作流程');
  for(const [title,description] of [['1 · 确定范围','选择区域底图，填写经纬度范围与投影；也可以导入测点后自动计算范围。'],['2 · 组合图层','选择地形和等高线，叠加本地构造或添加自定义点、线、区域。'],['3 · 调整表达','在名称与语言中统一中英文，在标题与图件元素中设置比例尺和标题。'],['4 · 保存与导出','保存 .mtgmt 工程以便继续编辑，使用矢量 PDF 在 Illustrator 中排版。']]){help.append(wbElement('h3','',title),wbElement('p','wb-intro',description));}
  wbMove(help,['tableHelpBtn']);help.append(wbElement('p','wb-intro','⌘/Ctrl + K 搜索全部功能。Esc 关闭搜索或参数侧栏。参数侧栏中的修改保留，点击“更新预览”应用到地图。'));
  const terrainHelp=wbElement('details','wb-section');terrainHelp.append(wbElement('summary','','地形数据源'));wbMove(terrainHelp,['terrainSourceHint']);help.append(terrainHelp);
  const sourceInfo=wbElement('details','wb-section');sourceInfo.append(wbElement('summary','','来源与许可'));we('cart-source-info').before(sourceInfo);wbMove(sourceInfo,['cart-source-info','cart-homepage']);
  // Installation progress belongs to the engine panel, not a page-wide banner.
  document.querySelector('fieldset[data-settings-panel="gmt"]').append(we('downloadPanel'));
  const dialog=el.settingsDialog;document.querySelector('.layout').append(dialog);
  dialog.classList.add('wb-inspector');dialog.setAttribute('aria-label','绘图参数');
  const head=dialog.querySelector('.dialog-head');const intro=wbElement('p','wb-panel-description');intro.id='workbenchPanelDescription';head.after(intro);
  const wide=wbElement('button','wb-expand','展开');wide.id='workbenchExpand';wide.type='button';wide.title='切换参数面板宽度';wide.onclick=()=>{wb.wide=!wb.wide;document.querySelector('.layout').classList.toggle('wb-wide',wb.wide);wide.textContent=wb.wide?'收窄':'展开';};head.insertBefore(wide,el.settingsCloseBtn);
  el.settingsCancelBtn.textContent='收起';el.settingsCloseBtn.textContent='关闭';el.settingsConfirmBtn.textContent='更新预览';
  compactWorkbenchCopy(help);
  createWorkbenchSearch();createWorkbenchWelcome();
  for(const command of wb.commands){
    const text=[...document.querySelectorAll(`[data-settings-panel="${command.key}"]`)].filter(x=>x.tagName!=='BUTTON').map(x=>x.textContent).join(' ');
    command.search=(command.title+' '+command.description+' '+command.key+' '+command.keywords+' '+text).toLowerCase();
  }
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openWorkbenchSearch();}
    else if(e.key==='Escape'&&el.settingsDialog.open&&!document.querySelector('dialog:modal')){e.preventDefault();closeSettingsDialog();}
  });
  wb.ready=true;
}
function showWorkbenchPanel(key){
  if(!wb.ready)return;
  const layout=document.querySelector('.layout');layout.classList.add('wb-panel-open');
  if(layout.classList.contains('quick-inspector-open'))el.quickInspectorClose.click();
  layout.dataset.panel=key;el.settingsDialog.dataset.panel=key;
  const entry=WORKBENCH_PANELS.find(p=>p[1]===key);
  const activeGroup=[...we('workbenchNav').children].find(n=>n.dataset.group===entry?.[0]);
  if(activeGroup){activeGroup.classList.remove('collapsed');activeGroup.querySelector('.wb-group-toggle').setAttribute('aria-expanded','true');}
  we('workbenchPanelDescription').textContent=entry?.[3]||'';
  document.querySelectorAll('.wb-nav-item').forEach(b=>{b.classList.toggle('selected',b.dataset.panel===key);if(b.dataset.panel===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  el.settingsConfirmBtn.textContent=['gmt','storage','help','export','imports','data','quality'].includes(key)?'完成':'更新预览';
  el.settingsDialogBody.scrollTop=0;
}
function hideWorkbenchPanel(){
  document.querySelector('.layout')?.classList.remove('wb-panel-open');
  document.querySelectorAll('.wb-nav-item').forEach(b=>{b.classList.remove('selected');b.removeAttribute('aria-current');});
}
function createWorkbenchSearch(){
  const d=wbElement('dialog','wb-command-dialog');d.id='workbenchCommandDialog';d.setAttribute('aria-label','搜索全部功能');
  const input=wbElement('input');input.id='workbenchCommandInput';input.type='search';input.placeholder='搜索功能，例如：中文、地形、PDF…';input.setAttribute('aria-label','功能关键词');
  const results=wbElement('div','wb-command-results');results.id='workbenchCommandResults';
  const footer=wbElement('div','wb-command-footer');footer.append(wbElement('span','','↑ ↓ 选择 · Enter 打开 · Esc 关闭'));
  const close=wbElement('button','','关闭');close.type='button';close.onclick=()=>d.close();footer.append(close);d.append(input,results,footer);document.body.append(d);
  input.oninput=renderWorkbenchSearch;
  d.addEventListener('close',()=>wb.returnFocus?.isConnected&&wb.returnFocus.focus({preventScroll:true}));
  d.addEventListener('keydown',e=>{
    const buttons=[...results.querySelectorAll('button')];let i=buttons.indexOf(document.activeElement);
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();i=e.key==='ArrowDown'?Math.min(i+1,buttons.length-1):Math.max(i-1,0);buttons[i]?.focus();}
    if(e.key==='Enter'&&document.activeElement===input){e.preventDefault();buttons[0]?.click();}
  });
}
function openWorkbenchSearch(){const d=we('workbenchCommandDialog');if(!d)return;wb.returnFocus=document.activeElement;we('workbenchCommandInput').value='';renderWorkbenchSearch();if(!d.open)d.showModal();we('workbenchCommandInput').focus();}
function renderWorkbenchSearch(){
  const query=we('workbenchCommandInput').value.toLowerCase().trim(),terms=query.split(/\s+/).filter(Boolean);
  const score=c=>!query?0:terms.reduce((n,t)=>n+(c.title.toLowerCase().includes(t)?100:c.keywords.toLowerCase().includes(t)?80:c.description.toLowerCase().includes(t)?20:1),0);
  const found=wb.commands.filter(c=>terms.every(t=>c.search.includes(t))).sort((a,b)=>score(b)-score(a));
  const results=we('workbenchCommandResults');results.replaceChildren();
  for(const c of found){const b=wbElement('button','wb-command-item');b.type='button';b.append(wbElement('strong','',c.title),wbElement('small','',c.group));b.onclick=()=>{wb.returnFocus=null;we('workbenchCommandDialog').close();c.run();el.settingsCloseBtn.focus();};results.append(b);}
  if(!found.length)results.append(wbElement('p','wb-search-empty','没有匹配功能。试试“地形”“语言”“导出”，或缩短关键词。'));
}
function createWorkbenchWelcome(){
  const welcome=wbElement('div','wb-welcome');welcome.id='workbenchWelcome';
  welcome.append(wbElement('h2','','开始制图'));
  const actions=wbElement('div','wb-welcome-actions');
  const region=wbElement('button','primary','绘制区域底图');region.type='button';region.onclick=()=>{setPlotType('baseMap');openSettingsPanel('frame');};
  const data=wbElement('button','','导入测点 / EDI');data.type='button';data.onclick=()=>openSettingsPanel('imports');
  actions.append(region,data);welcome.append(actions);el.previewBox.append(welcome);
  const update=()=>{welcome.hidden=!!state.preview.imagePath||el.previewImageLayer.getAttribute('aria-hidden')==='false'||!!el.previewImageLayer.style.backgroundImage;};
  new MutationObserver(update).observe(el.previewImageLayer,{attributes:true,childList:true});update();
}
function compactWorkbenchCopy(help){
  // Keep operational state and errors in place; move static instructions to Help.
  for(const [,key,title] of WORKBENCH_PANELS){
    if(key==='help')continue;
    const notes=[...document.querySelectorAll(`[data-settings-panel="${key}"] p:not([id]):not(.wb-export-note)`)].filter(p=>!p.querySelector('input,button,select'));
    if(!notes.length)continue;
    const detail=wbElement('details','wb-section');detail.append(wbElement('summary','',title));notes.forEach(p=>detail.append(p));help.append(detail);
  }
  const text={
    'sidebarImportFileBtn':'点位表 · TXT / CSV / Excel','sidebarImportEdiBtn':'EDI 文件夹','sidebarLoadSampleBtn':'示例数据',
    'rangeMapBtn':'按经纬度绘图','exportPdfBtn':'PDF · 可编辑矢量','exportPngBtn':'PNG · 图像','exportEpsBtn':'EPS · 矢量',
    'exportAllBtn':'PNG + PDF + EPS','saveScriptBtn':'GMT 脚本',
    'cart-draw-line':'绘制线','cart-draw-polygon':'绘制区域','cart-edit-vertices':'编辑节点',
    'cart-new':'新增','cart-import':'导入','cart-export':'导出 GeoJSON','cart-delete':'移除',
    'library-import':'同步文件夹','library-refresh':'刷新索引','library-open':'打开目录','library-cancel':'取消',
    'library-paper':'论文样式','library-label-settings':'名称与语言','library-check':'查询当前范围','library-edit':'转为可编辑图层'
  };
  for(const [id,value] of Object.entries(text)){if(we(id))we(id).textContent=value;}
  const labels={'showTerrainInput':'地形晕渲','terrainAllowDownloadInput':'允许下载','cart-smart-labels':'名称避让','cart-hide-generic':'隐藏未命名标签','library-enabled':'叠加构造','library-labels':'构造名称','cart-visible':'显示','cart-remember-names':'记住译名修订'};
  for(const [id,value] of Object.entries(labels)){const input=we(id),label=input?.closest('label');if(label){for(const n of [...label.childNodes])if(n.nodeType===Node.TEXT_NODE)n.remove();label.append(document.createTextNode(value));}}
}
function createWorkbenchEditorTabs(editor,geometry){
  const paste=we('cart-paste').closest('details');
  const tabs=wbElement('div','wb-editor-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','对象编辑');
  editor.insertBefore(tabs,geometry);
  const groups=[['对象',[geometry,paste]],['样式',[we('cart-styles').closest('details')]],['来源与锚点',[we('cart-source-details').closest('details')]]];
  const entries=groups.map(([title,nodes],i)=>{
    const page=wbElement('div','wb-editor-page');page.id='workbenchEditorPage'+i;page.setAttribute('role','tabpanel');page.hidden=i!==0;
    nodes.forEach(n=>{page.append(n);if(n.tagName==='DETAILS'&&n!==paste)n.open=true;});
    editor.insertBefore(page,we('cart-save').parentElement);
    const button=wbElement('button','',title);button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls',page.id);button.setAttribute('aria-selected',String(i===0));button.id='workbenchEditorTab'+i;page.setAttribute('aria-labelledby',button.id);tabs.append(button);return {page,button};
  });
  const select=i=>entries.forEach((e,j)=>{e.page.hidden=i!==j;e.button.setAttribute('aria-selected',String(i===j));e.button.tabIndex=i===j?0:-1;});
  select(0);
  entries.forEach((e,i)=>{e.button.onclick=()=>select(i);e.button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const j=(i+(event.key==='ArrowRight'?1:-1)+entries.length)%entries.length;select(j);entries[j].button.focus();};});
}
