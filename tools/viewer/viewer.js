/**
 * Scenario Viewer logic. Works against two data sources:
 *
 *  - HttpSource: the dev server (tools/viewer/serve.js) - scenario listing,
 *    screenshots, achievements from the cruncheevos sets, marker saving.
 *  - LocalSource: a scenarios folder opened directly in the browser (via
 *    the File System Access API or a directory <input>), used by the static
 *    single-file build (npm run viewer:build). Marker saving works when the
 *    folder was opened with write permission; achievements come from an
 *    optional achievements.json in the folder (tools/export-achievements.js).
 */

import { parseRecording, Scenario } from '../../src/scenario-format.js';
import { parseTrigger, conditionSpans } from '../../src/trigger.js';
import { createPeek } from '../../src/harness.js';

window.__viewerBooted = true; /* suppresses index.html's file:// hint banner */

const $ = (id) => document.getElementById(id);

const STATE_COLORS = {
  waiting: '#555b6b', active: '#3b6ea5', paused: '#8a5fb0', primed: '#d0a02f',
  reset: '#d0662f', triggered: '#3fa860', inactive: '#3a3f4d',
};

/* ================= data sources ================= */

class HttpSource {
  static async detect() {
    if (location.protocol === 'file:') return null;
    try {
      const res = await fetch('/api/scenarios');
      if (!res.ok) return null;
      return new HttpSource(await res.json());
    } catch {
      return null;
    }
  }

  constructor(scenarios) {
    this._scenarios = scenarios;
    this.canSave = true;
  }

  async listScenarios() { return this._scenarios; }

  async loadScenario(name) {
    const [csvText, meta, shotFrames] = await Promise.all([
      fetch(`/scenarios/${name}/recording.txt`).then((r) => r.text()),
      fetch(`/scenarios/${name}/meta.json`).then((r) => r.json()).catch(() => ({ name })),
      fetch(`/api/scenarios/${name}/screenshots`).then((r) => r.json()),
    ]);
    const screenshots = new Map(shotFrames.map((f) =>
      [f, `/scenarios/${name}/screenshots/${f}.png`]));
    return { meta, csvText, screenshots };
  }

