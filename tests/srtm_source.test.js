const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const { srtmSource, srtmTilesForRegion } = require('../electron/srtm-source');
const { decodeSrtmJp2, jp2Codestream } = require('../electron/srtm-jp2');
const { terrainEstimate } = require('../electron/gmt');
const fixtures = path.join(__dirname, 'fixtures');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srtm-sources-'));

async function runWorker(source, mode, action, outputDirectory, region = '0/0.001/0.999/1') {
  const out = outputDirectory || fs.mkdtempSync(path.join(tmp, 'case-'));
  const requests = path.join(out, 'requests.txt');
  const mockGmt = path.join(tmp, 'mock-gmt.sh');
  fs.writeFileSync(mockGmt, '#!/bin/sh\nfor arg in "$@"; do\ncase "$arg" in -G*) printf "grid" > "${arg#-G}" ;; esac\ndone\n', { mode: 0o755 });
  const worker = fork(path.join(__dirname, '../electron/srtm-worker.js'), [], {
    execArgv: ['--require', path.join(fixtures, 'srtm-download-preload.cjs')],
    env: { ...process.env, SRTM_TEST_REQUESTS: requests, SRTM_TEST_MODE: mode, SRTM_TEST_JP2: path.join(fixtures, 'srtm-3601.jp2') },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  const statuses = [];
  let stderr = '';
  let acted = false;
  let resumed = false;
  worker.stderr.on('data', b => { stderr += b; });
  worker.on('message', ({ status }) => {
    if (!status) return;
    statuses.push(status);
    if (action && !acted && status.step === 'download' && status.state === 'running') {
      acted = true;
      worker.send({ type: action === 'pauseResume' ? 'pause' : 'cancel' });
    }
    if (action === 'pauseResume' && status.state === 'paused' && !resumed) {
      resumed = true;
      const pausedIndex = statuses.length;
      setTimeout(() => {
        assert(!statuses.slice(pausedIndex).some(s => s.state === 'running' || s.state === 'completed'), 'paused job advanced to decoding: '+JSON.stringify(statuses.map(({state,step})=>({state,step}))));
        worker.send({ type: 'resume' });
      }, 150);
    }
  });
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.kill(); reject(new Error('worker timeout')); }, 12000);
    worker.on('exit', code => { clearTimeout(timer); resolve({ code, statuses, stderr, out, requests }); });
    worker.on('error', reject);
  });
  worker.send({ type: 'start', payload: { gmtInfo: { path: mockGmt, binDir: tmp }, outputDirectory: out,
    config: { region, terrainResolution: region.includes('/4/') ? '30s' : '01s', terrainAllowDownload: mode !== 'offline', terrainSrtmSource: source }
  } });
  return result;
}

