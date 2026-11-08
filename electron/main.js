const { workspaceRoot, workspaceDirectory, areaOutputDirectory, workspaceFile } = require("./workspace");
const { safeName, cacheRoot, initializeArea, gmtCacheEnv, previewConfig: makePreviewConfig } = require("./terrain-cache");
const { srtmSource } = require("./srtm-source");
const { geographicRegionIssue } = require("./map-region");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { fork, spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, net, protocol, shell } = require("electron");
const fileDialogs=require('./file-dialogs').create({dialog,BrowserWindow});
const { buildLegendEntries, normalizeLegendConfig } = require("./legend");
const { nativePositionStyle } = require("./native-position");
const {
  DEFAULT_LEGEND_FILE,
  DEFAULT_OVERLAY_FILE,
  autoRegion,
  buildScript,
  defaultOutputDirectory,
  gmtAvailable,
  installPlan,
  needsNativeTextRendering,
  openDownloadedInstaller,
  resolveGMT,
  terrainEstimate,
  terrainDataServer,
  terrainIntensity,
  terrainPaths,
  terrainRemoteName,
  terrainSource
} = require("./gmt");

const APP_TITLE = "MT点位图制作工具—GMT";
const mtpyWorkbench=require('./mtpy-workbench').create({resolveLocalLibrary,normalizeTerrainConfig,runGMTWorker,overlayNativeDecorations});
try {
  app.setPath("userData", workspaceDirectory("运行数据/Electron"));
  app.setPath("sessionData", workspaceDirectory("运行数据/Electron"));
  app.setPath("temp", workspaceDirectory("临时文件"));
  app.setPath("logs", workspaceDirectory("运行日志"));
  app.setPath("crashDumps", workspaceDirectory("运行日志/崩溃记录"));
  process.env.TMPDIR = process.env.TEMP = process.env.TMP = workspaceDirectory("临时文件");
} catch (error) {
  dialog.showErrorBox("全局工作目录不可用", error.message);
  app.exit(1);
}

let currentInstallerDownload = null;
let currentTerrainTask = null;
let currentGMTRenderTask = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "mt-preview",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: APP_TITLE,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false
    }
  });
  wireWindowControls(win);
  configureMenu(win);
  loadRenderer(win);
}

function wireWindowControls(win) {
  const publishState = () => sendWindowState(win);
  win.on("enter-full-screen", publishState);
  win.on("leave-full-screen", publishState);
  win.on("maximize", publishState);
  win.on("unmaximize", publishState);
  win.on("restore", publishState);
  win.webContents.once("did-finish-load", publishState);
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      toggleFullScreen(win);
      event.preventDefault();
      return;
    }
    if (input.key === "Escape" && win.isFullScreen()) {
      win.setFullScreen(false);
      event.preventDefault();
      return;
    }
    if ((input.control || input.meta) && input.key.toLowerCase() === "w") {
      win.close();
      event.preventDefault();
    }
  });
}

function currentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function windowState(win) {
  return {
    isFullScreen: Boolean(win?.isFullScreen()),
    platform: process.platform
  };
}

function sendWindowState(win) {
  if (win && !win.isDestroyed()) win.webContents.send("window:state", windowState(win));
}

function toggleFullScreen(win) {
  if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
}

function configureMenu(win) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{
      label: APP_TITLE,
      submenu: [
        { role: "about", label: `关于 ${APP_TITLE}` },
        { type: "separator" },
        { role: "hide", label: "隐藏" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    }] : []),
    {
      label: "文件",
      submenu: [
        {
          label: "打开工程...",
          accelerator: "CmdOrCtrl+Alt+O",
          click: () => sendMenuAction(win, "menu:openProject")
        },
        {
          label: "保存工程...",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuAction(win, "menu:saveProject")
        },
        { type: "separator" },
        {
          label: "导入",
          submenu: [
            {
              label: "TXT/CSV/Excel 点位或 MT 表格...",
              accelerator: "CmdOrCtrl+O",
              click: () => sendMenuAction(win, "menu:openFile")
            },
            {
              label: "EDI 文件夹...",
              accelerator: "CmdOrCtrl+Shift+O",
              click: () => sendMenuAction(win, "menu:openEdiDirectory")
            }
          ]
        },
        {
          label: "打开示例数据",
          click: () => sendMenuAction(win, "menu:loadSample")
        },
        { type: "separator" },
        {
          label: "导出",
          submenu: [
            {
              label: "导出 PNG...",
              accelerator: "CmdOrCtrl+E",
              click: () => sendMenuAction(win, "menu:exportPng")
            },
            {
              label: "导出 PDF...",
              click: () => sendMenuAction(win, "menu:exportPdf")
            },
            {
              label: "导出 EPS 矢量图...",
              click: () => sendMenuAction(win, "menu:exportEps")
            },
            {
              label: "导出 PNG + PDF...",
              accelerator: "CmdOrCtrl+Shift+E",
              click: () => sendMenuAction(win, "menu:exportBoth")
            },
            {
              label: "导出 PNG + PDF + EPS...",
              click: () => sendMenuAction(win, "menu:exportAll")
            },
            {
              label: "保存 GMT 脚本...",
              click: () => sendMenuAction(win, "menu:saveScript")
            },
            { type: "separator" },
            {
              label: "打开全局工作目录...",
              click: () => sendMenuAction(win, "menu:chooseOutputDirectory")
            },
            {
              label: "删除当前图件...",
              click: () => sendMenuAction(win, "menu:deleteOutputs")
            }
          ]
        },
        { type: "separator" },
        isMac
          ? { role: "close", label: "关闭窗口" }
          : { label: "关闭窗口", accelerator: "Ctrl+W", click: () => win.close() },
        ...(!isMac ? [{ role: "quit", label: "退出" }] : [])
      ]
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", accelerator: "CmdOrCtrl+Z", click: () => sendMenuAction(win, "menu:undo") },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "设置",
      submenu: [
        {label:"搜索功能…",accelerator:"CmdOrCtrl+K",click:()=>sendMenuAction(win,"menu:openSettingsPanel","__search")},
        {type:"separator"},
        ...[...new Set(require("./workbench-panels").map(p=>p[0]))].map(group=>({label:group,submenu:require("./workbench-panels").filter(p=>p[0]===group).map(p=>({label:p[2],click:()=>sendMenuAction(win,"menu:openSettingsPanel",p[1])}))}))
      ]
    },
    {
      label: "GMT",
      submenu: [
        {
          label: "重新检测 GMT",
          click: () => sendMenuAction(win, "menu:recheckGMT")
        },
        {
          label: "下载并安装 GMT",
          click: () => sendMenuAction(win, "menu:installGMT")
        },
        { type: "separator" },
        {
          label: "目录与缓存...",
          click: () => sendMenuAction(win, "menu:openSettingsPanel", "storage")
        },
        { type: "separator" },
        {
          label: "GMT 中文手册安装页",
          click: () => shell.openExternal("https://docs.gmt-china.org/latest/install/")
        },
        {
          label: "GMT 官方下载页",
          click: () => shell.openExternal("https://www.generic-mapping-tools.org/download/")
        }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { label: "切换全屏", accelerator: "F11", click: () => toggleFullScreen(win) },
        { label: "退出全屏", click: () => win.setFullScreen(false) }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { label: "退出全屏", accelerator: "Esc", click: () => win.setFullScreen(false) },
        { label: "重置工作台布局", click: () => sendMenuAction(win, "menu:resetLayout") },
        { type: "separator" },
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac ? [{ type: "separator" }, { role: "front", label: "全部置于前台" }] : [])
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "表格格式说明",
          click: () => sendMenuAction(win, "menu:showTableHelp")
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendMenuAction(win, action, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(action, payload);
}

app.whenReady().then(() => {
  registerPreviewProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:status", async () => ({
  platform: process.platform,
  ...await runForkWorker("gmt-engine-worker.js", {mode:"status"}),
  outputDirectory: savedOutputDirectory(),
  workspaceDirectory: workspaceRoot(),
  terrainCacheDirectory: workspaceDirectory("地形缓存"),
  version: app.getVersion()
}));

ipcMain.handle("window:getState", (event) => windowState(currentWindow(event)));
ipcMain.handle("window:minimize", (event) => {
  currentWindow(event)?.minimize();
});
ipcMain.handle("window:close", (event) => {
  currentWindow(event)?.close();
});
ipcMain.handle("window:toggleFullscreen", (event) => {
  toggleFullScreen(currentWindow(event));
});
ipcMain.handle("window:exitFullscreen", (event) => {
  currentWindow(event)?.setFullScreen(false);
});

