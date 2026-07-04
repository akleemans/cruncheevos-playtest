/**
 * Scenario Viewer logic. Talks to the API served by viewer/serve.js
 * (started via `npx cruncheevos-playtest viewer`). Scenario ids are
 * repo-relative folder paths, so any consumer layout works.
 */

import { parseRecording, Scenario } from '../src/scenario-format.js';
import { parseTrigger, conditionSpans } from '../src/engine/trigger.js';
import { createPeek } from '../src/engine/harness.js';

const $ = (id) => document.getElementById(id);

const STATE_COLORS = {
  waiting: '#555b6b', active: '#3b6ea5', paused: '#8a5fb0', primed: '#d0a02f',
  reset: '#d0662f', triggered: '#3fa860', inactive: '#3a3f4d',
};

const state = {
  scenario: null,      // Scenario instance
  scenarioId: null,    // repo-relative path
  meta: null,
  screenshots: [],     // sorted frame numbers with a png
  index: 0,            // current frame index
  run: null,           // trigger run snapshots
  playing: null,
};

const api = (endpoint, id, params = {}) => {
  const url = new URL(endpoint, location.origin);
  if (id !== undefined) url.searchParams.set('id', id);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/* ---------------- loading ---------------- */

async function init() {
  bindUi();

  const params = new URLSearchParams(location.search);
  const scenarios = await fetchJson('/api/scenarios');
  const select = $('scenario-select');
  select.innerHTML = scenarios.map((s) =>
    `<option value="${escapeHtml(s.id)}">${escapeHtml(s.id)}</option>`).join('');

  try {
    const achievements = await fetchJson('/api/achievements');
    const achSelect = $('achievement-select');
    for (const a of achievements) {
      const opt = document.createElement('option');
      opt.value = a.definition;
      opt.textContent = `${a.set}: ${a.title}`;
      achSelect.appendChild(opt);
    }
    achSelect.parentElement.style.display = achievements.length ? '' : 'none';
  } catch { /* sets are optional */ }

  if (!scenarios.length) {
    $('scenario-desc').textContent = 'no scenarios found - record one first (see README)';
    return;
  }

  const wantedScenario = params.get('scenario');
  if (wantedScenario && scenarios.some((s) => s.id === wantedScenario))
    select.value = wantedScenario;
  await loadScenario(select.value);

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
}

async function loadScenario(id) {
  const [recordingText, shots, allMeta] = await Promise.all([
    fetch(api('/api/recording', id)).then((r) => r.text()),
    fetchJson(api('/api/screenshots', id)),
    fetchJson('/api/scenarios'),
  ]);

  const meta = allMeta.find((s) => s.id === id) ?? { id };
  const { columns, rows } = parseRecording(recordingText);

  state.scenario = new Scenario({ meta, columns, rows });
  state.scenarioId = id;
  state.meta = meta;
  state.meta.markers = state.meta.markers ?? {};
  state.screenshots = shots;
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

/* ---------------- trigger runs ---------------- */

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

/* ---------------- rendering ---------------- */

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
  for (const frame of state.screenshots) {
    if (frame <= frameNumber) best = frame;
    else break;
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
    shotHost.innerHTML = `<img src="${api('/api/screenshot', state.scenarioId, { frame: shotFrame })}" alt="">
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

/* ---------------- interaction ---------------- */

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
    const { id, ...meta } = state.meta;
    await fetch(api('/api/meta', state.scenarioId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meta),
    });
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
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

init().catch((e) => {
  document.body.innerHTML = `<pre style="color:#e06c75;padding:20px">${escapeHtml(e.stack)}</pre>`;
});