  async saveMeta(name, meta) {
    await fetch(`/api/scenarios/${name}/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meta),
    });
  }

  async listAchievements() {
    try {
      return await fetch('/api/achievements').then((r) => r.json());
    } catch {
      return [];
    }
  }
}

class LocalSource {
  /**
   * @param entries Map<name, { csvFile, metaFile, shots: Map<frame, fileLike>, dirHandle }>
   *        fileLike is a File or a FileSystemFileHandle
   * @param rootFiles extra files at the root (achievements.json)
   */
  constructor(entries, rootFiles = new Map()) {
    this._entries = entries;
    this._rootFiles = rootFiles;
    this.canSave = [...entries.values()].some((e) => e.dirHandle);
  }

  static async _asFile(fileLike) {
    return typeof fileLike?.getFile === 'function' ? fileLike.getFile() : fileLike;
  }

  /** Build from a FileSystemDirectoryHandle (scenarios root or one scenario). */
  static async fromDirectoryHandle(root) {
    const entries = new Map();
    const rootFiles = new Map();

    const readScenarioDir = async (name, dir) => {
      const entry = { name, shots: new Map(), dirHandle: dir };
      for await (const [childName, child] of dir.entries()) {
        if (child.kind === 'file' && childName === 'recording.txt') entry.csvFile = child;
        else if (child.kind === 'file' && childName === 'meta.json') entry.metaFile = child;
        else if (child.kind === 'directory' && childName === 'screenshots') {
          for await (const [shotName, shot] of child.entries()) {
            const frame = Number(shotName.replace(/\.png$/, ''));
            if (shot.kind === 'file' && Number.isFinite(frame)) entry.shots.set(frame, shot);
          }
        }
      }
      if (entry.csvFile) entries.set(name, entry);
    };

    /* the picked folder may itself be a single scenario */
    let isScenario = false;
    for await (const [childName, child] of root.entries()) {
      if (child.kind === 'file' && childName === 'recording.txt') isScenario = true;
    }

    if (isScenario) {
      await readScenarioDir(root.name, root);
    } else {
      for await (const [childName, child] of root.entries()) {
        if (child.kind === 'directory') await readScenarioDir(childName, child);
        else if (childName === 'achievements.json') rootFiles.set(childName, child);
      }
    }

    return new LocalSource(entries, rootFiles);
  }

  /** Build from a FileList produced by <input type=file webkitdirectory>. */
  static fromFileList(files) {
    const entries = new Map();
    const rootFiles = new Map();

    for (const file of files) {
      const parts = (file.webkitRelativePath || file.name).split('/');
      const idx = parts.indexOf('recording.txt');
      const midx = parts.indexOf('meta.json');
      const sidx = parts.indexOf('screenshots');
      /* scenario name is the folder containing recording.txt/meta.json/screenshots */
      let name = null, kind = null;
      if (idx > 0) { name = parts[idx - 1]; kind = 'csv'; }
      else if (midx > 0) { name = parts[midx - 1]; kind = 'meta'; }
      else if (sidx > 0 && parts.length === sidx + 2) { name = parts[sidx - 1]; kind = 'shot'; }
      else if (parts[parts.length - 1] === 'achievements.json') {
        rootFiles.set('achievements.json', file);
        continue;
      }
      if (!name) continue;

      if (!entries.has(name)) entries.set(name, { name, shots: new Map(), dirHandle: null });
      const entry = entries.get(name);
      if (kind === 'csv') entry.csvFile = file;
      else if (kind === 'meta') entry.metaFile = file;
      else if (kind === 'shot') {
        const frame = Number(parts[parts.length - 1].replace(/\.png$/, ''));
        if (Number.isFinite(frame)) entry.shots.set(frame, file);
      }
    }

    for (const [name, entry] of entries) if (!entry.csvFile) entries.delete(name);
    return new LocalSource(entries, rootFiles);
  }

  async listScenarios() {
    const list = [];
    for (const [name, entry] of this._entries) {
      let meta = { name };
      if (entry.metaFile) {
        try {
          meta = { name, ...JSON.parse(await (await LocalSource._asFile(entry.metaFile)).text()) };
        } catch { /* keep default */ }
      }
      list.push(meta);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadScenario(name) {
    const entry = this._entries.get(name);
    const csvText = await (await LocalSource._asFile(entry.csvFile)).text();

    let meta = { name };
    if (entry.metaFile) {
      try { meta = JSON.parse(await (await LocalSource._asFile(entry.metaFile)).text()); }
      catch { /* keep default */ }
    }

    const screenshots = new Map();
    for (const [frame, fileLike] of [...entry.shots.entries()].sort((a, b) => a[0] - b[0]))
      screenshots.set(frame, URL.createObjectURL(await LocalSource._asFile(fileLike)));

    return { meta, csvText, screenshots };
  }

  async saveMeta(name, meta) {
    const entry = this._entries.get(name);
    if (!entry?.dirHandle) throw new Error('folder was opened read-only');
    if ((await entry.dirHandle.requestPermission?.({ mode: 'readwrite' })) === 'denied')
      throw new Error('write permission denied');
    const handle = await entry.dirHandle.getFileHandle('meta.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(meta, null, 2) + '\n');
    await writable.close();
  }

  async listAchievements() {
    const file = this._rootFiles.get('achievements.json');
    if (!file) return [];
    try { return JSON.parse(await (await LocalSource._asFile(file)).text()); }
    catch { return []; }
  }
}

/* ================= app state ================= */

const state = {
  source: null,
  scenario: null,
  scenarioName: null,
  meta: null,
  screenshots: new Map(), /* frame -> url */
  index: 0,
  run: null,
  playing: null,
};

async function fetchScenarioList() {
  const scenarios = await state.source.listScenarios();
  const select = $('scenario-select');
  select.innerHTML = scenarios.map((s) =>
    `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
  return scenarios;
}

async function populateAchievements() {
  const achievements = await state.source.listAchievements();
  const achSelect = $('achievement-select');
  achSelect.innerHTML = '<option value="">(none)</option>';
  for (const a of achievements) {
    const opt = document.createElement('option');
    opt.value = a.definition;
    opt.textContent = `${a.set}: ${a.title}`;
    achSelect.appendChild(opt);
  }
  achSelect.parentElement.style.display = achievements.length ? '' : 'none';
}

async function useSource(source, preferredScenario = null) {
  state.source = source;
  $('save-hint').textContent = source.canSave ? '' :
    'read-only: markers cannot be saved (use the folder picker button in Chrome for write access)';

  await populateAchievements();
  const scenarios = await fetchScenarioList();
  if (preferredScenario && scenarios.some((s) => s.name === preferredScenario))
    $('scenario-select').value = preferredScenario;
  if (scenarios.length) await loadScenario($('scenario-select').value);
}

async function loadScenario(name) {
  const { meta, csvText, screenshots } = await state.source.loadScenario(name);
  const { columns, rows } = parseRecording(csvText);

  state.scenario = new Scenario({ meta, columns, rows });
  state.scenarioName = name;
  state.meta = meta;
  state.meta.markers = state.meta.markers ?? {};
  state.screenshots = screenshots;
  state.index = 0;

  $('scenario-desc').textContent = meta.description ?? '';
  const slider = $('slider');
  slider.min = 0;
  slider.max = state.scenario.length - 1;
  slider.value = 0;
  $('frame-range').textContent = `/ ${state.scenario.firstFrame}–${state.scenario.lastFrame}`;

  buildMemoryTable();
  if ($('trigger-input').value.trim()) setTrigger($('trigger-input').value.trim());
  else { state.run = null; buildConditionTables(); }
  render();
}

/* ================= trigger runs ================= */

function setTrigger(definition) {
  $('trigger-error').textContent = '';
  state.run = null;

  if (!definition || !state.scenario) { buildConditionTables(); render(); return; }

  try {
    const trigger = parseTrigger(definition);
    const spans = conditionSpans(definition);
    const frames = state.scenario.frames;

    const groups = trigger.groups.map((g, i) => ({
      name: i === 0 ? 'Core' : `Alt ${i}`,
      conditions: g ? g.conditions : [],
      spans: spans[i] ?? [],
    }));
    const flat = groups.flatMap((g) => g.conditions);

    const n = frames.length;
    const states = new Array(n);
    const measured = new Array(n);
    const hits = new Uint32Array(n * flat.length);
    const truth = new Uint8Array(n * flat.length);

    for (let f = 0; f < n; f++) {
      states[f] = trigger.evaluate(createPeek(frames[f]));
      measured[f] = trigger.measuredValue >>> 0;
      for (let c = 0; c < flat.length; c++) {
        hits[f * flat.length + c] = flat[c].currentHits;
        truth[f * flat.length + c] = flat[c].isTrue & 1;
      }
    }

    state.run = {
      definition, groups, flat, states, measured, hits, truth,
      measuredTarget: trigger.measuredTarget,
      triggeredIndex: states.indexOf('triggered'),
    };
  } catch (e) {
    $('trigger-error').textContent = e.message;
  }

  buildConditionTables();
  render();
}

/* ================= rendering ================= */

function buildMemoryTable() {
  const tbody = $('memory-table').querySelector('tbody');
  tbody.innerHTML = state.scenario.columns.map((col, i) => `
    <tr data-col="${i}">
      <td>${escapeHtml(state.scenario.label(col.address))}</td>
      <td class="addr">0x${col.address.toString(16).padStart(4, '0')}:${col.size}</td>
      <td class="num val" data-cell="dec"></td>
      <td class="num addr" data-cell="hex"></td>
      <td class="num addr" data-cell="prev"></td>
    </tr>`).join('');
}

function buildConditionTables() {
  const host = $('cond-groups');
  if (!state.run) {
    host.className = 'hint';
    host.textContent = 'Pick an achievement or paste a trigger string to inspect per-condition state for every frame.';
    return;
  }
  host.className = '';

  let flatIndex = 0;
  host.innerHTML = state.run.groups.map((group) => {
    const rows = group.conditions.map((cond, i) => {
      const fi = flatIndex++;
      const text = group.spans[i]?.text ?? '';
      const target = cond.requiredHits ? ` / ${cond.requiredHits}` : '';
      return `<tr data-flat="${fi}">
        <td class="dot"><span data-cell="dot"></span></td>
        <td class="cond-text">${escapeHtml(text)}</td>
        <td class="num"><span data-cell="hits"></span><span class="dimtext">${target}</span></td>
      </tr>`;
    }).join('');
    return `<div class="groupname">${group.name}${group.conditions.length ? '' : ' (empty — always true)'}</div>
      <table><tbody>${rows}</tbody></table>`;
  }).join('');
}

function nearestScreenshot(frameNumber) {
  let best = null;
  for (const frame of state.screenshots.keys()) {
    if (frame <= frameNumber && (best === null || frame > best)) best = frame;
  }
  return best;
}

function render() {
  const sc = state.scenario;
  if (!sc) return;
  const index = state.index;
  const frameNumber = sc.frameNumberAt(index);

  $('slider').value = index;
  $('frame-no').textContent = `frame ${frameNumber}`;

  const shotHost = $('shot');
  const shotFrame = nearestScreenshot(frameNumber);
  if (shotFrame !== null) {
    shotHost.innerHTML = `<img src="${state.screenshots.get(shotFrame)}" alt="">
      <span class="caption">shot @ ${shotFrame}${shotFrame === frameNumber ? '' : ` (frame ${frameNumber})`}</span>`;
  } else {
    shotHost.innerHTML = `<span class="placeholder">no screenshot ≤ frame ${frameNumber}</span>`;
  }

  const values = sc.values[index];
  const prev = index > 0 ? sc.values[index - 1] : values;
  for (const tr of $('memory-table').querySelectorAll('tbody tr')) {
    const col = Number(tr.dataset.col);
    const v = values[col];
    tr.querySelector('[data-cell=dec]').textContent = v;
    tr.querySelector('[data-cell=hex]').textContent = '0x' + v.toString(16);
    tr.querySelector('[data-cell=prev]').textContent = prev[col];
    tr.classList.toggle('changed', prev[col] !== v);
  }

  const badge = $('state-badge');
  if (state.run) {
    let s = state.run.states[index];
    if (state.run.triggeredIndex >= 0 && index > state.run.triggeredIndex) s = 'inactive';
    badge.textContent = s;
    badge.style.background = STATE_COLORS[s] ?? 'var(--inactive)';

    const flatCount = state.run.flat.length;
    for (const tr of $('cond-groups').querySelectorAll('tr[data-flat]')) {
      const fi = Number(tr.dataset.flat);
      tr.querySelector('[data-cell=hits]').textContent = state.run.hits[index * flatCount + fi];
      tr.querySelector('[data-cell=dot]').classList.toggle('on', !!state.run.truth[index * flatCount + fi]);
    }

    const measuredHost = $('measured');
    if (state.run.measuredTarget) {
      measuredHost.hidden = false;
      const value = state.run.measured[index] === 0xffffffff ? 0 : state.run.measured[index];
      $('measured-fill').style.width = `${Math.min(100, 100 * value / state.run.measuredTarget)}%`;
      $('measured-text').textContent = `${value} / ${state.run.measuredTarget}`;
    } else {
      measuredHost.hidden = true;
    }
  } else {
    badge.textContent = 'no trigger';
    badge.style.background = 'var(--inactive)';
    $('measured').hidden = true;
  }

  renderMarkers();
  drawTimeline();
}

function renderMarkers() {
  const host = $('markers');
  host.querySelectorAll('.marker-chip').forEach((el) => el.remove());
  const markers = Object.entries(state.meta?.markers ?? {}).sort((a, b) => a[1] - b[1]);
  const input = $('marker-name');
  for (const [name, frame] of markers) {
    const chip = document.createElement('span');
    chip.className = 'marker-chip';
    chip.innerHTML = `<b title="jump to ${frame}">${escapeHtml(name)}</b>
      <span class="dimtext">${frame}</span><span class="x" title="delete">×</span>`;
    chip.querySelector('b').onclick = () => seek(frame - state.scenario.firstFrame);
    chip.querySelector('.x').onclick = () => { delete state.meta.markers[name]; saveMeta(); };
    host.insertBefore(chip, input);
  }
}

function drawTimeline() {
  const canvas = $('timeline');
  const sc = state.scenario;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const n = sc.length;
  const xOf = (i) => (i / Math.max(1, n - 1)) * (w - 2) + 1;

  if (state.run) {
    for (let x = 0; x < w; x++) {
      const i = Math.min(n - 1, Math.floor((x / w) * n));
      let s = state.run.states[i];
      if (state.run.triggeredIndex >= 0 && i > state.run.triggeredIndex) s = 'inactive';
      ctx.fillStyle = STATE_COLORS[s] ?? '#333';
      ctx.fillRect(x, 6, 1, h - 12);
    }
    if (state.run.triggeredIndex >= 0) {
      ctx.fillStyle = '#7ef0a5';
      ctx.fillRect(xOf(state.run.triggeredIndex) - 1, 2, 3, h - 4);
    }
  } else {
    ctx.fillStyle = '#2a2e3a';
    ctx.fillRect(0, 6, w, h - 12);
  }

  ctx.fillStyle = '#e8c66a';
  for (const frame of Object.values(state.meta?.markers ?? {})) {
    if (frame < sc.firstFrame || frame > sc.lastFrame) continue;
    ctx.fillRect(xOf(frame - sc.firstFrame), 0, 1, 5);
  }

  ctx.fillStyle = '#fff';
  ctx.fillRect(xOf(state.index) - 0.5, 0, 1.5, h);
}

/* ================= interaction ================= */

function seek(index) {
  if (!state.scenario) return;
  state.index = Math.max(0, Math.min(state.scenario.length - 1, index));
  render();
}

function stopPlaying() {
  if (state.playing) { clearInterval(state.playing); state.playing = null; $('btn-play').textContent = '▶'; }
}

async function saveMeta() {
  try {
    await state.source.saveMeta(state.scenarioName, state.meta);
    $('save-hint').textContent = '';
  } catch (e) {
    $('save-hint').textContent = `markers not saved: ${e.message}`;
  }
  render();
}

function bindUi() {
  $('scenario-select').onchange = (e) => loadScenario(e.target.value);
  $('trigger-input').onchange = () => setTrigger($('trigger-input').value.trim());
  $('achievement-select').onchange = (e) => {
    $('trigger-input').value = e.target.value;
    setTrigger(e.target.value);
  };

  $('slider').oninput = (e) => { stopPlaying(); seek(Number(e.target.value)); };
  $('btn-back').onclick = () => { stopPlaying(); seek(state.index - 1); };
  $('btn-fwd').onclick = () => { stopPlaying(); seek(state.index + 1); };
  $('btn-back10').onclick = () => { stopPlaying(); seek(state.index - 10); };
  $('btn-fwd10').onclick = () => { stopPlaying(); seek(state.index + 10); };
  $('btn-start').onclick = () => { stopPlaying(); seek(0); };
  $('btn-end').onclick = () => { stopPlaying(); seek(Infinity); };
  $('btn-play').onclick = () => {
    if (state.playing) return stopPlaying();
    $('btn-play').textContent = '⏸';
    state.playing = setInterval(() => {
      if (state.index >= state.scenario.length - 1) return stopPlaying();
      seek(state.index + 1);
    }, 1000 / 60);
  };

  $('timeline').onclick = (e) => {
    stopPlaying();
    const rect = e.target.getBoundingClientRect();
    seek(Math.round(((e.clientX - rect.left) / rect.width) * (state.scenario.length - 1)));
  };

  $('marker-add').onclick = () => {
    const name = $('marker-name').value.trim();
    if (!name || !state.scenario) return;
    state.meta.markers = state.meta.markers ?? {};
    state.meta.markers[name] = state.scenario.frameNumberAt(state.index);
    $('marker-name').value = '';
    saveMeta();
  };

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const step = e.ctrlKey ? 60 : e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { stopPlaying(); seek(state.index - step); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { stopPlaying(); seek(state.index + step); e.preventDefault(); }
    else if (e.key === 'Home') { stopPlaying(); seek(0); e.preventDefault(); }
    else if (e.key === 'End') { stopPlaying(); seek(Infinity); e.preventDefault(); }
    else if (e.key === ' ') { $('btn-play').onclick(); e.preventDefault(); }
  });

  window.addEventListener('resize', () => state.scenario && drawTimeline());

  /* local folder opening (static build, or any time the API is absent) */
  $('btn-open-folder').onclick = async () => {
    try {
      if (window.showDirectoryPicker) {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await useSource(await LocalSource.fromDirectoryHandle(handle));
      } else {
        $('folder-input').click();
      }
    } catch (e) {
      if (e.name !== 'AbortError') $('save-hint').textContent = e.message;
    }
  };

  $('folder-input').onchange = async (e) => {
    if (e.target.files.length)
      await useSource(LocalSource.fromFileList(e.target.files));
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ================= boot ================= */

async function init() {
  bindUi();

  const http = await HttpSource.detect();
  if (http) {
    $('btn-open-folder').style.display = 'none';

    /* shareable links (server mode): ?scenario=&trigger=&frame= */
    const params = new URLSearchParams(location.search);
    await useSource(http, params.get('scenario'));

    const wantedTrigger = params.get('trigger');
    if (wantedTrigger) {
      const achSelect = $('achievement-select');
      const byTitle = [...achSelect.options].find((o) => o.textContent.includes(wantedTrigger));
      $('trigger-input').value = byTitle ? byTitle.value : wantedTrigger;
      if (byTitle) achSelect.value = byTitle.value;
      setTrigger($('trigger-input').value);
    }
    const wantedFrame = Number(params.get('frame'));
    if (Number.isFinite(wantedFrame) && state.scenario)
      seek(wantedFrame - state.scenario.firstFrame);
  } else {
    /* static mode: wait for the user to open a folder */
    $('scenario-desc').textContent = 'open a scenarios folder to begin';
    $('achievement-select').parentElement.style.display = 'none';
  }
}

init().catch((e) => {
  document.body.innerHTML = `<pre style="color:#e06c75;padding:20px">${escapeHtml(e.stack)}</pre>`;
});
