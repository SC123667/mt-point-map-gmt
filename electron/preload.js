const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mtApp", {
  status: () => ipcRenderer.invoke("app:status"),
  openFile: () => ipcRenderer.invoke("file:open"),
  loadSample: () => ipcRenderer.invoke("file:sample"),
  applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
  buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
  saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
  exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
  chooseOutputDirectory: (currentDirectory) => ipcRenderer.invoke("output:chooseDirectory", currentDirectory),
  imageDataUrl: (filePath) => ipcRenderer.invoke("preview:imageDataUrl", filePath),
  installGMT: () => ipcRenderer.invoke("gmt:install"),
  pauseGMTDownload: () => ipcRenderer.invoke("gmt:downloadPause"),
  resumeGMTDownload: () => ipcRenderer.invoke("gmt:downloadResume"),
  cancelGMTDownload: () => ipcRenderer.invoke("gmt:downloadCancel"),
  onGMTDownloadProgress: (handler) => ipcRenderer.on("gmt:downloadProgress", (_event, payload) => handler(payload)),
  recheckGMT: () => ipcRenderer.invoke("gmt:recheck"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath)
});
