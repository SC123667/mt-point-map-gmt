// MTpy is the sole scientific and plotting engine for this workspace.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const VERSION = '2.1.4';
function pythonPath() {
  if (process.env.MT_GMT_MTPY_PYTHON) return process.env.MT_GMT_MTPY_PYTHON;
  const root = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'MTPointMapGMT', `mtpy-v${VERSION}`)
    : path.join(os.homedir(), 'Library', 'Application Support', 'MTPointMapGMT', `mtpy-v${VERSION}`);
  return path.join(root, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}
function scriptPath() {
  return path.join(__dirname, 'mtpy_backend.py').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}
function run(payload, {onProgress = () => {}, onChild = () => {}} = {}) {
  return new Promise((resolve, reject) => {
    const python = pythonPath();
    if (!fs.existsSync(python)) return reject(new Error('尚未配置 MTpy-v2 2.1.4 独立环境。请按 docs/MTPY_INTEGRATION.md 配置；不会改用旧算法。'));
    const child = spawn(python, ['-u', scriptPath()], {
      env: {...process.env, MPLBACKEND: 'Agg', PYTHONUNBUFFERED: '1'}, stdio: ['pipe','pipe','pipe']
    });
    onChild(child);
    // Preserve UTF-8 characters when the larger layer manifest crosses chunks.
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let output = '', errors = '', pending = '', timedOut = false;
    const timer = setTimeout(() => {timedOut = true; child.kill();}, 10 * 60 * 1000);
    child.stdout.on('data', b => {output += b;});
    child.stderr.on('data', b => {
      errors = (errors + b).slice(-12000); pending += b;
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) if (line.startsWith('MTPY_PROGRESS ')) {
        try {onProgress(JSON.parse(line.slice(14)));} catch {}
      }
    });
    child.on('error', e => {clearTimeout(timer); reject(e);});
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        const clean=errors.replace(/\x1b\[[0-9;]*m/g,'');
        if(payload.output){try{fs.writeFileSync(path.join(payload.output,'MTpy错误日志.txt'),clean);}catch{}}
        const reason=clean.trim().split('\n').filter(line=>/^[A-Za-z][A-Za-z0-9_.]*(Error|Exception):/.test(line)).pop()||clean.trim().split('\n').pop();
        return reject(new Error(timedOut ? 'MTpy 运行超时。' : signal ? 'MTpy 任务已取消。' : `MTpy 运行失败：${reason}`));
      }
      try {resolve(JSON.parse(output.trim().split('\n').pop()));}
      catch {reject(new Error(`MTpy 未返回有效结果：${errors.slice(-2500)}`));}
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
module.exports = {run, pythonPath, scriptPath, VERSION};