(async () => {
  try {
    assert.strictEqual(srtmSource({}), 'ustc');
    assert.strictEqual(srtmSource({ terrainDataServer: 'https://mirrors.ustc.edu.cn/gmtdata/' }), 'ustc');
    assert.strictEqual(srtmSource({ terrainDataServer: 'oceania' }), 'aws');
    assert.strictEqual(srtmSource({ terrainSrtmSource: 'aws' }), 'aws');
    for (const source of ['ustc', 'aws']) {
      const tiles = srtmTilesForRegion('87/88/28/29', tmp, source);
      assert.strictEqual(tiles.length, 1, 'integer bounds must not fetch extra tiles');
      assert.strictEqual(tiles[0].name, 'N28E087');
      assert(tiles[0].url.includes(source === 'ustc' ? 'mirrors.ustc.edu.cn' : 's3.amazonaws.com'));
    }
    assert.strictEqual(terrainEstimate('87/88/28/29', '01s').tileCount, 1);
    const seam = srtmTilesForRegion('179.9/180.1/-1/0', tmp);
    assert.deepStrictEqual(seam.map(t => t.name), ['S01E179', 'S01W180']);
    assert.deepStrictEqual(seam.map(t => t.lon), [179, 180]);
    assert.deepStrictEqual(srtmTilesForRegion('0/1/59/61', tmp), []);
    const jp2 = fs.readFileSync(path.join(fixtures, 'srtm-signed.jp2'));
    const decoded = await decodeSrtmJp2(jp2);
    for (let i = 0; i < 64; i++) assert.strictEqual(decoded.readInt16BE(i * 2), [100, -25, -32768, 32767][Math.floor(i / 16)]);
    await assert.rejects(decodeSrtmJp2(Buffer.from('not jp2')), /JP2/);
    await assert.rejects(decodeSrtmJp2(jp2.subarray(0, jp2.length - 7)), /不完整/);
    const huge = Buffer.from(jp2); jp2Codestream(huge).writeUInt32BE(999999, 8);
    await assert.rejects(decodeSrtmJp2(huge), /3601/);
    const unsigned = Buffer.from(jp2); jp2Codestream(unsigned)[42] = 15;
    await assert.rejects(decodeSrtmJp2(unsigned), /有符号/);

    if (process.platform !== 'win32') {
      for (const source of ['ustc', 'aws']) {
        const r = await runWorker(source, 'success', 'pauseResume');
        assert.strictEqual(r.code, 0, r.stderr + JSON.stringify(r.statuses.at(-1)));
        assert.strictEqual(r.statuses.at(-1).state, 'completed');
        assert(r.statuses.some(s => s.state === 'paused'));
        assert(r.statuses.some(s => s.message.includes(source === 'ustc' ? 'USTC' : 'AWS')));
        assert.strictEqual(fs.readFileSync(r.requests, 'utf8').trim().split('\n').length, 1);
        const cache = srtmTilesForRegion('0/0.001/0.999/1',path.join(r.out,'terrain_cache'),source)[0].hgtPath;
        assert.strictEqual(fs.statSync(cache).size, 3601 * 3601 * 2);
        if (source === 'ustc') assert.deepStrictEqual([0, 1, 2, 3].map(i => fs.readFileSync(cache).readInt16BE(i * 2)), [-25, -32768, 32767, 100]);
        // Source switching must reuse completed tiles even with downloads disabled.
        fs.unlinkSync(r.statuses.at(-1).gridPath); fs.unlinkSync(r.statuses.at(-1).shadePath);
        fs.unlinkSync(r.requests);
        const reuse = await runWorker(source === 'ustc' ? 'aws' : 'ustc', 'offline', null, r.out);
        assert.strictEqual(reuse.statuses.at(-1).state, 'completed');
        assert(!fs.existsSync(reuse.requests));
      }
      const parallel=await runWorker('ustc','success','pauseResume',undefined,'0/4/0.999/1');
      assert.strictEqual(parallel.statuses.at(-1).state,'completed',parallel.stderr);
      assert.strictEqual(fs.readFileSync(parallel.requests,'utf8').trim().split('\n').length,4);
      const peak=Math.max(...fs.readFileSync(parallel.requests+'.active','utf8').trim().split('\n').map(Number));
      assert.strictEqual(peak,3,'download concurrency must be bounded at three');
      for (const mode of ['http404', 'truncated', 'invalid', 'offline']) {
        const r = await runWorker('ustc', mode);
        assert.strictEqual(r.statuses.at(-1).state, 'failed', mode);
        assert(!fs.existsSync(srtmTilesForRegion('0/0.001/0.999/1',path.join(r.out,'terrain_cache'))[0].hgtPath));
        assert(!fs.existsSync(srtmTilesForRegion('0/0.001/0.999/1',path.join(r.out,'terrain_cache'))[0].downloadPath + '.download'));
      }
      const cancel = await runWorker('ustc', 'success', 'cancel');
      assert.strictEqual(cancel.statuses.at(-1).state, 'cancelled');
      assert(!fs.existsSync(srtmTilesForRegion('0/0.001/0.999/1',path.join(cancel.out,'terrain_cache'))[0].hgtPath));
    }
    console.log('SRTM source, JP2 elevation, download controls and cache tests passed');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
