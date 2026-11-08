// In-memory project edits only. Imported record/EDI arrays are shared between
// snapshots; no 20-fold serialization of the scientific data on the UI thread.
const projectHistory = { past: [], current: null, restoring: false, queued: false, editKey: null };
const HISTORY_LIMIT = 20;
function historyTextTarget(target = document.activeElement) {
  return !!target && (target.isContentEditable || target.tagName === 'TEXTAREA' ||
    (target.tagName === 'INPUT' && !['checkbox','radio','button','range','color','file'].includes(target.type)));
}
function historySnapshot() {
  const project = createProjectSnapshot();
  const { parsed, allRecords, savedAt, appVersion, gmtEngine, outputDirectory, ...small } = project;
  // Generated cache paths/progress are not user edits or undoable filesystem operations.
  small.terrain = { localGridPath: state.terrain.localGridPath };
  small.config.showTerrain = el.showTerrainInput.checked;
  delete small.config.terrainGridPath; delete small.config.terrainShadePath;
  const key = JSON.stringify(small);
  return { key, small: JSON.parse(key), allRecords,
    parsed: parsed ? { ...parsed, mapping: { ...state.mapping } } : null };
}
function renderHistoryButton() {
  const button = document.getElementById('headerUndoBtn');
  if (!button) return;
  button.disabled = !projectHistory.past.length;
  button.title = `撤销上一步制图修改（${projectHistory.past.length}/20）· Command+Z / Ctrl+Z`;
}
function resetProjectHistory() {
  projectHistory.past = []; projectHistory.editKey = null;
  projectHistory.current = historySnapshot(); renderHistoryButton();
}
function recordProjectHistory(editKey = null) {
  if (!projectHistory.current || projectHistory.restoring) return;
  const next = historySnapshot(), old = projectHistory.current;
  if (old.key === next.key && old.allRecords === next.allRecords) return;
  if (!editKey || projectHistory.editKey !== editKey) {
    projectHistory.past.push(old);
    if (projectHistory.past.length > HISTORY_LIMIT) projectHistory.past.shift();
  }
  projectHistory.current = next; projectHistory.editKey = editKey; renderHistoryButton();
}
function queueProjectHistory() {
  if (!projectHistory.current || projectHistory.restoring || projectHistory.queued) return;
  projectHistory.queued = true;
  queueMicrotask(() => {
    projectHistory.queued = false;
    recordProjectHistory(historyTextTarget() ? document.activeElement : null);
  });
}
function undoProjectEdit() {
  recordProjectHistory(historyTextTarget() ? document.activeElement : null);
  const previous = projectHistory.past.pop();
  if (!previous) { notify('没有可撤销的制图修改（最多保留 20 步）。'); return; }
  projectHistory.restoring = true;
  try {
    const project = JSON.parse(JSON.stringify(previous.small));
    project.allRecords = previous.allRecords;
    project.parsed = previous.parsed ? { ...previous.parsed, mapping: { ...previous.parsed.mapping } } : null;
    clearTimeout(state.preview.autoTimer);
    restoreProjectSnapshot(project, state.projectPath);
    state.parsed = project.parsed;
    renderRegionBoxes(); renderStationClasses(); renderSelectionOverlay();
    // Restoring defaults may normalize old settings; use the resulting state as
    // baseline so background preview completion never creates a phantom step.
    projectHistory.current = historySnapshot(); projectHistory.editKey = null;
    notify(`已撤销上一步，剩余 ${projectHistory.past.length} 步可撤销。`);
  } finally { projectHistory.restoring = false; renderHistoryButton(); }
}
function initProjectHistory() {
  resetProjectHistory();
  document.getElementById('headerUndoBtn').addEventListener('click', undoProjectEdit);
  // Capture at the end of the synchronous action, including edits that do not
  // schedule a preview. Async import/drawing completion calls the same queue.
  for (const name of ['change','click','pointerup']) document.addEventListener(name, queueProjectHistory);
  document.addEventListener('focusout', () => { recordProjectHistory(projectHistory.editKey); projectHistory.editKey = null; });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z' && !historyTextTarget(event.target)) {
      event.preventDefault(); undoProjectEdit();
    }
  });
  window.mtApp.onMenuUndo?.(() => {
    if (historyTextTarget()) document.execCommand('undo'); else undoProjectEdit();
  });
}
