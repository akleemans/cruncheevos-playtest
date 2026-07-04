/**
 * Differential fuzzer: generates random trigger definitions and random
 * memory sequences, runs both the C rcheevos harness and the JS port, and
 * reports any divergence in per-frame state, measured value or hit counts.
 *
 * Usage: node fuzz.js [iterations] [seed]
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCase } from './js-harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const C_HARNESS = join(here, 'c-harness');

const RAM_SIZE = 16;
const FRAMES = 40;

/* simple deterministic PRNG (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, items) {
  return items[Math.floor(rand() * items.length)];
}

const FLAGS = ['', '', '', '', 'P:', 'R:', 'A:', 'B:', 'C:', 'D:', 'N:', 'O:', 'M:', 'Q:', 'I:', 'T:', 'K:', 'Z:', 'G:'];
const SIZES = ['0xH', '0xH', '0xH', '0x', '0xX', '0xL', '0xU', '0xM', '0xN', '0xT', '0xK', '0xW', '0xI', '0xG', '0xJ', 'fF', 'fM'];
const PREFIXES = ['', '', '', '', 'd', 'p', 'b', '~'];
const CMP_OPS = ['=', '!=', '<', '<=', '>', '>='];
const MOD_OPS = ['*', '/', '&', '^', '%', '+', '-'];

function randomOperand(rand, { allowRecall }) {
  const roll = rand();
  if (roll < 0.55) {
    /* memory operand */
    const prefix = pick(rand, PREFIXES);
    const size = pick(rand, SIZES);
    const addr = Math.floor(rand() * RAM_SIZE).toString(16);
    return `${prefix}${size}${addr}`;
  }
  if (roll < 0.6 && allowRecall) return '{recall}';
  if (roll < 0.7) return `f${(rand() * 20).toFixed(pick(rand, [1, 2]))}`; /* float const */
  if (roll < 0.75) return `v-${Math.floor(rand() * 100)}`; /* negative const */
  if (roll < 0.8) return `h${Math.floor(rand() * 256).toString(16)}`; /* hex const */
  return String(Math.floor(rand() * (rand() < 0.8 ? 100 : 100000))); /* decimal const */
}

function randomCondition(rand, state) {
  const flag = pick(rand, FLAGS);
  /* upstream rcheevos has UB (stale operand type reading pointer bits) when
   * the first of consecutive SubSources is a constant - don't generate it */
  let op1 = randomOperand(rand, state);
  if (flag === 'B:') {
    while (!/^[dpb~]?(0x|f[A-Za-z])/.test(op1)) op1 = randomOperand(rand, state);
  }
  const isCombiningSource = flag === 'A:' || flag === 'B:' || flag === 'I:' || flag === 'K:';

  if (flag === 'K:') state.allowRecall = true;

  let oper, op2 = '', hits = '';
  if (isCombiningSource && rand() < 0.5) {
    /* no operator (implied *1) */
    return `${flag}${op1}`;
  }

  if (isCombiningSource) {
    oper = pick(rand, MOD_OPS);
    op2 = randomOperand(rand, state);
    return `${flag}${op1}${oper}${op2}`;
  }

  oper = pick(rand, CMP_OPS);
  op2 = randomOperand(rand, state);

  if (rand() < 0.35) {
    const target = Math.floor(rand() * 6);
    hits = rand() < 0.8 ? `(${target})` : `.${target}.`; /* legacy syntax */
  }

  return `${flag}${op1}${oper}${op2}${hits}`;
}

function randomTrigger(rand) {
  const state = { allowRecall: false };
  const groupCount = 1 + Math.floor(rand() * 3);
  const groups = [];
  for (let g = 0; g < groupCount; g++) {
    if (g > 0 && rand() < 0.05) {
      groups.push(''); /* empty alt group */
      continue;
    }
    const condCount = 1 + Math.floor(rand() * 5);
    const conds = [];
    for (let c = 0; c < condCount; c++) conds.push(randomCondition(rand, state));
    groups.push(conds.join('_'));
  }
  return groups.join('S');
}

function randomFrames(rand) {
  const frames = [];
  const ram = new Uint8Array(RAM_SIZE);
  for (let i = 0; i < RAM_SIZE; i++) ram[i] = Math.floor(rand() * 256);

  for (let f = 0; f < FRAMES; f++) {
    /* mutate a few bytes each frame; keep values small-ish so comparisons flip */
    const mutations = Math.floor(rand() * 4);
    for (let m = 0; m < mutations; m++) {
      const addr = Math.floor(rand() * RAM_SIZE);
      ram[addr] = rand() < 0.7 ? Math.floor(rand() * 8) : Math.floor(rand() * 256);
    }
    frames.push(Uint8Array.from(ram));
  }
  return frames;
}

function runC(definition, frames) {
  const input = [
    definition,
    `${frames.length} ${RAM_SIZE}`,
    ...frames.map((ram) => Buffer.from(ram).toString('hex')),
    '',
  ].join('\n');

  const result = spawnSync(C_HARNESS, [], { input, encoding: 'utf8' });
  if (result.status !== 0)
    return { error: `c harness exited with ${result.status}: ${result.stderr}` };
  return { lines: result.stdout.trim().split('\n') };
}

const iterations = Number(process.argv[2] ?? 1000);
const baseSeed = Number(process.argv[3] ?? 12345);

let failures = 0;
let parseErrors = 0;

for (let iter = 0; iter < iterations; iter++) {
  const rand = rng(baseSeed + iter);
  const definition = randomTrigger(rand);
  const frames = randomFrames(rand);

  const c = runC(definition, frames);
  if (c.error) {
    console.log(`[${iter}] C HARNESS ERROR: ${c.error}\n  def: ${definition}`);
    failures++;
    continue;
  }

  let js;
  try {
    js = runCase(definition, frames);
  } catch (e) {
    js = [`JS_THROW ${e.message}`];
  }

  const cIsParseError = c.lines[0].startsWith('PARSE_ERROR');
  const jsIsParseError = js[0].startsWith('PARSE_ERROR') || js[0].startsWith('JS_THROW');

  if (cIsParseError || jsIsParseError) {
    if (cIsParseError !== jsIsParseError) {
      console.log(`[${iter}] PARSE MISMATCH\n  def: ${definition}\n  c:  ${c.lines[0]}\n  js: ${js[0]}`);
      failures++;
    } else {
      parseErrors++;
    }
    continue;
  }

  for (let f = 0; f < frames.length; f++) {
    if (c.lines[f].trim() !== js[f].trim()) {
      console.log(`[${iter}] MISMATCH at frame ${f}\n  def: ${definition}\n  ram: ${Buffer.from(frames[f]).toString('hex')}\n  c:  ${c.lines[f]}\n  js: ${js[f]}`);
      failures++;
      break;
    }
  }
}

console.log(`\n${iterations} cases: ${failures} mismatches, ${parseErrors} parse-error cases (matched on both sides)`);
process.exit(failures ? 1 : 0);
