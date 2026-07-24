/**
 * Differential test of real achievement definitions (fetched by
 * fetch-corpus.js) against the C rcheevos library.
 *
 * For every unique definition in the corpus:
 *   1. Parse both sides; a definition that parses on one side only is a
 *      finding (real definitions are server-validated, so the C side is
 *      expected to accept everything).
 *   2. Evaluate both sides frame-by-frame over generated RAM sequences and
 *      compare state, measured value and every hit count.
 *
 * Because random bytes almost never satisfy real comparisons, RAM is
 * "directed": the trigger is analyzed for referenced addresses, the
 * constants they are compared against (written back as properly sized/
 * encoded values so conditions actually flip), and AddAddress pointer
 * bases (given values that point inside the RAM window so indirect reads
 * land on real data). A fully random sequence runs as a control.
 *
 * Usage: node corpus-run.js [options]
 *   --corpus DIR   corpus directory (default: tools/difftest/corpus)
 *   --frames N     frames per sequence (default: 48)
 *   --max N        only test the first N unique definitions
 *   --parse-only   skip evaluation, just compare parse outcomes
 *   --ram-limit B  RAM window cap in bytes (default: 1048576)
 *   --seed N       base RNG seed (default: 1)
 * Mismatches are appended to <corpus>/mismatches.jsonl for inspection.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseTrigger } from '../../src/engine/trigger.js';
import { formatFrame, makePeek } from './js-harness.js';
import {
  f32ToBits, memrefSharedSize, MEMREF_PLAIN, MEMREF_MODIFIED, OP_INDIRECT_READ,
  SIZE_8, SIZE_16, SIZE_24, SIZE_32, SIZE_16_BE, SIZE_24_BE, SIZE_32_BE,
  SIZE_LOW, SIZE_HIGH, SIZE_BITCOUNT, SIZE_FLOAT, SIZE_FLOAT_BE,
} from '../../src/engine/memref.js';

const here = dirname(fileURLToPath(import.meta.url));
const C_HARNESS = join(here, 'c-harness');

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
const config = {
  corpusDir: argValue('--corpus', join(here, 'corpus')),
  frames: Number(argValue('--frames', 48)),
  max: Number(argValue('--max', Infinity)),
  parseOnly: args.includes('--parse-only'),
  ramLimit: Number(argValue('--ram-limit', 1024 * 1024)),
  seed: Number(argValue('--seed', 1)),
};

const MAX_TRACKED_REFS = 4096;
const MAX_WRITES_PER_FRAME = 96;

/* ------------------------------------------------------------------ */
/* deterministic RNG                                                  */
/* ------------------------------------------------------------------ */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* trigger analysis: referenced addresses, targets, pointers          */
/* ------------------------------------------------------------------ */

function sharedByteLength(size) {
  switch (memrefSharedSize(size)) {
    case SIZE_8: return 1;
    case SIZE_16: return 2;
    default: return 4;
  }
}

