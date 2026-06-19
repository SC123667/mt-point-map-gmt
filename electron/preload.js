const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mtApp", {
  status: () => ipcRenderer.invoke("app:status"),
  openFile: () => ipcRenderer.invoke("file:open"),
  loadSample: () => ipcRenderer.invoke("file:sample"),
  applyMapping: (payload) => ipcRenderer.invoke("data:applyMapping", payload),
  buildScript: (payload) => ipcRenderer.invoke("gmt:buildScript", payload),
  saveScript: (payload) => ipcRenderer.invoke("gmt:saveScript", payload),
  exportMap: (payload) => ipcRenderer.invoke("gmt:export", payload),
  installGMT: () => ipcRenderer.invoke("gmt:install"),
  recheckGMT: () => ipcRenderer.invoke("gmt:recheck"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath)
});