ipcMain.handle("file:open", async (event) => {
  const result = await fileDialogs.open(event,{
    title: "选择点位或 MT 响应表格",
    properties: ["openFile"],
    filters: [
      { name: "表格文件", extensions: ["txt", "csv", "dat", "tsv", "xlsx", "xls"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return runImportWorker(event.sender, { mode: "stationFile", filePath: result.filePaths[0] });
});

ipcMain.handle("edi:openDirectory", async (event) => {
  const result = await fileDialogs.open(event,{
    title: "选择 EDI 文件夹",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return runImportWorker(event.sender, { mode: "ediDirectory", directory: result.filePaths[0] });
});

ipcMain.handle("file:sample", async (event) => {
  const candidates = [
    path.join(process.resourcesPath || "", "sample_points.csv"),
    path.join(app.getAppPath(), "sample_points.csv"),
    path.join(__dirname, "..", "sample_points.csv")
  ];
  const samplePath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!samplePath) throw new Error("未找到示例数据 sample_points.csv。");
  return runImportWorker(event.sender, { mode: "stationFile", filePath: samplePath });
});

ipcMain.handle("data:applyMapping", (event, payload) => {
  return runImportWorker(event.sender, { mode: "applyMapping", rows: payload.rows, mapping: payload.mapping });
});

ipcMain.handle("project:saveAs", async (event, payload) => {
  const suggested = String(payload?.suggestedName || "mt_gmt_project").replace(/[\\/:*?"<>|]+/g, "_");
  const result = await fileDialogs.save(event,{
    title: "保存 MT-GMT 工程",
    defaultPath: path.join(workspaceDirectory("工程文件"), `${suggested}.mtgmt`),
    filters: [
      { name: "MT-GMT 工程", extensions: ["mtgmt"] },
      { name: "JSON", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(workspaceFile(result.filePath), JSON.stringify(payload.project, null, 2), "utf8");
  return result.filePath;
});

ipcMain.handle("project:open", async (event) => {
  const result = await fileDialogs.open(event,{
    title: "打开 MT-GMT 工程",
    properties: ["openFile"],
    filters: [
      { name: "MT-GMT 工程", extensions: ["mtgmt", "json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const project = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { filePath, project };
});

ipcMain.handle("file:saveText", async (event, payload) => {
  const defaultPath = String(payload?.defaultPath || "mt_gmt_export.txt").replace(/[\\/:*?"<>|]+/g, "_");
  const result = await fileDialogs.save(event,{
    title: payload?.title || "保存文本文件",
    defaultPath: path.join(workspaceDirectory("导出表格"), defaultPath),
    filters: payload?.filters || [
      { name: "文本文件", extensions: ["txt", "tsv", "csv"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(workspaceFile(result.filePath), String(payload?.content || ""), "utf8");
  return result.filePath;
});

ipcMain.handle("gmt:buildScript", async (event, payload) => {
  requireMTpyForAnalysis(payload);
  payload=await resolveLocalLibrary(event.sender,payload);
  payload=await resolveTerrainScale(payload);
  return buildScript(payload.records, normalizeTerrainConfig(payload), outputDirectoryFromPayload(payload), payload.formats || ["png", "pdf", "eps"]);
});

ipcMain.handle("gmt:saveScript", async (event, payload) => {
  requireMTpyForAnalysis(payload);
  const result = await fileDialogs.save(event,{
    title: "保存 GMT 脚本",
    defaultPath: path.join(workspaceDirectory("导出脚本"), `${payload.config.outputName || "mt_point_map"}.${process.platform === "win32" ? "bat" : "gmt"}`),
    filters: [
      { name: "GMT 脚本", extensions: [process.platform === "win32" ? "bat" : "gmt"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  payload=await resolveLocalLibrary(event.sender,payload);
  payload=await resolveTerrainScale(payload);
  await runGMTWorker(event.sender, {
    mode: "saveScript",
    records: payload.records,
    config: normalizeTerrainConfig(payload),
    outputDirectory: path.dirname(result.filePath),
    formats: payload.formats || ["png", "pdf", "eps"],
    scriptPath: workspaceFile(result.filePath)
  });
  return result.filePath;
});

ipcMain.handle("gmt:export", async (event, payload) => {
  payload=await resolveTerrainScale(payload);
  if(mtpyWorkbench.active(payload?.config?.plotType)){
    const result=await mtpyWorkbench.render(event,payload);
    return {...result,terrainScale:payload.terrainScale};
  }
  payload={...payload,config:require("./response-export").responseConfig(payload.records||[],payload.config)};
  const directAI=(payload.formats||[]).includes("ai");
  const illustrator=directAI?await require("./illustrator-direct").findIllustrator():null;
  payload=await resolveLocalLibrary(event.sender,payload);
  payload={...payload,config:require("./map-selections").classifiedConfig(payload.records||[],require("./map-names").plotConfig(payload.config))};
  if(directAI)payload.config={...payload.config,illustratorPackage:true,illustratorDirect:true};
  const outputDirectory = outputDirectoryFromPayload(payload);
  saveOutputDirectory(outputDirectory);
  const formats = [...new Set((payload.formats || ["png"]).map(f=>f==="ai"?"pdf":f))];
  const outputName = safeName(payload.config?.outputName || "mt_point_map");
  const result = await runGMTWorker(event.sender, {
    mode: "export",
    records: payload.records,
    config: normalizeTerrainConfig(payload),
    formats,
    outputDirectory
  });
  if (result.ok && result.needsNativeDecorations) {
    await overlayNativeDecorations(result, payload.config, outputName, formats);
  }
  if(directAI&&result.ok){
    const script=result.illustratorScript;
    if(!script)throw new Error("未能准备 AI 编辑内容，请改用 AI 编辑包检查图件。");
    event.sender.send("gmt:progress",{message:"正在调用 Illustrator 生成分层 AI 文件…",percent:95});
    const output=await require("./illustrator-direct").exportNativeAI(script,path.join(outputDirectory,`${outputName}.ai`),illustrator);
    result.files=result.files.filter(f=>payload.formats.includes(path.extname(f).slice(1)));
    result.files.push(output);
  }
  result.localLibrary=payload.localLibrary;
  result.terrainScale=payload.terrainScale;
  return result;
});

function requireMTpyForAnalysis(payload) {
  if(['phaseTensorMap','tipperMap'].includes(payload?.config?.plotType))
    throw new Error('MTpy 图件请使用主工作台的预览和导出；不支持导出旧 GMT 张量计算脚本。');
}

ipcMain.handle("output:chooseDirectory", async () => {
  await shell.openPath(workspaceRoot());
  return workspaceDirectory("导出图件");
});

ipcMain.handle("output:deleteCurrent", (_event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  const outputName = safeName(payload?.outputName || "mt_point_map");
  return deleteCurrentOutputs(outputDirectory, outputName);
});

ipcMain.handle("terrain:estimate", (_event, payload) => {
  const outputDirectory = outputDirectoryFromPayload(payload);
  const config = normalizeTerrainConfig(payload);
  const paths = terrainPaths(outputDirectory, config);
  return {
    ...terrainEstimate(config.region, config.terrainResolution),
    ...paths,
    cacheReady: fs.existsSync(paths.gridPath) && fs.existsSync(paths.shadePath)
  };
});

ipcMain.handle("terrain:chooseLocalGrid", async (event) => {
  const result = await fileDialogs.open(event,{
    title: "选择本地 GRD 地形图",
    properties: ["openFile"],
    filters: [
      { name: "GMT 网格文件", extensions: ["grd", "nc"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("fault:openFiles", async (event, payload) => {
  const result = await fileDialogs.open(event,{
    title: "选择构造线或断层线文件",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "构造线文件", extensions: ["txt", "csv", "dat", "tsv", "xy", "gmt", "bln"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const color = String(payload?.color || "#d7191c");
  return runImportWorker(event.sender, { mode: "faultFiles", filePaths: result.filePaths, color });
});

// High-level elevation export owns its own worker and only reuses the terrain
// task while preparing missing data. It never changes the map's region/state.
const elevationJobs = new Map();
ipcMain.handle('elevation:export', async (event,payload) => {
 if(elevationJobs.has(event.sender.id))throw Error('高程导出正在进行，请等待或取消。');
 const job={cancelled:false,child:null,terrain:null};elevationJobs.set(event.sender.id,job);
 const cancel=()=>{job.cancelled=true;if(job.child?.connected)job.child.send({type:'cancel'});if(job.terrain&&!job.terrain.done)job.terrain.cancel();};
 event.sender.once('destroyed',cancel);
 const emit=progress=>{if(!event.sender.isDestroyed())event.sender.send('elevation:progress',progress);};
 const run=async p=>{if(job.cancelled)throw Error('已取消高程导出。');return runForkWorker('elevation-worker.js',p,event.sender,'elevation',{onSpawn:child=>{job.child=child;if(job.cancelled)child.send({type:'cancel'});}});};
 try{
  require('./em3dvp-elevation').region(payload.region);
  const config=normalizeTerrainConfig({config:{...payload.config,region:payload.region,terrainPreview:false,terrainGridPath:'',terrainShadePath:''}});
  const outputDirectory=workspaceDirectory('导出高程/EM3DVP');
  emit({percent:3,message:'正在按经纬度范围匹配本地地形缓存…'});
  let found=await run({mode:'findCache',config});
  if(!found){
   config.localTerrainGridPath='';
   if(currentTerrainTask&&!currentTerrainTask.done)throw Error('地形底图任务正在进行，请完成后再导出高程。');
   const estimate=terrainEstimate(config.region,config.terrainResolution);if(estimate.blocked)throw Error(estimate.warning);
   const gmtInfo=resolveGMT();if(!gmtInfo.available)throw Error('未找到 GMT，请先选择已安装引擎。');
   const status=await new Promise((resolve,reject)=>{
    const Task=terrainSource(config.terrainResolution)==='srtm'?SrtmTerrainWorkerTask:TerrainPrepareTask;
    const proxy={isDestroyed:()=>event.sender.isDestroyed(),send:(_channel,value)=>{emit({percent:Math.min(45,Number(value.percent||0)*.45),message:value.message});if(['completed','failed','cancelled'].includes(value.state))queueMicrotask(()=>{if(currentTerrainTask===job.terrain)currentTerrainTask=null;resolve(value);});}};
    job.terrain=new Task({gmtInfo,outputDirectory,config,webContents:proxy,onDone:()=>{if(currentTerrainTask===job.terrain)currentTerrainTask=null;}});currentTerrainTask=job.terrain;
    try{if(job.cancelled){currentTerrainTask=null;reject(Error('已取消高程导出。'));}else job.terrain.start();}catch(e){if(currentTerrainTask===job.terrain)currentTerrainTask=null;reject(e);}
   });
   if(status.state!=='completed')throw Error(status.message||'地形准备未完成。');
   found={gridPath:status.gridPath,source:'复用地形底图流程自动准备'};
  }
  emit({percent:48,message:found.source+'：'+path.basename(found.gridPath)});
  const result=await run({...payload,gridPath:found.gridPath,areaName:config.terrainRegionName||payload.areaName});
  return {...result,terrainSource:found.source};
 }finally{event.sender.removeListener('destroyed',cancel);elevationJobs.delete(event.sender.id);}
});
ipcMain.handle('elevation:cancel',event=>{const job=elevationJobs.get(event.sender.id);if(job){job.cancelled=true;if(job.child?.connected)job.child.send({type:'cancel'});if(job.terrain&&!job.terrain.done)job.terrain.cancel();}return {ok:true};});

ipcMain.handle("terrain:prepare", (event, payload) => startTerrainTask(event.sender, payload));
ipcMain.handle("terrain:pause", () => {
  if (!currentTerrainTask) return { ok: false, message: "当前没有正在准备的地形底图。" };
  currentTerrainTask.pause();
  return { ok: true };
});
ipcMain.handle("terrain:resume", () => {
  if (!currentTerrainTask) return { ok: false, message: "当前没有可继续的地形底图任务。" };
  currentTerrainTask.resume();
  return { ok: true };
});
ipcMain.handle("terrain:cancel", () => {
  if (!currentTerrainTask) return { ok: false, message: "当前没有可取消的地形底图任务。" };
  currentTerrainTask.cancel();
  return { ok: true };
});
ipcMain.handle("terrain:deleteLocal", (_event, payload) => {
  assertTerrainIdle();
  const outputDirectory = outputDirectoryFromPayload(payload);
  const directory = workspaceDirectory("地形缓存");
  return deleteCurrentTerrainCache(outputDirectory, payload);
});
ipcMain.handle("terrain:clearCache", () => clearTerrainCache());
ipcMain.handle("terrain:cacheSummary", (_event, payload) => terrainCacheSummary(outputDirectoryFromPayload(payload)));
ipcMain.handle("terrain:deleteCurrentCache", (_event, payload) => deleteCurrentTerrainCache(outputDirectoryFromPayload(payload), payload));
ipcMain.handle("terrain:deleteCacheResolution", (_event, payload) => deleteTerrainCacheResolution(outputDirectoryFromPayload(payload), payload?.resolution));

ipcMain.handle("preview:imageDataUrl", (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`预览图片不存在：${filePath || ""}`);
  return previewUrlForFile(filePath);
});

ipcMain.handle("gmt:install", (event) => startInstallerDownload(event.sender));
ipcMain.handle("gmt:downloadPause", () => {
  if (!currentInstallerDownload) return { ok: false, message: "当前没有正在下载的 GMT 安装包。" };
  currentInstallerDownload.pause();
  return { ok: true };
});
ipcMain.handle("gmt:downloadResume", () => {
  if (!currentInstallerDownload) return { ok: false, message: "当前没有可继续的 GMT 下载任务。" };
  currentInstallerDownload.resume();
  return { ok: true };
});
ipcMain.handle("gmt:downloadCancel", () => {
  if (!currentInstallerDownload) return { ok: false, message: "当前没有可取消的 GMT 下载任务。" };
  currentInstallerDownload.cancel();
  return { ok: true };
});
ipcMain.handle("gmt:cancelRender", (event) => {
  const cancelledMTpy=mtpyWorkbench.cancel(event.sender.id);
  if(require("./illustrator-direct").cancelIllustrator())return {ok:true,message:"已请求取消 AI 导出，正在恢复原文档。"};
  if (!currentGMTRenderTask?.child || currentGMTRenderTask.child.killed) return { ok: cancelledMTpy, message: cancelledMTpy?"已请求取消 MTpy 绘图。":"当前没有正在运行的 GMT 绘图任务。" };
  const cancelledRenderChild=currentGMTRenderTask.child;
  try {
    cancelledRenderChild.send({ type: "cancel" });
  } catch {
    // Fall through to a direct kill below.
  }
  setTimeout(() => {
    if (!cancelledRenderChild.killed && currentGMTRenderTask?.child===cancelledRenderChild) cancelledRenderChild.kill();
  }, 1200);
  return { ok: true, message: "已请求取消当前 GMT 绘图任务。" };
});
ipcMain.handle("gmt:recheck", () => runForkWorker('gmt-engine-worker.js',{mode:'status'}));
ipcMain.handle("gmt:selectEngine", async (event, selected) => {
  if(currentGMTRenderTask || (currentTerrainTask&&!currentTerrainTask.done))throw new Error('请等待绘图或地形任务结束后再切换引擎。');
  if(selected===null){const r=await fileDialogs.open(event,{title:'选择 GMT 可执行文件',properties:['openFile','showHiddenFiles','treatPackageAsDirectory']});if(r.canceled)return null;selected=r.filePaths[0];}
  return runForkWorker('gmt-engine-worker.js',{mode:'select',path:selected});
});
ipcMain.handle("map:project", (_event, payload) => runForkWorker("map-project-worker.js", payload));
const geodataTasks = new Map();
ipcMain.handle("geodata:task", async (event, payload) => {
  if (geodataTasks.has(event.sender.id)) throw new Error("地理数据任务正在进行，请等待或取消。");
  geodataTasks.set(event.sender.id, null);
  try { return await runForkWorker("geodata-worker.js", payload, event.sender, "geodata", {track:"geodata"}); }
  finally { geodataTasks.delete(event.sender.id); }
});
ipcMain.handle("geodata:cancel", event => { const child=geodataTasks.get(event.sender.id); if(child) child.send({type:"cancel"}); return true; });
ipcMain.handle("geodata:open", async (event) => {
  const result=await fileDialogs.open(event,{title:"导入地点或构造数据",properties:["openFile"],filters:[{name:"矢量图层 / 地点表",extensions:["geojson","json","shp","zip","gmt","xy","dat","csv","tsv","txt","xlsx","xls"]}]});
  return result.canceled?null:result.filePaths[0];
});
ipcMain.handle("shell:openExternal", (_event, url) => shell.openExternal(url));
ipcMain.handle("shell:openPath", (_event, targetPath) => shell.openPath(targetPath));

async function resolveLocalLibrary(webContents,payload){
 const config=payload.config||{},c=config.cartography||{};
 if(config.plotType==='responseCurve'||!c.localLibrary?.enabled)return payload;
 const result=await runForkWorker('geodata-worker.js',{mode:'libraryQuery',region:config.region,settings:c.localLibrary},webContents,'gmt',{track:'gmt'});
 const {features,...info}=result;
 info.pendingNames=require("./map-names").pending({...c,features}).length;
 const model=require('./local-structures'),manual=c.features||[],seen=new Set(manual.map(f=>model.geometryKey(f.geometry)));
 return {...payload,localLibrary:info,config:{...config,cartography:{...c,features:[...manual,...features.filter(f=>!seen.has(model.geometryKey(f.geometry)))]}}};
}
ipcMain.handle('library:chooseDirectory',async(event)=>{const r=await fileDialogs.open(event,{title:'选择本地构造文件夹（复制至全局缓存）',properties:['openDirectory']});return r.canceled?null:r.filePaths[0];});
function runImportWorker(webContents, payload) {
  return runForkWorker("import-worker.js", payload, webContents, "import");
}

function runGMTWorker(webContents, payload) {
  return runForkWorker("gmt-worker.js", payload, webContents, "gmt", { track: "gmt" });
}

function runForkWorker(scriptName, payload, webContents, progressChannel, options = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, scriptName), [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "advanced"
    });
    options.onSpawn?.(child);
    if (options.track === "geodata" && webContents) geodataTasks.set(webContents.id, child);
    if (options.track === "gmt") currentGMTRenderTask = { child, startedAt: Date.now() };
    let settled = false;
    let stderr = "";
    let stdout = "";
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (options.track === "gmt" && currentGMTRenderTask?.child === child) currentGMTRenderTask = null;
      callback(value);
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("message", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "progress" && progressChannel && webContents && !webContents.isDestroyed()) {
        webContents.send(`${progressChannel}:progress`, message.progress);
        return;
      }
      if (message.type === "result") {
        settle(resolve, message.result);
        return;
      }
      if (message.type === "error") {
        const error = new Error(message.message || `${scriptName} 执行失败。`);
        error.stack = message.stack || error.stack;
        settle(reject, error);
      }
    });
    child.on("error", (error) => settle(reject, error));
    child.on("exit", (code) => {
      if (settled) return;
      const details = stderr || stdout || (code === 0 ? "worker 已退出但主进程没有收到结果消息" : `退出码 ${code}`);
      settle(reject, new Error(`${scriptName} 后台任务异常结束：${details}`));
    });
    child.send({ type: "start", payload });
  });
}

function registerPreviewProtocol() {
  protocol.handle("mt-preview", async (request) => {
    const targetPath = previewPathFromUrl(request.url);
    if (!targetPath || !fs.existsSync(targetPath)) {
      return new Response("Preview image not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

function previewUrlForFile(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const token = Buffer.from(resolved, "utf8").toString("base64url");
  return `mt-preview://image/${token}?v=${Math.round(stat.mtimeMs)}-${stat.size}`;
}

function previewPathFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const token = parsed.pathname.replace(/^\/+/, "");
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function outputDirectoryFromPayload(payload) {
  return areaOutputDirectory(payload?.config || {});
}
function savedOutputDirectory() { return workspaceDirectory("导出图件"); }
function saveOutputDirectory() { /* Output paths are derived from the global workspace. */ }

function settingsFilePath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    const filePath = settingsFilePath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  try {
    const filePath = settingsFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // Settings persistence is helpful but should never block plotting.
  }
}

async function overlayNativeDecorations(result, config, outputName, requestedFormats) {
  const insetModule=require('./map-inset'),insetFeature=insetModule.active(config);
  let insetLayout;
  if(insetFeature){
    const region=require('./map-selections').bounds(String(config.region).split('/'));
    const b=require('./map-selections').bounds(insetFeature.properties.regionBox);
    const shift=360*Math.round(((region[0]+region[1])/2-(b[0]+b[1])/2)/360);
    b[0]+=shift;b[1]+=shift;
    if(b[0]<region[0]||b[1]>region[1]||b[2]<region[2]||b[3]>region[3])throw Error('局部放大区域必须完整位于主图范围内。');
    const ring=require('./map-selections').boxGeometry(b).coordinates[0],outer=require('./map-selections').boxGeometry(region).coordinates[0];
    const points=await runForkWorker('map-project-worker.js',{config,frame:result.mapFrame,points:[...ring,...outer]});
    insetLayout=insetModule.layout(insetFeature,points.slice(0,ring.length),points.slice(ring.length),result.mapFrame);
  }
  const pngPath = path.join(result.outputDirectory, `${outputName}.png`);
  if (!fs.existsSync(pngPath)) throw new Error(`中文图名/图例叠加失败：未找到 PNG 底图 ${pngPath}`);
  const needsPDF = (result.generatedFormats || requestedFormats).includes("pdf");
  const rendered = await renderDecoratedMap(pngPath, {...config, legend:{...config.legend,show:!!result.nativeLegend}, mapPageWidth:result.mapFrame?.width, annotationLayout: result.annotationLayout}, needsPDF);
  if(!insetLayout)await fs.promises.rm(path.join(result.outputDirectory,`${outputName}_局部放大参数.json`),{force:true});
  const basePDF=needsPDF?await fs.promises.readFile(path.join(result.outputDirectory, `${outputName}.pdf`)):null;
  if(insetLayout){
    const titlePoints=rendered.titleHeight*result.mapFrame.height/rendered.imageSize.height;
    const fullLayout=insetModule.shifted(insetLayout,titlePoints);
    rendered.pngBuffer=await renderInsetPreview(rendered,insetLayout,result.mapFrame.width);
    if(rendered.editingSVG){
      // Use the isolated preview renderer to transform editable SVG DOM.
      const transformed=await transformInsetSVG(rendered.editingSVG,fullLayout);
      rendered.editingSVG=transformed.svg;
      if(transformed.hasInset)rendered.editingGroups.push('GMT_inset');
    }
    result.inset={...fullLayout,featureId:insetFeature.id};
    fs.writeFileSync(path.join(result.outputDirectory,`${outputName}_局部放大参数.json`),JSON.stringify(result.inset,null,2));
  }
  if (config.illustratorPackage) {
    rendered.plotType=config.plotType;
    const packageRoot=config.illustratorDirect?await fs.promises.mkdtemp(path.join(workspaceDirectory('临时文件'),'ai-export-')):result.outputDirectory;
    const script = await require('./illustrator-export').writeIllustratorPackage(packageRoot, outputName,
      insetLayout?await runForkWorker('gmt-worker.js',{mode:'composeInset',bytes:basePDF,layout:insetLayout}):basePDF, rendered);
    result.illustratorScript=script;
    if(!config.illustratorDirect)result.files.push(script);
  }
  if (result.mapFrame && (rendered.titleHeight || rendered.footerHeight)) {
    const unitsPerPixel = result.mapFrame.height / rendered.imageSize.height;
    result.mapFrame.oy += rendered.footerHeight * unitsPerPixel;
    result.mapFrame.height += (rendered.titleHeight + rendered.footerHeight) * unitsPerPixel;
  }
  if (result.annotationLayout) fs.writeFileSync(path.join(result.outputDirectory,"自定义标注.svg"),require("./cartography-gmt").labelSVG(result.annotationLayout));
  let vectorPDF;
  if (needsPDF) {
    vectorPDF = await runForkWorker("gmt-worker.js", {
      mode: "composeVectorPDF",
      baseBytes: basePDF,
      overlayBytes: rendered.pdfBuffer,
      imageSize: rendered.imageSize,
      titleHeight: rendered.titleHeight,
      footerHeight: rendered.footerHeight
    });
  }
  fs.writeFileSync(pngPath, rendered.pngBuffer);
  if (needsPDF) {
    if(result.inset)vectorPDF=await runForkWorker('gmt-worker.js',{mode:'composeInset',bytes:vectorPDF,layout:result.inset});
    fs.writeFileSync(path.join(result.outputDirectory, `${outputName}.pdf`), vectorPDF);
  }
  if (requestedFormats.includes("eps")) await runForkWorker("gmt-worker.js",{mode:"pdfToEPS",pdfPath:path.join(result.outputDirectory,`${outputName}.pdf`),epsPath:path.join(result.outputDirectory,`${outputName}.eps`),dpi:config.pngDpi});
  if (!requestedFormats.includes("png")) {
    try {
      fs.unlinkSync(pngPath);
    } catch {
      // Leaving the intermediate PNG is harmless if the file is locked by the OS.
    }
  }
}

// Hidden, file-based composition keeps large terrain bytes out of data URLs.
async function renderInsetPreview(rendered,layout,pageWidth){
  const dir=await fs.promises.mkdtemp(path.join(workspaceDirectory('临时文件/原生叠加'),'inset-'));
  let win;try{
    const input=path.join(dir,'source.png');await fs.promises.writeFile(input,rendered.pngBuffer);
    const width=rendered.imageSize.width,height=rendered.imageSize.height+rendered.titleHeight+rendered.footerHeight,q=width/pageWidth;
    const v=require('./map-inset').shifted(layout,rendered.titleHeight/q);
    const px={...v,source:{x:v.source.x*q,y:v.source.y*q,width:v.source.width*q,height:v.source.height*q,points:v.source.points.map(p=>p.map(x=>x*q))},target:Object.fromEntries(Object.entries(v.target).map(([k,x])=>[k,x*q])),borderWidth:v.borderWidth*q};
    const html=path.join(dir,'inset.html');await fs.promises.writeFile(html,require('./map-inset').previewHTML(pathToFileURL(input).href,width,height,px));
    win=new BrowserWindow({show:false,focusable:false,width,height,useContentSize:true,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true}});
    await win.loadFile(html);await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode())).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    return (await win.webContents.capturePage()).toPNG();
  }finally{if(win&&!win.isDestroyed())win.destroy();await fs.promises.rm(dir,{recursive:true,force:true});}
}
async function transformInsetSVG(svg,layout){
  const win=new BrowserWindow({show:false,focusable:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true}});
  try{await win.loadURL('about:blank');return await win.webContents.executeJavaScript(`(${require('./map-inset').decorateSVG.toString()})(${JSON.stringify(svg)},${JSON.stringify(layout)})`);}finally{win.destroy();}
}

async function renderDecoratedMap(pngPath, config = {}, includePDF = true) {
  const image = nativeImage.createFromPath(pngPath);
  const size = image.getSize();
  if (!size.width || !size.height) throw new Error("中文图名/图例叠加失败：无法读取 GMT PNG 尺寸。");
  const requestedTitle = config.showTitle === false ? "" : String(config.title || "").trim();
  const title = (config.illustratorPackage || needsNativeTextRendering(requestedTitle) || config.plotType === "responseCurve" && (require("./response-collection").normalize(config.curveCollection).mode !== "single" || require("./response-collection").normalize(config.curveCollection).style === "reference")) ? requestedTitle : "";
  const titleHeight = title ? Math.max(56, Math.round(size.height * 0.065)) : 0;
  const titleSize = Math.max(22, Math.min(40, Math.round(size.width * 0.022)));
  const totalHeight = size.height + titleHeight;
  let footerHeight = 0;
  // Keep high-DPI terrain bytes out of the navigation URL and HTML document.
  const imageUrl = pathToFileURL(path.resolve(pngPath)).href;
  const legend = nativeLegendMarkup(config, size);
  const outsideLegend = Boolean(legend && normalizeLegendConfig(config.legend).position === 'JBC');
  const mapElements = nativeMapElementsMarkup(config, size);
  const annotations = require("./cartography-gmt").labelSVG(config.annotationLayout).replace("<svg ", `<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" `);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${size.width}px ${totalHeight}px; margin: 0; }
    html, body {
      width: ${size.width}px;
      height: ${totalHeight}px;
      margin: 0;
      overflow: hidden;
      background: white;
    }
    .title {
      width: ${size.width}px;
      height: ${titleHeight}px;
      display: flex;
      align-items: end;
      justify-content: center;
      padding-bottom: ${Math.max(10, Math.round(titleHeight * 0.16))}px;
      box-sizing: border-box;
      color: #111;
      font: 700 ${titleSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
      line-height: 1.08;
      white-space: nowrap;
    }
    .map-wrap {
      position: relative;
      width: ${size.width}px;
      height: ${size.height}px;
    }
    .map-wrap > img {
      display: block;
      width: ${size.width}px;
      height: ${size.height}px;
    }
    .native-legend {
      position: absolute;
      z-index: 2;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
    }
    .native-legend-title { font-weight: 700; line-height: 1.25; }
    .native-legend-rule { height: 1px; background: rgba(90, 100, 110, 0.42); }
    .native-legend-entry { display: flex; align-items: center; line-height: 1.25; }
    .native-legend-symbol-wrap { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
    .native-legend-symbol { display: inline-block; box-sizing: border-box; }
    .native-legend-symbol.circle { border-radius: 50%; }
    .native-legend-symbol.diamond { transform: rotate(45deg) scale(0.78); }
    .native-legend-symbol.triangle { width: 0 !important; height: 0 !important; background: transparent !important; border-left-color: transparent !important; border-right-color: transparent !important; border-top: 0 !important; }
    .native-legend-line { height: 0; }
    .native-scale,
    .native-compass {
      position: absolute;
      z-index: 3;
      box-sizing: border-box;
      color: #17212b;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      filter: drop-shadow(0 1px 1px rgba(255,255,255,0.9));
    }
    .native-scale-label { text-align: center; font-weight: 700; line-height: 1.15; }
    .native-scale-bar {
      display: flex;
      height: 13px;
      border: 2px solid #111;
      background: #fff;
      box-sizing: border-box;
    }
    .native-scale-bar > span { flex: 1 1 50%; }
    .native-scale-bar > span:first-child { background: #111; }
    .native-scale-ticks { position: relative; height: 1.35em; line-height: 1.25; }
    .native-scale-ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
    .native-scale-ticks .start { left: 0; transform: none; }
    .native-scale-ticks .middle { left: 50%; }
    .native-scale-ticks .end { left: 100%; transform: translateX(-100%); }
    .native-compass {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      background: rgba(255,255,255,0.90);
      border: 1px solid rgba(65,76,88,0.48);
      box-shadow: 0 3px 12px rgba(22,31,45,0.13);
    }
    .native-compass svg { display: block; width: 100%; height: 100%; overflow: visible; }
  </style>
</head>
<body>
  ${title ? `<div class="title">${escapeHTML(title)}</div>` : ""}
  <div class="map-wrap">
    <img src="${escapeHTML(imageUrl)}" />
    ${outsideLegend ? '' : legend}
    ${mapElements}
    ${annotations}
  </div>
  ${outsideLegend ? `<div id="map-footer" style="padding:1% 2%;box-sizing:border-box">${legend}</div>` : ''}
</body>
</html>`;
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(workspaceDirectory("临时文件/原生叠加"), "render-"));
  let win;
  try {
    const htmlPath = path.join(temporaryDirectory, "overlay.html");
    await fs.promises.writeFile(htmlPath, html, "utf8");
    win = new BrowserWindow({
      show: false,
      focusable: false,
      width: size.width,
      height: totalHeight,
      useContentSize: true,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        sandbox: true
      }
    });
    await win.loadFile(htmlPath);
    await win.webContents.executeJavaScript(`
      Promise.all([
        Promise.resolve(document.fonts && document.fonts.ready),
        ...Array.from(document.images).map((image) => image.decode ? image.decode() : Promise.resolve())
      ]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    `);
    if (outsideLegend) {
      footerHeight = await win.webContents.executeJavaScript('Math.ceil(document.getElementById("map-footer").getBoundingClientRect().height)');
      // Update the author stylesheet itself: insertCSS uses a different cascade
      // origin, and Chromium may retain the original print @page dimensions.
      await win.webContents.executeJavaScript(`{
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(`html, body { height:${totalHeight + footerHeight}px !important; } @page { size:${size.width}px ${totalHeight + footerHeight}px; margin:0; }`)};
        document.head.appendChild(style);
      }`);
      win.setContentSize(size.width, totalHeight + footerHeight);
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    }
    const editable = config.illustratorPackage ? await win.webContents.executeJavaScript(
      `(${require('./illustrator-export').collectEditableSVG.toString()})(${Number(config.mapPageWidth || config.annotationLayout?.width || projectionWidthCm(config.projection)*72/2.54)})`) : null;
    const png = (await win.webContents.capturePage()).toPNG();
    let pdf;
    if (includePDF) {
      // Print only native decorations on a transparent page. The GMT PDF is
      // combined in the worker, preserving paths/fonts and the physical size.
      await win.webContents.insertCSS("html, body { background: transparent !important; } .map-wrap > img { visibility: hidden !important; } .native-scale, .native-compass { filter: none !important; box-shadow: none !important; }");
      pdf = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: "none" }
      });
    }
    return { pngBuffer: png, pdfBuffer: pdf, imageSize: size, titleHeight, footerHeight, editingSVG:editable?.svg, editingGroups:editable?.groups };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    // Windows may release the file handle shortly after the hidden window closes.
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error => {
      console.warn("原生叠加临时文件清理失败：", error.code);
    });
  }
}

function nativeMapElementsMarkup(config, imageSize) {
  if (config?.plotType === "responseCurve" || !config?.swapAxes) return "";
  const scale = config.showScale ? nativeScaleMarkup(config, imageSize) : "";
  const compass = config.showNorthArrow ? nativeCompassMarkup(config) : "";
  return `${scale}${compass}`;
}

function nativeScaleMarkup(config, imageSize) {
  const region = String(config.region || "").split("/").map(Number);
  if (region.length !== 4 || region.some((value) => !Number.isFinite(value))) return "";
  const latitudeSpan = Math.abs(region[3] - region[2]);
  const midLatitude = (region[2] + region[3]) / 2;
  const metersPerDegree = latitudeDegreeLength(midLatitude);
  const mapMeters = latitudeSpan * metersPerDegree;
  if (!(mapMeters > 0)) return "";
  const scaleMeters = niceScaleDistance(mapMeters * 0.20);
  const projectionWidth = projectionWidthCm(config.projection);
  const dpi = clampNative(Number(config.pngDpi) || 300, 72, 1200);
  const width = clampNative(Math.round((projectionWidth * dpi / 2.54) * (scaleMeters / mapMeters)), 110, Math.round(imageSize.width * 0.34));
  const fontSize = clampNative(Math.round(imageSize.width * 0.0085), 18, 30);
  const position = nativePositionStyle(config.scalePosition, "BL", { x: 0.083, y: 0.105 });
  const half = formatScaleDistance(scaleMeters / 2);
  const full = formatScaleDistance(scaleMeters);
  return `<div class="native-scale" style="${position};width:${width}px;font-size:${fontSize}px"><div class="native-scale-label">Scale</div><div class="native-scale-bar"><span></span><span></span></div><div class="native-scale-ticks"><span class="start">0</span><span class="middle">${half}</span><span class="end">${full}</span></div></div>`;
}

function nativeCompassMarkup(config) {
  let position = nativePositionStyle(config.northPosition, "TR", { x: 0.075, y: 0.085 });
  const legendPosition = String(config?.legend?.position || "").toUpperCase();
  if (config?.legend?.show && String(config.northPosition || "TR").toUpperCase() === "TR" && legendPosition.includes("+JTR")) {
    position = "left:63%;top:8.5%;transform:translateX(-50%)";
  }
  return `<div class="native-compass" style="${position}" title="Axis orientation: north is right, east is up"><svg viewBox="0 0 112 112" role="img" aria-label="North points right; east points up"><circle cx="56" cy="56" r="31" fill="none" stroke="#56616d" stroke-width="1.5"/><line x1="21" y1="56" x2="91" y2="56" stroke="#34404c" stroke-width="2"/><line x1="56" y1="91" x2="56" y2="21" stroke="#34404c" stroke-width="2"/><path d="M91 56 L72 48 L76 56 L72 64 Z" fill="#d62828"/><path d="M56 21 L50 38 L56 35 L62 38 Z" fill="#34404c"/><circle cx="56" cy="56" r="4" fill="#17212b"/><text x="99" y="62" text-anchor="middle" font-size="17" font-weight="800" fill="#d62828">N</text><text x="56" y="16" text-anchor="middle" font-size="14" font-weight="700">E</text><text x="13" y="61" text-anchor="middle" font-size="12" font-weight="600">S</text><text x="56" y="107" text-anchor="middle" font-size="12" font-weight="600">W</text></svg></div>`;
}

function latitudeDegreeLength(latitude) {
  const radians = Number(latitude) * Math.PI / 180;
  return 111132.92 - 559.82 * Math.cos(2 * radians) + 1.175 * Math.cos(4 * radians) - 0.0023 * Math.cos(6 * radians);
}

function niceScaleDistance(targetMeters) {
  if (!(targetMeters > 0)) return 100;
  const power = 10 ** Math.floor(Math.log10(targetMeters));
  const normalized = targetMeters / power;
  const step = [1, 2, 2.5, 5, 10].filter((candidate) => candidate <= normalized).pop() || 1;
  return step * power;
}

function formatScaleDistance(meters) {
  if (meters >= 1000) return `${Number((meters / 1000).toFixed(2))} km`;
  return `${Number(meters.toFixed(meters < 10 ? 1 : 0))} m`;
}

function nativeLegendMarkup(config, imageSize) {
  if (!config?.legend?.show) return "";
  const entries = buildLegendEntries(config);
  if (!entries.length) return "";
  const settings = normalizeLegendConfig(config.legend);
  if (settings.position === 'JBC') {
    const pxPerPoint = imageSize.width / (config.mapPageWidth || config.annotationLayout?.width || projectionWidthCm(config.projection) * 72 / 2.54);
    const labelSize = settings.labelFontSize * pxPerPoint, titleSize = settings.titleFontSize * pxPerPoint;
    const gap = labelSize * 0.25, symbolBox = labelSize * 1.25;
    const rows = entries.map(entry => nativeLegendEntryMarkup(entry, symbolBox, labelSize, gap, pxPerPoint)).join('');
    return `<div class="native-legend" style="position:relative;width:100%;font-family:Arial,'Microsoft YaHei','PingFang SC',sans-serif;color:${escapeHTML(settings.textColor)}"><div class="native-legend-title" style="font-size:${titleSize}px;margin-bottom:${gap}px">${escapeHTML(settings.title || 'Legend')}</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:${labelSize * 2}px;overflow-wrap:anywhere">${rows}</div></div>`;
  }
  const position = parseNativeLegendPosition(settings.position);
  const projectionWidth = projectionWidthCm(config.projection);
  const pxPerCm = imageSize.width / projectionWidth;
  const widthCm = Number.parseFloat(settings.width) || 4.2;
  const width = clampNative(Math.round(widthCm * pxPerCm), 260, Math.round(imageSize.width * 0.38));
  const titleSize = clampNative(Math.round(settings.titleFontSize * pxPerCm / 28.346), 22, 52);
  const labelSize = clampNative(Math.round(settings.labelFontSize * pxPerCm / 28.346), 18, 44);
  const symbolBox = clampNative(Math.round(0.52 * pxPerCm), 28, 58);
  const padding = clampNative(Math.round(0.18 * pxPerCm), 14, 28);
  const gap = clampNative(Math.round(0.10 * pxPerCm), 8, 18);
  const alpha = 1 - clampNative(Number(settings.backgroundTransparency) || 0, 0, 100) / 100;
  const transform = nativeLegendTransform(position.justify);
  const rows = entries.map((entry) => nativeLegendEntryMarkup(entry, symbolBox, labelSize, gap, pxPerCm/28.346)).join("");
  return `<div class="native-legend" style="left:${(position.x * 100).toFixed(3)}%;top:${((1 - position.y) * 100).toFixed(3)}%;transform:${transform};width:${width}px;padding:${padding}px;background:${escapeHTML(settings.backgroundColor)};background-color:${colorWithAlpha(settings.backgroundColor, alpha)};border:${settings.borderWidth}px solid ${escapeHTML(settings.borderColor)};border-radius:${settings.cornerRadius}px;color:${escapeHTML(settings.textColor)};box-shadow:0 3px 14px rgba(22,31,45,0.12)"><div class="native-legend-title" style="font-size:${titleSize}px">${escapeHTML(settings.title || "图例")}</div><div class="native-legend-rule" style="margin:${gap}px 0"></div>${rows}</div>`;
}

function nativeLegendEntryMarkup(entry, symbolBox, labelSize, gap, pxPerPoint=labelSize/8.5) {
  const penParts=String(entry.pen||'0.5p,black').split(',');
  const [color,transparency='0']=(penParts[1]||'black').split('@');
  const penColor=escapeHTML(color);
  const penWidth=Math.max(0,Number.parseFloat(penParts[0])||0);
  const strokeWidth=penWidth*pxPerPoint*100/symbolBox;
  const strokeOpacity=1-clampNative(Number(transparency)||0,0,100)/100;
  const line=entry.symbol==='line', boxWidth=line?symbolBox*2.8:symbolBox;
  const viewWidth=line?280:100;
  const stroke=`stroke="${penColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"`;

  const fill = escapeHTML(entry.fill || '#2f6f8f');
  // Scale the pattern with physical pen width, just as GMT does; fixed SVG
  // lengths made thick dashed faults look dotted in the legend.
  const dash = String(entry.pen).endsWith(',-') ? `stroke-dasharray="${8*strokeWidth} ${4*strokeWidth}"` : String(entry.pen).endsWith(',.') ? `stroke-dasharray="${strokeWidth} ${4*strokeWidth}"` : '';
  let shape;
  if (entry.symbol === 'line') {
    shape = `<line x1="8" y1="50" x2="272" y2="50" ${stroke} ${dash}/>`;
  } else if (entry.symbol === 'area') {
    shape = `<rect x="8" y="25" width="84" height="50" fill="${fill}" fill-opacity="${Number(entry.opacity ?? 100)/100}" ${stroke} ${dash}/>`;
  } else {
    const style = `fill="${fill}" ${stroke}`;
    const type = entry.gmtSymbol || 'c';
    if (type === 'a') shape = `<polygon points="50,20 57,41 79,41 61,55 68,77 50,63 32,77 39,55 21,41 43,41" ${style}/>`;
    else if (type === 't') shape = `<polygon points="50,23 78,75 22,75" ${style}/>`;
    else if (type === 'd') shape = `<polygon points="50,20 80,50 50,80 20,50" ${style}/>`;
    else if (type === 'c') shape = `<circle cx="50" cy="50" r="24" ${style}/>`;
    else shape = `<rect x="26" y="26" width="48" height="48" ${style}/>`;
  }
  // A direct SVG flex item prints reliably in Chromium; nested inline-flex
  // spans can lose their painted symbols on a dynamically extended PDF page.
  return `<div class="native-legend-entry" style="font-size:${labelSize}px;margin-top:${gap}px;break-inside:avoid"><svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${symbolBox}" viewBox="0 0 ${viewWidth} 100" style="display:block;flex:0 0 ${boxWidth}px;margin-right:${gap}px;overflow:visible">${shape}</svg><span style="min-width:0">${escapeHTML(entry.label)}</span></div>`;
}

function parseNativeLegendPosition(value) {
  const match = String(value || "").match(/^n([0-9.]+)\/([0-9.]+)(?:\+j(TL|TR|BL|BR))?$/i);
  if (!match) return { x: 0.98, y: 0.98, justify: "TR" };
  return {
    x: clampNative(Number(match[1]), 0, 1),
    y: clampNative(Number(match[2]), 0, 1),
    justify: String(match[3] || "TR").toUpperCase()
  };
}

function nativeLegendTransform(justify) {
  return {
    TL: "translate(0,0)",
    TR: "translate(-100%,0)",
    BL: "translate(0,-100%)",
    BR: "translate(-100%,-100%)"
  }[justify] || "translate(-100%,0)";
}

function projectionWidthCm(value) {
  const match = String(value || "").match(/^[A-Za-z]([0-9.]+)c/i);
  const width = match ? Number(match[1]) : 16;
  return Number.isFinite(width) && width > 0 ? width : 16;
}

function colorWithAlpha(color, alpha) {
  const hex = String(color || "").match(/^#([0-9a-f]{6})$/i);
  if (!hex) return color;
  const value = Number.parseInt(hex[1], 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha.toFixed(3)})`;
}

function clampNative(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadRenderer(win) {
  const rendererDir = path.join(__dirname, "renderer");
  const htmlPath = path.join(rendererDir, "index.html");
  const cssPath = path.join(rendererDir, "styles.css");
  const jsPath = path.join(rendererDir, "renderer.js");
  const bridge = `
    const { ipcRenderer } = require("electron");
    window.ResponseCollection = require(${JSON.stringify(path.join(__dirname,"response-collection.js"))});
    window.MapSelections = require(${JSON.stringify(path.join(__dirname,"map-selections.js"))});
    window.Shorelines = require(${JSON.stringify(path.join(__dirname,"shorelines.js"))});
    window.WorkbenchPanels = require(${JSON.stringify(path.join(__dirname,"workbench-panels.js"))});
    window.MapNames = require(${JSON.stringify(path.join(__dirname,"map-names.js"))});
    window.TerrainColorbar = require(${JSON.stringify(path.join(__dirname,"terrain-colorbar.js"))});
    window.MapPresentation = require(${JSON.stringify(path.join(__dirname,"presentation.js"))});
    window.PaperStyle = require(${JSON.stringify(path.join(__dirname,"paper-style.js"))});
    window.mtApp = {
      geographicRegionIssue: ${geographicRegionIssue.toString()},
      previewConfig: ${makePreviewConfig.toString()},
      srtmSource: ${srtmSource.toString()},
      status: () => ipcRenderer.invoke("app:status"),
      openFile: () => ipcRenderer.invoke("file:open"),
      openEdiDirectory: () => ipcRenderer.invoke("edi:openDirectory"),
      loadSample: () => ipcRenderer.invoke("file:sample"),
      saveProject: (payload) => ipcRenderer.invoke("project:saveAs", payload),
      openProject: () => ipcRenderer.invoke("project:open"),
      saveTextFile: (payload) => ipcRenderer.invoke("file:saveText", payload),
      applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
      buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
      saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
      exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
      projectMap: (payload) => ipcRenderer.invoke("map:project", payload),
      chooseOutputDirectory: (currentDirectory) => ipcRenderer.invoke("output:chooseDirectory", currentDirectory),
      deleteCurrentOutputs: (payload) => ipcRenderer.invoke("output:deleteCurrent", payload),
      estimateTerrain: (payload) => ipcRenderer.invoke("terrain:estimate", payload),
      exportElevation: payload => ipcRenderer.invoke('elevation:export',payload),
      cancelElevation: () => ipcRenderer.invoke('elevation:cancel'),
      onElevationProgress: handler => ipcRenderer.on('elevation:progress',(_event,value)=>handler(value)),
      prepareTerrain: (payload) => ipcRenderer.invoke("terrain:prepare", payload),
      chooseLocalTerrainGrid: () => ipcRenderer.invoke("terrain:chooseLocalGrid"),
      pauseTerrain: () => ipcRenderer.invoke("terrain:pause"),
      resumeTerrain: () => ipcRenderer.invoke("terrain:resume"),
      cancelTerrain: () => ipcRenderer.invoke("terrain:cancel"),
      deleteLocalTerrain: (payload) => ipcRenderer.invoke("terrain:deleteLocal", payload),
      clearTerrainCache: () => ipcRenderer.invoke("terrain:clearCache"),
      terrainCacheSummary: (payload) => ipcRenderer.invoke("terrain:cacheSummary", payload),
      deleteCurrentTerrainCache: (payload) => ipcRenderer.invoke("terrain:deleteCurrentCache", payload),
      deleteTerrainCacheResolution: (payload) => ipcRenderer.invoke("terrain:deleteCacheResolution", payload),
      onTerrainProgress: (handler) => ipcRenderer.on("terrain:progress", (_event, payload) => handler(payload)),
      geodata: (payload) => ipcRenderer.invoke("geodata:task",payload),
      chooseLibraryDirectory: () => ipcRenderer.invoke("library:chooseDirectory"),
      openGeodata: () => ipcRenderer.invoke("geodata:open"),
      cancelGeodata: () => ipcRenderer.invoke("geodata:cancel"),
      onGeodataProgress: (handler) => ipcRenderer.on("geodata:progress",(_event,payload)=>handler(payload)),
      openFaultFiles: (payload) => ipcRenderer.invoke("fault:openFiles", payload),
      imageDataUrl: (filePath) => ipcRenderer.invoke("preview:imageDataUrl", filePath),
      installGMT: () => ipcRenderer.invoke("gmt:install"),
      selectGMTEngine: (selected) => ipcRenderer.invoke("gmt:selectEngine", selected),
      pauseGMTDownload: () => ipcRenderer.invoke("gmt:downloadPause"),
      resumeGMTDownload: () => ipcRenderer.invoke("gmt:downloadResume"),
      cancelGMTDownload: () => ipcRenderer.invoke("gmt:downloadCancel"),
      onGMTDownloadProgress: (handler) => ipcRenderer.on("gmt:downloadProgress", (_event, payload) => handler(payload)),
      cancelGMTRender: () => ipcRenderer.invoke("gmt:cancelRender"),
      onMenuUndo: (handler) => ipcRenderer.on("menu:undo", handler),
      onMenuOpenFile: (handler) => ipcRenderer.on("menu:openFile", handler),
      onMenuOpenEdiDirectory: (handler) => ipcRenderer.on("menu:openEdiDirectory", handler),
      onMenuOpenProject: (handler) => ipcRenderer.on("menu:openProject", handler),
      onMenuSaveProject: (handler) => ipcRenderer.on("menu:saveProject", handler),
      onMenuLoadSample: (handler) => ipcRenderer.on("menu:loadSample", handler),
      onMenuChooseOutputDirectory: (handler) => ipcRenderer.on("menu:chooseOutputDirectory", handler),
      onMenuExportPng: (handler) => ipcRenderer.on("menu:exportPng", handler),
      onMenuExportPdf: (handler) => ipcRenderer.on("menu:exportPdf", handler),
      onMenuExportBoth: (handler) => ipcRenderer.on("menu:exportBoth", handler),
      onMenuExportEps: (handler) => ipcRenderer.on("menu:exportEps", handler),
      onMenuExportAll: (handler) => ipcRenderer.on("menu:exportAll", handler),
      onMenuSaveScript: (handler) => ipcRenderer.on("menu:saveScript", handler),
      onMenuDeleteOutputs: (handler) => ipcRenderer.on("menu:deleteOutputs", handler),
      onMenuShowTableHelp: (handler) => ipcRenderer.on("menu:showTableHelp", handler),
      onMenuOpenSettingsPanel: (handler) => ipcRenderer.on("menu:openSettingsPanel", (_event, panel) => handler(panel)),
      onMenuResetLayout: (handler) => ipcRenderer.on("menu:resetLayout", handler),
      onMenuRecheckGMT: (handler) => ipcRenderer.on("menu:recheckGMT", handler),
      onMenuInstallGMT: (handler) => ipcRenderer.on("menu:installGMT", handler),
      getWindowState: () => ipcRenderer.invoke("window:getState"),
      minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
      closeWindow: () => ipcRenderer.invoke("window:close"),
      toggleWindowFullscreen: () => ipcRenderer.invoke("window:toggleFullscreen"),
      exitWindowFullscreen: () => ipcRenderer.invoke("window:exitFullscreen"),
      onWindowState: (handler) => ipcRenderer.on("window:state", (_event, payload) => handler(payload)),
      onImportProgress: (handler) => ipcRenderer.on("import:progress", (_event, payload) => handler(payload)),
      onGMTRenderProgress: (handler) => ipcRenderer.on("gmt:progress", (_event, payload) => handler(payload)),
      recheckGMT: () => ipcRenderer.invoke("gmt:recheck"),
      openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
      openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath)
    };
  `;

  let html = fs.readFileSync(htmlPath, "utf8");
  const css = fs.readFileSync(cssPath, "utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"workbench.css"),"utf8");
  const renderer = fs.readFileSync(jsPath, "utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"cartography-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"map-drawing-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"local-library-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"workbench-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"map-selections-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"project-history.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"inset-position-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"response-collection-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"elevation-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"presentation-ui.js"),"utf8") + "\n" + fs.readFileSync(path.join(rendererDir,"terrain-colorbar-ui.js"),"utf8");
  html = html
    .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
    .replace('<script src="renderer.js"></script>', `<script>\n${bridge}\n${renderer}\n</script>`);
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function resolveTerrainScale(payload){
  const config=normalizeTerrainConfig(payload);
  const terrainScale=await require('./terrain-autoscale').resolve(payload.terrainRecords||payload.records||[],config,outputDirectoryFromPayload(payload));
  return {...payload,config:{...config,terrainColorbar:terrainScale.settings},terrainScale};
}

function normalizeTerrainConfig(payload) {
  const config = { ...(payload?.config || {}) };
  if (!String(config.region || "").trim() && Array.isArray(payload?.records) && payload.records.length) {
    config.region = autoRegion(payload.records);
  }
  config.outputName = safeName(config.outputName || "mt_point_map");
  config.terrainCacheDirectory = workspaceDirectory("地形缓存");
  config.terrainResolution = config.terrainResolution || "06m";
  config.terrainIntensity = terrainIntensity(config.terrainIntensity);
  config.terrainDataServer = terrainDataServer(config.terrainDataServer);
  return config;
}

function deleteCurrentOutputs(outputDirectory, outputName) {
  const extensions = process.platform === "win32" ? ["png", "pdf", "eps", "bat"] : ["png", "pdf", "eps", "gmt"];
  const candidates = [
    ...extensions.map((extension) => path.join(outputDirectory, `${outputName}.${extension}`)),
    path.join(outputDirectory, "stations_points.tsv"),
    path.join(outputDirectory, "stations_labels.tsv"),
    path.join(outputDirectory, DEFAULT_OVERLAY_FILE),
    path.join(outputDirectory, DEFAULT_LEGEND_FILE)
  ];
  const deleted = [];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    fs.rmSync(filePath, { force: true });
    deleted.push(filePath);
  }
  return {
    ok: true,
    deleted,
    message: deleted.length ? `已删除 ${deleted.length} 个当前图件文件。` : "没有找到可删除的当前图件文件。"
  };
}

function terrainCacheSummary(outputDirectory) {
  const directory = workspaceDirectory("地形缓存");
  const files = [];
  collectCacheFiles(directory, files);
  const groups = new Map();
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    const resolution = terrainCacheResolution(file.path) || "other";
    const group = groups.get(resolution) || { resolution, files: 0, bytes: 0 };
    group.files += 1;
    group.bytes += file.size;
    groups.set(resolution, group);
  }
  return {
    directory,
    exists: fs.existsSync(directory),
    totalBytes,
    totalFiles: files.length,
    groups: Array.from(groups.values()).sort((a, b) => a.resolution.localeCompare(b.resolution))
  };
}

function assertTerrainIdle() {
  if (elevationJobs.size || (currentTerrainTask && !currentTerrainTask.done) || currentGMTRenderTask) throw new Error("请先完成或取消绘图和地形任务，再删除共享缓存。");
}

function deleteCurrentTerrainCache(outputDirectory, payload) {
  assertTerrainIdle();
  const config = normalizeTerrainConfig(payload);
  const paths = terrainPaths(outputDirectory, config);
  const targets = [paths.gridPath, paths.shadePath];
  let bytes = 0;
  const deleted = [];
  for (const filePath of targets) {
    if (!fs.existsSync(filePath)) continue;
    try {
      bytes += fs.statSync(filePath).size;
    } catch {
      // The file may disappear between existence and stat checks.
    }
    fs.rmSync(filePath, { force: true });
    deleted.push(filePath);
  }
  removeEmptyDirectories(paths.directory);
  return {
    ok: true,
    deleted,
    bytes,
    message: deleted.length
      ? `已删除当前范围 ${config.terrainResolution} 地形缓存 ${deleted.length} 个文件，释放 ${formatBytesLocal(bytes)}。`
      : `当前范围 ${config.terrainResolution} 没有可删除的本地地形缓存。`
  };
}

function deleteTerrainCacheResolution(outputDirectory, resolution) {
  assertTerrainIdle();
  const targetResolution = String(resolution || "").trim();
  if (!targetResolution) return { ok: false, message: "请选择要删除的地形缓存分辨率。" };
  const directory = workspaceDirectory("地形缓存");
  const files = [];
  collectCacheFiles(directory, files);
  const targets = files.filter((file) => terrainCacheResolution(file.path) === targetResolution);
  let bytes = 0;
  for (const file of targets) {
    bytes += file.size;
    fs.rmSync(file.path, { force: true });
  }
  removeEmptyDirectories(directory);
  return {
    ok: true,
    deleted: targets.length,
    bytes,
    message: targets.length
      ? `已删除 ${targetResolution} 地形缓存 ${targets.length} 个文件，释放 ${formatBytesLocal(bytes)}。`
      : `没有找到 ${targetResolution} 地形缓存文件。`
  };
}

function collectCacheFiles(directory, files) {
  if (!directory || !fs.existsSync(directory)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectCacheFiles(fullPath, files);
    else if (entry.isFile()) {
      try {
        files.push({ path: fullPath, size: fs.statSync(fullPath).size });
      } catch {
        // Ignore files removed while scanning.
      }
    }
  }
}

function terrainCacheResolution(filePath) {
  const name = path.basename(filePath);
  const relief = /^(?:预览_)?earth_relief_([0-9]{2}[ms])_/i.exec(name);
  if (relief) return relief[1];
  if (/\.hgt$|\.hgt\.gz$|\.jp2$/i.test(name)) return "srtm";
  if (/srtm_points_([0-9]{2}[ms])_/i.test(name)) return RegExp.$1;
  return "";
}

function removeEmptyDirectories(directory) {
  if (!directory || !fs.existsSync(directory)) return false;
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(directory, entry.name));
  }
  try {
    if (directory.endsWith("terrain_cache")) return false;
    if (!fs.readdirSync(directory).length) {
      fs.rmdirSync(directory);
      return true;
    }
  } catch {
    // Directory may be in use.
  }
  return false;
}

function formatBytesLocal(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, Number(bytes) || 0);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function startTerrainTask(webContents, payload) {
  if ([...elevationJobs.values()].some(j=>j.terrain&&!j.terrain.done)) return {ok:false,message:"正在为高程导出准备地形，请先完成或取消高程导出。"};
  const outputDirectory = outputDirectoryFromPayload(payload);
  saveOutputDirectory(outputDirectory);
  const config = normalizeTerrainConfig(payload);
  const estimate = terrainEstimate(config.region, config.terrainResolution);
  if (estimate.blocked) {
    return { ok: false, message: estimate.warning, status: null, estimate };
  }
  const gmtInfo = resolveGMT();
  if (!gmtInfo.available) {
    return { ok: false, message: "未找到 GMT，无法下载或准备地形底图。", status: null };
  }
  if (currentTerrainTask && !currentTerrainTask.done) {
    return { ok: true, message: "地形底图任务正在进行。", status: currentTerrainTask.statusPayload() };
  }
  const TaskClass = terrainSource(config.terrainResolution) === "srtm" ? SrtmTerrainWorkerTask : TerrainPrepareTask;
  currentTerrainTask = new TaskClass({
    gmtInfo,
    outputDirectory,
    config,
    webContents,
    onDone: () => {
      currentTerrainTask = null;
    }
  });
  currentTerrainTask.start();
  return { ok: true, message: "开始准备地形底图。", status: currentTerrainTask.statusPayload() };
}

function clearTerrainCache() {
  assertTerrainIdle();
  const gmtInfo = resolveGMT();
  if (!gmtInfo.available) return { ok: false, message: "未找到 GMT，无法清理地形缓存。" };
  return new Promise((resolve) => {
    const child = spawn(gmtInfo.path, ["clear", "data=earth"], {
      cwd: savedOutputDirectory(),
      env: gmtChildEnv(gmtInfo)
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ ok: false, message: error.message || String(error) });
    });
    child.on("close", (code) => {
      const message = stderr || stdout || "已清理 GMT 地形数据缓存。";
      resolve(code === 0 ? { ok: true, message } : { ok: false, message: message || "GMT 地形缓存清理失败。" });
    });
  });
}

function gmtChildEnv(gmtInfo, config = {}) {
  const env = {
    ...process.env,
    ...gmtCacheEnv(savedOutputDirectory(), { ...config, terrainCacheDirectory: workspaceDirectory("地形缓存") }),
    PATH: `${gmtInfo.binDir}${path.delimiter}${process.env.PATH || ""}`,
    GMT_DATA_SERVER: terrainDataServer(config.terrainDataServer || process.env.GMT_DATA_SERVER)
  };
  if (gmtInfo.gsLib) env.GS_LIB = gmtInfo.gsLib;
  return env;
}

function startInstallerDownload(webContents) {
  if (currentInstallerDownload && !currentInstallerDownload.done) {
    return { ok: true, message: "GMT 安装包正在下载。", status: currentInstallerDownload.statusPayload() };
  }

  const plan = installPlan();
  if (!plan.canAutoInstall) return {ok:false,message:plan.message,status:null};
  if(plan.method==='brew'){
    const task=new (require('./gmt-installer').BrewInstallTask)(plan.brew,workspaceDirectory('安装包/GMT-6.7'),status=>{if(!webContents.isDestroyed())webContents.send('gmt:downloadProgress',status);},()=>{if(currentInstallerDownload===task)currentInstallerDownload=null;});
    currentInstallerDownload=task;task.start();return {ok:true,status:task.statusPayload()};
  }
  if(!plan.download)return {ok:false,message:plan.message,status:null};

  const targetDir = workspaceDirectory("安装包");
  const targetPath = path.join(targetDir, plan.download.fileName);
  currentInstallerDownload = new InstallerDownloadTask(plan.download, targetPath, webContents, () => {
    currentInstallerDownload = null;
  });
  currentInstallerDownload.start();
  return { ok: true, message: `开始下载：${plan.download.fileName}`, status: currentInstallerDownload.statusPayload() };
}

class TerrainPrepareTask {
  constructor({ gmtInfo, outputDirectory, config, webContents, onDone }) {
    this.gmtInfo = gmtInfo;
    this.outputDirectory = outputDirectory;
    this.config = config;
    this.webContents = webContents;
    this.onDone = onDone;
    this.paths = terrainPaths(outputDirectory, config);
    this.gridTempPath = this.paths.gridPath.replace(/\.nc$/, "_处理中.nc");
    this.shadeTempPath = this.paths.shadePath.replace(/\.nc$/, "_处理中.nc");
    this.estimate = terrainEstimate(config.region, config.terrainResolution);
    this.child = null;
    this.currentStep = "starting";
    this.state = "starting";
    this.message = "准备地形底图任务...";
    this.percent = 0;
    this.startedAt = Date.now();
    this.done = false;
    this.cancelled = false;
    this.pausing = false;
    this.pausedBySignal = false;
    this.lastOutput = "";
    this.lastEmitAt = 0;
  }

  start() {
    initializeArea(this.paths, this.config);
    if (this.estimate.blocked) {
      this.fail(this.estimate.warning);
      return;
    }
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.state = "completed";
      this.message = "地形底图已存在，可直接绘图。";
      this.percent = 100;
      this.done = true;
      this.emit();
      this.finishSoon();
      return;
    }
    this.runSetDownloadMode();
  }

  runSetDownloadMode() {
    this.runGMTStep({
      step: "offline",
      args: ["set", "GMT_DATA_UPDATE_INTERVAL", this.config.terrainAllowDownload ? "1d" : "off"],
      message: this.config.terrainAllowDownload ? "已允许 GMT 联网获取缺失地形数据。" : "已关闭 GMT 在线下载，只使用本地缓存。",
      basePercent: 5,
      next: () => fs.existsSync(this.paths.gridPath) ? this.runGradient() : this.runCut()
    });
  }

  runCut() {
    this.runGMTStep({
      step: "cut",
      args: ["grdcut", terrainRemoteName(this.config.terrainResolution), `-R${this.config.region}`, `-G${path.basename(this.gridTempPath)}`, "-V"],
      message: `正在获取并裁剪 ${terrainRemoteName(this.config.terrainResolution)}...`,
      basePercent: 12,
      next: () => this.runGradient()
    });
  }

  runGradient() {
    this.runGMTStep({
      step: "gradient",
      args: ["grdgradient", path.basename(this.paths.gridPath), "-A315", `-Ne${terrainIntensity(this.config.terrainIntensity)}`, `-G${path.basename(this.shadeTempPath)}`],
      message: "正在生成地形阴影...",
      basePercent: 80,
      next: () => this.complete()
    });
  }

  runGMTStep({ step, args, message, basePercent, next }) {
    this.currentStep = step;
    this.state = "running";
    this.message = message;
    this.percent = Math.max(this.percent, basePercent);
    this.pausing = false;
    this.pausedBySignal = false;
    this.lastOutput = "";
    this.emit();
    this.child = spawn(this.gmtInfo.path, args, {
      cwd: this.paths.directory,
      encoding: "utf8",
      env: gmtChildEnv(this.gmtInfo, this.config)
    });
    const onData = (chunk) => {
      this.lastOutput = String(chunk).trim() || this.lastOutput;
      this.message = this.lastOutput || message;
      if (step === "cut") this.percent = Math.min(75, this.percent + 1.8);
      if (step === "gradient") this.percent = Math.min(96, this.percent + 3);
      this.emitThrottled();
    };
    this.child.stdout.on("data", onData);
    this.child.stderr.on("data", onData);
    this.child.on("error", (error) => {
      if (!this.done && !this.pausing) this.fail(error.message || String(error));
    });
    this.child.on("close", (code, signal) => {
      this.child = null;
      if (this.cancelled || this.done) return;
      if (this.pausing) {
        this.state = "paused";
        this.message = "地形底图任务已暂停，继续后会复用已缓存数据重新准备。";
        this.emit();
        return;
      }
      if (code === 0) {
        const output = step === "cut" ? this.gridTempPath : step === "gradient" ? this.shadeTempPath : null;
        if (output && (!fs.existsSync(output) || fs.statSync(output).size === 0)) {
          this.fail(`GMT 没有生成有效的地形${step === "cut" ? "网格" : "阴影"}文件。${this.lastOutput ? `\n${this.lastOutput}` : ""}`);
          return;
        }
        if (step === "cut") fs.renameSync(this.gridTempPath, this.paths.gridPath);
        if (step === "gradient") fs.renameSync(this.shadeTempPath, this.paths.shadePath);
        next();
      } else {
        this.fail(this.lastOutput || `GMT ${step} 执行失败：${signal || code}`);
      }
    });
  }

  pause() {
    if (this.done || this.state !== "running") return;
    if (this.child && process.platform !== "win32") {
      this.child.kill("SIGSTOP");
      this.state = "paused";
      this.pausedBySignal = true;
      this.message = "地形底图任务已暂停。";
      this.emit();
      return;
    }
    this.pausing = true;
    if (this.child) this.child.kill();
    this.state = "paused";
    this.message = "地形底图任务已暂停，继续后会重新启动当前步骤。";
    this.emit();
  }

  resume() {
    if (this.done || this.state !== "paused") return;
    if (this.child && this.pausedBySignal && process.platform !== "win32") {
      this.child.kill("SIGCONT");
      this.state = "running";
      this.pausedBySignal = false;
      this.message = "继续准备地形底图...";
      this.emit();
      return;
    }
    this.message = "继续准备地形底图...";
    if (this.currentStep === "gradient" && fs.existsSync(this.paths.gridPath)) {
      this.runGradient();
    } else if (this.currentStep === "offline") {
      this.runSetDownloadMode();
    } else {
      this.runCut();
    }
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.done = true;
    this.state = "cancelled";
    this.message = "地形底图任务已取消。";
    if (this.child) {
      if (this.pausedBySignal && process.platform !== "win32") this.child.kill("SIGCONT");
      this.child.kill();
    }
    fs.rmSync(this.gridTempPath, { force: true });
    fs.rmSync(this.shadeTempPath, { force: true });
    this.emit();
    this.finishSoon();
  }

  complete() {
    this.state = "completed";
    this.message = "地形底图准备完成。";
    this.percent = 100;
    this.done = true;
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `地形底图准备失败：${message}`;
    this.done = true;
    this.emit();
    this.finishSoon();
  }

  statusPayload() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.1);
    const total = this.estimate.workingBytes || 0;
    const downloaded = total ? Math.round(total * (this.percent / 100)) : 0;
    return {
      state: this.state,
      message: this.message,
      step: this.currentStep,
      key: this.paths.key,
      gridPath: this.paths.gridPath,
      shadePath: this.paths.shadePath,
      directory: this.paths.directory,
      estimatedBytes: total,
      downloaded,
      total,
      percent: this.percent,
      speed: downloaded / elapsedSeconds,
      resolution: this.config.terrainResolution,
      region: this.config.region
    };
  }

  emit() {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.lastEmitAt = Date.now();
    this.webContents.send("terrain:progress", this.statusPayload());
  }

  emitThrottled() {
    if (Date.now() - this.lastEmitAt < 250) return;
    this.emit();
  }

  finishSoon() {
    setTimeout(() => {
      if (currentTerrainTask === this && this.onDone) this.onDone();
    }, 1500);
  }
}

class SrtmTerrainWorkerTask {
  constructor({ gmtInfo, outputDirectory, config, webContents, onDone }) {
    this.gmtInfo = gmtInfo;
    this.outputDirectory = outputDirectory;
    this.config = config;
    this.webContents = webContents;
    this.onDone = onDone;
    this.paths = terrainPaths(outputDirectory, config);
    this.estimate = terrainEstimate(config.region, config.terrainResolution);
    this.worker = null;
    this.currentStep = "starting";
    this.state = "starting";
    this.message = "准备 SRTM 高分辨率地形底图...";
    this.percent = 0;
    this.downloaded = 0;
    this.total = this.estimate.workingBytes || 0;
    this.startedAt = Date.now();
    this.done = false;
    this.cancelled = false;
    this.lastOutput = "";
    this.lastEmitAt = 0;
    this.killTimer = null;
  }

  start() {
    initializeArea(this.paths, this.config);
    if (this.estimate.blocked) {
      this.fail(this.estimate.warning);
      return;
    }
    if (fs.existsSync(this.paths.gridPath) && fs.existsSync(this.paths.shadePath)) {
      this.state = "completed";
      this.message = "SRTM 地形底图已存在，可直接绘图。";
      this.percent = 100;
      this.done = true;
      this.emit();
      this.finishSoon();
      return;
    }
    this.spawnWorker();
  }

  spawnWorker() {
    this.currentStep = "worker";
    this.state = "running";
    this.message = "正在启动独立 SRTM 地形处理进程...";
    this.percent = Math.max(this.percent, 1);
    this.emit();
    try {
      const workerPath = path.join(__dirname, "srtm-worker.js");
      this.worker = fork(workerPath, [], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1"
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"]
      });
    } catch (error) {
      this.fail(error.message || String(error));
      return;
    }
    const onOutput = (chunk) => {
      this.lastOutput = tailText(`${this.lastOutput}\n${String(chunk).trim()}`, 4000);
    };
    this.worker.stdout?.on("data", onOutput);
    this.worker.stderr?.on("data", onOutput);
    this.worker.on("message", (message) => {
      if (message?.type === "status") this.applyWorkerStatus(message.status || {});
    });
    this.worker.on("error", (error) => {
      if (!this.done) this.fail(error.message || String(error));
    });
    this.worker.on("exit", (code, signal) => {
      this.worker = null;
      if (this.done) return;
      const detail = this.lastOutput || signal || code;
      this.fail(`SRTM 地形处理进程异常退出：${detail}`);
    });
    this.worker.send({
      type: "start",
      payload: {
        gmtInfo: {
          path: this.gmtInfo.path,
          binDir: this.gmtInfo.binDir,
          gsLib: this.gmtInfo.gsLib
        },
        outputDirectory: this.outputDirectory,
        config: this.config
      }
    });
  }

  applyWorkerStatus(status) {
    this.state = status.state || this.state;
    this.message = status.message || this.message;
    this.currentStep = status.step || this.currentStep;
    this.percent = Number.isFinite(status.percent) ? status.percent : this.percent;
    this.downloaded = Number.isFinite(status.downloaded) ? status.downloaded : this.downloaded;
    this.total = Number.isFinite(status.total) ? status.total : this.total;
    this.emit();
    if (["completed", "failed", "cancelled"].includes(this.state)) {
      this.done = true;
      if (this.killTimer) {
        clearTimeout(this.killTimer);
        this.killTimer = null;
      }
      this.finishSoon();
    }
  }

  pause() {
    if (this.done || !this.worker || this.state !== "running") return;
    this.worker.send({ type: "pause" });
  }

  resume() {
    if (this.done || !this.worker || this.state !== "paused") return;
    this.worker.send({ type: "resume" });
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.state = "cancelled";
    this.message = "SRTM 地形底图任务已取消。";
    this.done = true;
    if (this.worker?.connected) this.worker.send({ type: "cancel" });
    this.killTimer = setTimeout(() => {
      if (this.worker) this.worker.kill();
    }, 4000);
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `SRTM 地形底图准备失败：${message}`;
    this.done = true;
    if (this.worker) this.worker.kill();
    this.emit();
    this.finishSoon();
  }

  statusPayload() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.1);
    return {
      state: this.state,
      message: this.message,
      step: this.currentStep,
      key: this.paths.key,
      gridPath: this.paths.gridPath,
      shadePath: this.paths.shadePath,
      directory: this.paths.directory,
      estimatedBytes: this.total,
      downloaded: this.downloaded,
      total: this.total,
      percent: this.percent,
      speed: this.downloaded / elapsedSeconds,
      resolution: this.config.terrainResolution,
      region: this.config.region
    };
  }

  emit() {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.lastEmitAt = Date.now();
    this.webContents.send("terrain:progress", this.statusPayload());
  }

  finishSoon() {
    setTimeout(() => {
      if (currentTerrainTask === this && this.onDone) this.onDone();
    }, 1500);
  }
}

function tailText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

class InstallerDownloadTask {
  constructor(download, targetPath, webContents, onDone) {
    this.download = download;
    this.targetPath = targetPath;
    this.tempPath = `${targetPath}.download`;
    this.webContents = webContents;
    this.onDone = onDone;
    this.request = null;
    this.response = null;
    this.file = null;
    this.downloaded = 0;
    this.total = 0;
    this.startedAt = Date.now();
    this.state = "starting";
    this.message = "准备下载 GMT 安装包...";
    this.done = false;
    this.cancelled = false;
    this.lastEmitAt = 0;
  }

  start() {
    fs.mkdirSync(path.dirname(this.targetPath), { recursive: true });
    if (fs.existsSync(this.targetPath)) {
      this.state = "completed";
      this.message = "安装包已存在，正在打开。";
      this.done = true;
      this.emit();
      openDownloadedInstaller(this.targetPath);
      this.finishSoon();
      return;
    }
    fs.rmSync(this.tempPath, { force: true });
    this.beginRequest(this.download.url, 0);
  }

  beginRequest(url, redirectCount) {
    if (redirectCount > 5) {
      this.fail("下载重定向次数过多，请检查网络或手动打开 GMT 官网。");
      return;
    }
    this.state = "downloading";
    this.message = "正在连接 GMT 官方下载源...";
    this.emit();

    this.request = https.get(url, { headers: { "User-Agent": "MT-Point-Map-GMT" }, timeout: 30000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          this.fail("下载地址重定向无效。");
          return;
        }
        this.beginRequest(new URL(location, url).toString(), redirectCount + 1);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        this.fail(`服务器返回 HTTP ${response.statusCode}`);
        return;
      }

      this.response = response;
      this.total = Number(response.headers["content-length"] || 0);
      this.file = fs.createWriteStream(this.tempPath);
      this.message = "正在下载 GMT 安装包...";
      this.emit();

      response.on("data", (chunk) => {
        if (this.cancelled) return;
        this.downloaded += chunk.length;
        if (!this.file.write(chunk)) {
          response.pause();
          this.file.once("drain", () => {
            if (this.state === "downloading" && !this.cancelled) response.resume();
          });
        }
        this.emitThrottled();
      });

      response.on("end", () => {
        if (this.cancelled) return;
        this.file.end(() => {
          fs.renameSync(this.tempPath, this.targetPath);
          this.state = "completed";
          this.message = "GMT 安装包下载完成，正在打开安装包。";
          this.done = true;
          this.emit();
          openDownloadedInstaller(this.targetPath);
          this.finishSoon();
        });
      });

      response.on("error", (error) => {
        if (!this.cancelled) this.fail(error.message || String(error));
      });

      this.file.on("error", (error) => {
        if (!this.cancelled) this.fail(error.message || String(error));
      });
    });

    this.request.on("timeout", () => {
      this.request.destroy(new Error("下载超时，请检查网络连接。"));
    });
    this.request.on("error", (error) => {
      if (!this.cancelled) this.fail(error.message || String(error));
    });
  }

  pause() {
    if (this.state !== "downloading" || !this.response) return;
    this.response.pause();
    this.state = "paused";
    this.message = "下载已暂停。";
    this.emit();
  }

  resume() {
    if (this.state !== "paused" || !this.response) return;
    this.state = "downloading";
    this.message = "继续下载 GMT 安装包...";
    this.response.resume();
    this.emit();
  }

  cancel() {
    if (this.done) return;
    this.cancelled = true;
    this.state = "cancelled";
    this.message = "下载已取消。";
    this.done = true;
    if (this.request) this.request.destroy();
    if (this.response) this.response.destroy();
    if (this.file) this.file.destroy();
    fs.rmSync(this.tempPath, { force: true });
    this.emit();
    this.finishSoon();
  }

  fail(message) {
    if (this.done) return;
    this.state = "failed";
    this.message = `GMT 安装包下载失败：${message}`;
    this.done = true;
    if (this.file) this.file.destroy();
    fs.rmSync(this.tempPath, { force: true });
    this.emit();
    this.finishSoon();
  }

  statusPayload() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.1);
    const percent = this.total > 0 ? Math.min(100, (this.downloaded / this.total) * 100) : 0;
    return {
      state: this.state,
      message: this.message,
      fileName: this.download.fileName,
      filePath: this.targetPath,
      downloaded: this.downloaded,
      total: this.total,
      percent,
      speed: this.downloaded / elapsedSeconds
    };
  }

  emit() {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    this.lastEmitAt = Date.now();
    this.webContents.send("gmt:downloadProgress", this.statusPayload());
  }

  emitThrottled() {
    if (Date.now() - this.lastEmitAt < 180) return;
    this.emit();
  }

  finishSoon() {
    setTimeout(() => {
      if (currentInstallerDownload === this && this.onDone) this.onDone();
    }, 1200);
  }
}