function analyzeTrigger(trigger) {
  const refs = new Map(); /* plain memref -> info */
  for (const memref of trigger.memrefs.memrefs) {
    refs.set(memref, {
      address: memref.address,
      byteLength: sharedByteLength(memref.size),
      sizes: new Set([memref.size]),
      targets: [], /* {size, value, isFloat} */
      pointerOffsets: null, /* non-null marks an AddAddress base */
    });
  }

  const constPool = new Set([0, 1]);

  const addTarget = (info, size, operand) => {
    if (operand?.type === 'const') {
      info.targets.push({ size, value: operand.num >>> 0, isFloat: false });
      info.sizes.add(size);
    } else if (operand?.type === 'fp') {
      info.targets.push({ size, value: operand.dbl, isFloat: true });
      info.sizes.add(size);
    }
  };

  /* leaf plain memrefs beneath an operand (through modified-memref chains) */
  const eachLeaf = (operand, fn, depth = 0) => {
    if (!operand?.memref || depth > 12) return;
    if (operand.memref.kind === MEMREF_PLAIN) {
      fn(operand.memref, operand.size);
    } else if (operand.memref.kind === MEMREF_MODIFIED) {
      eachLeaf(operand.memref.parent, fn, depth + 1);
      eachLeaf(operand.memref.modifier, fn, depth + 1);
    }
  };

  const collectConsts = (operand, depth = 0) => {
    if (!operand || depth > 12) return;
    if (operand.type === 'const') constPool.add(operand.num >>> 0);
    if (operand.memref?.kind === MEMREF_MODIFIED) {
      collectConsts(operand.memref.parent, depth + 1);
      collectConsts(operand.memref.modifier, depth + 1);
    }
  };

  const groups = [trigger.requirement, ...trigger.alternatives].filter(Boolean);
  for (const group of groups) {
    for (const condition of group.conditions) {
      for (const [a, b] of [[condition.operand1, condition.operand2],
                            [condition.operand2, condition.operand1]]) {
        collectConsts(a);
        if (a?.memref?.kind === MEMREF_PLAIN && refs.has(a.memref)) {
          addTarget(refs.get(a.memref), a.size, b);
        } else if (a?.memref?.kind === MEMREF_MODIFIED &&
                   (b?.type === 'const' || b?.type === 'fp')) {
          /* comparison against a combined chain: seed the chain's leaves
           * with the target (zeroing the others makes the sum hit it) */
          eachLeaf(a, (memref, size) => {
            const info = refs.get(memref);
            if (info && info.targets.length < 64) {
              addTarget(info, size, b);
              info.targets.push({ size, value: 0, isFloat: false });
            }
          });
        }
      }
    }
  }

  for (const modified of trigger.memrefs.modifiedMemrefs) {
    collectConsts(modified.parent);
    collectConsts(modified.modifier);
    if (modified.modifierType === OP_INDIRECT_READ) {
      const offset = modified.modifier?.type === 'const' ? (modified.modifier.num >>> 0) : 0;
      eachLeaf(modified.parent, (memref) => {
        const info = refs.get(memref);
        if (info) (info.pointerOffsets ??= []).push(offset);
      });
    }
  }

  const maxAddr = Math.max(0, ...[...refs.values()].map((r) => r.address + r.byteLength));
  const ramSize = Math.min(Math.max(maxAddr + 8, 4096), config.ramLimit);

  let tracked = [...refs.values()].filter((r) => r.address + r.byteLength <= ramSize);
  if (tracked.length > MAX_TRACKED_REFS) tracked = tracked.slice(0, MAX_TRACKED_REFS);

  return { tracked, constPool: [...constPool], ramSize };
}

/* ------------------------------------------------------------------ */
/* sized writes                                                       */
/* ------------------------------------------------------------------ */

/** Encode `value` at `info.address` as `size`, as byte writes into `out`. */
function writeSized(ram, out, address, size, value, isFloat) {
  const bytes = [];
  const current = () => ram[address] ?? 0;
  const u32 = isFloat ? 0 : (value >>> 0);

  switch (size) {
    case SIZE_16: bytes.push(u32 & 0xff, (u32 >>> 8) & 0xff); break;
    case SIZE_24: bytes.push(u32 & 0xff, (u32 >>> 8) & 0xff, (u32 >>> 16) & 0xff); break;
    case SIZE_32: bytes.push(u32 & 0xff, (u32 >>> 8) & 0xff, (u32 >>> 16) & 0xff, (u32 >>> 24) & 0xff); break;
    case SIZE_16_BE: bytes.push((u32 >>> 8) & 0xff, u32 & 0xff); break;
    case SIZE_24_BE: bytes.push((u32 >>> 16) & 0xff, (u32 >>> 8) & 0xff, u32 & 0xff); break;
    case SIZE_32_BE: bytes.push((u32 >>> 24) & 0xff, (u32 >>> 16) & 0xff, (u32 >>> 8) & 0xff, u32 & 0xff); break;
    case SIZE_LOW: bytes.push((current() & 0xf0) | (u32 & 0x0f)); break;
    case SIZE_HIGH: bytes.push((current() & 0x0f) | ((u32 & 0x0f) << 4)); break;
    case SIZE_BITCOUNT: bytes.push((1 << Math.min(u32, 8)) - 1); break;
    case SIZE_FLOAT: {
      const bits = f32ToBits(isFloat ? value : u32);
      bytes.push(bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff);
      break;
    }
    case SIZE_FLOAT_BE: {
      const bits = f32ToBits(isFloat ? value : u32);
      bytes.push((bits >>> 24) & 0xff, (bits >>> 16) & 0xff, (bits >>> 8) & 0xff, bits & 0xff);
      break;
    }
    default:
      if (size.startsWith('bit')) {
        const bit = Number(size.slice(3));
        bytes.push((current() & ~(1 << bit)) | ((u32 & 1) << bit));
      } else {
        bytes.push(u32 & 0xff); /* 8bit and anything unhandled (mbf32, ...) */
      }
      break;
  }

  for (let i = 0; i < bytes.length; i++) {
    ram[address + i] = bytes[i];
    out.push([address + i, bytes[i]]);
  }
}

/* ------------------------------------------------------------------ */
/* frame generation                                                   */
/* ------------------------------------------------------------------ */

function pickValue(rand, info, constPool, directed) {
  if (info.pointerOffsets) {
    /* AddAddress base: usually aim inside the RAM window */
    if (directed ? rand() < 0.8 : rand() < 0.3) {
      const offset = info.pointerOffsets[Math.floor(rand() * info.pointerOffsets.length)];
      const room = info.ramSize - 8 - offset;
      const p = room > 0 ? Math.floor(rand() * room) : 0;
      return { size: [...info.sizes][0], value: p, isFloat: false };
    }
    return { size: [...info.sizes][0], value: Math.floor(rand() * 0x100000000), isFloat: false };
  }

  const roll = rand();
  if (directed && info.targets.length && roll < 0.55) {
    return info.targets[Math.floor(rand() * info.targets.length)];
  }
  const size = [...info.sizes][Math.floor(rand() * info.sizes.size)];
  if (directed && info.targets.length && roll < 0.65) {
    const t = info.targets[Math.floor(rand() * info.targets.length)];
    return { size: t.size, value: t.isFloat ? t.value + 1 : ((t.value + (rand() < 0.5 ? 1 : -1)) >>> 0), isFloat: t.isFloat };
  }
  if (directed && roll < 0.75) {
    return { size, value: constPool[Math.floor(rand() * constPool.length)], isFloat: false };
  }
  return { size, value: Math.floor(rand() * 0x100000000), isFloat: false };
}

function generateFrames(analysis, rand, directed) {
  const { tracked, constPool, ramSize } = analysis;
  for (const info of tracked) info.ramSize = ramSize;

  const ram = new Uint8Array(ramSize);
  const frames = [];

  for (let f = 0; f < config.frames; f++) {
    const writes = [];
    if (tracked.length) {
      const count = f === 0
        ? Math.min(tracked.length, MAX_WRITES_PER_FRAME)
        : 1 + Math.floor(rand() * Math.min(4, tracked.length));
      for (let w = 0; w < count; w++) {
        const info = f === 0 && tracked.length <= MAX_WRITES_PER_FRAME
          ? tracked[w]
          : tracked[Math.floor(rand() * tracked.length)];
        const { size, value, isFloat } = pickValue(rand, info, constPool, directed);
        writeSized(ram, writes, info.address, size, value, isFloat);
      }
    }
    frames.push(writes);
  }

  return { ram: new Uint8Array(ramSize), frames };
}

/* ------------------------------------------------------------------ */
/* run one definition                                                 */
/* ------------------------------------------------------------------ */

function runC(definition, ramSize, frames) {
  const input = [
    definition,
    `${frames.length} ${ramSize} sparse`,
    ...frames.map((writes) =>
      `${writes.length} ${writes.map(([a, v]) => `${a.toString(16)}:${v.toString(16)}`).join(' ')}`),
    '',
  ].join('\n');

  const result = spawnSync(C_HARNESS, [], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0)
    return { error: `c harness exited with ${result.status}: ${result.stderr}` };
  return { lines: result.stdout.trim().split('\n') };
}

function runJs(trigger, ramSize, frames, coverage) {
  const ram = new Uint8Array(ramSize);
  const peek = makePeek(ram);
  const lines = [];
  for (const writes of frames) {
    for (const [address, value] of writes) ram[address] = value;
    const result = trigger.evaluate(peek);
    lines.push(formatFrame(trigger, result));
    if (coverage) {
      if (trigger.hasHits) coverage.hits = true;
      if (result === 'primed' || trigger.state === 'primed') coverage.primed = true;
      if (result === 'triggered') coverage.triggered = true;
      if (result === 'paused') coverage.paused = true;
      if (result === 'reset') coverage.reset = true;
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

const gamesDir = join(config.corpusDir, 'games');
const byDefinition = new Map();
for (const file of readdirSync(gamesDir)) {
  const game = JSON.parse(readFileSync(join(gamesDir, file), 'utf8'));
  for (const achievement of game.achievements ?? []) {
    if (!byDefinition.has(achievement.memAddr)) {
      byDefinition.set(achievement.memAddr, {
        achievementId: achievement.id,
        gameId: game.id,
        gameTitle: game.title,
      });
    }
  }
}

let definitions = [...byDefinition.entries()];
if (Number.isFinite(config.max)) definitions = definitions.slice(0, config.max);
console.log(`${definitions.length} unique definitions from ${config.corpusDir}`);

const mismatches = [];
let parseMismatches = 0;
let evalMismatches = 0;
let parsedOk = 0;
let skipped = 0;
const covered = { hits: 0, primed: 0, triggered: 0, paused: 0, reset: 0 };
const started = Date.now();

for (let index = 0; index < definitions.length; index++) {
  const [definition, source] = definitions[index];

  if (/[\r\n]/.test(definition)) { skipped++; continue; }

  let trigger = null;
  let jsError = null;
  try {
    trigger = parseTrigger(definition);
  } catch (e) {
    jsError = e.code ?? e.message;
  }

  if (!trigger) {
    /* parse-outcome comparison only */
    const c = runC(definition, 16, []);
    const cFailed = c.error || c.lines[0]?.startsWith('PARSE_ERROR');
    if (!cFailed) {
      parseMismatches++;
      mismatches.push({ kind: 'parse', ...source, definition, js: jsError, c: 'OK' });
    }
    continue;
  }

  const analysis = analyzeTrigger(trigger);

  if (config.parseOnly) {
    const c = runC(definition, analysis.ramSize, []);
    if (c.error || c.lines[0]?.startsWith('PARSE_ERROR')) {
      parseMismatches++;
      mismatches.push({ kind: 'parse', ...source, definition, js: 'OK', c: c.error ?? c.lines[0] });
    } else {
      parsedOk++;
    }
    continue;
  }

  let defBad = false;
  const coverage = {};
  for (const directed of [true, false]) {
    const seed = (fnv1a(definition) ^ config.seed ^ (directed ? 0 : 0x5f5f5f5f)) >>> 0;
    const { frames } = generateFrames(analysis, rng(seed), directed);

    const c = runC(definition, analysis.ramSize, frames);
    if (c.error || c.lines[0]?.startsWith('PARSE_ERROR')) {
      parseMismatches++;
      mismatches.push({ kind: 'parse', ...source, definition, js: 'OK', c: c.error ?? c.lines[0] });
      defBad = true;
      break;
    }

    /* re-parse so each sequence starts from pristine trigger state */
    const jsLines = runJs(parseTrigger(definition), analysis.ramSize, frames, coverage);

    for (let f = 0; f < frames.length; f++) {
      if (c.lines[f]?.trim() !== jsLines[f]?.trim()) {
        evalMismatches++;
        mismatches.push({
          kind: 'eval', ...source, definition,
          sequence: directed ? 'directed' : 'random', seed, frame: f,
          c: c.lines[f], js: jsLines[f],
        });
        defBad = true;
        break;
      }
    }
    if (defBad) break;
  }
  if (!defBad) parsedOk++;
  for (const key of Object.keys(covered)) if (coverage[key]) covered[key]++;

  if ((index + 1) % 500 === 0) {
    const rate = (index + 1) / ((Date.now() - started) / 1000);
    console.log(`  ${index + 1}/${definitions.length} ` +
      `(${parseMismatches} parse / ${evalMismatches} eval mismatches, ${rate.toFixed(0)}/s)`);
  }
}

if (mismatches.length) {
  const reportPath = join(config.corpusDir, 'mismatches.jsonl');
  writeFileSync(reportPath, mismatches.map((m) => JSON.stringify(m)).join('\n') + '\n');
  console.log(`mismatch details written to ${reportPath}`);
}

console.log(`\n${definitions.length} definitions: ` +
  `${parseMismatches} parse mismatches, ${evalMismatches} eval mismatches, ` +
  `${parsedOk} clean, ${skipped} skipped`);
if (!config.parseOnly) {
  const pct = (n) => `${((n / Math.max(1, definitions.length)) * 100).toFixed(1)}%`;
  console.log(`coverage: hits ${pct(covered.hits)}, primed ${pct(covered.primed)}, ` +
    `triggered ${pct(covered.triggered)}, paused ${pct(covered.paused)}, reset ${pct(covered.reset)}`);
}
process.exit(mismatches.length ? 1 : 0);
