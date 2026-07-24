/**
 * Targeted differential test for rcheevos #528: SubSource chains starting
 * with a constant, plus nearby defined shapes (recall, floats, delta).
 * Runs every definition against both harnesses over random-ish frames.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCase } from './js-harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const C_HARNESS = join(here, 'c-harness');
const RAM_SIZE = 16;
const FRAMES = 30;

const DEFS = [
  /* the fixed shapes from #528 */
  'B:1_0xH0001=10',
  'B:1_B:0xH0000_0xH0001=10',
  /* constant variants */
  'B:0_B:0xH0000_0xH0001=5',
  'B:255_B:0xH0000_0xH0001=200',
  'B:v-5_B:0xH0000_0xH0001=20',
  'B:h7f_B:0xH0000_0xH0001=3',
  'B:100000_B:0xH0000_0x 0002=1',
  /* longer chains and mixed flags */
  'B:1_B:0xH0000_B:0xH0002_0xH0001=10',
  'B:1_B:2_0xH0001=10',
  'B:1_B:2_B:0xH0000_0xH0001=10',
  'B:3_A:0xH0000_0xH0001=12',
  'A:3_B:0xH0000_0xH0001=12',
  'B:1_B:0xH0000_A:0xH0002_0xH0001=10',
  /* delta/prior/bcd/inverted reads after a constant start */
  'B:1_B:d0xH0000_0xH0001=10',
  'B:1_B:p0xH0000_0xH0001=10',
  'B:1_B:b0xH0000_0xH0001=10',
  'B:1_B:~0xH0000_0xH0001=250',
  /* constant start followed by float memory */
  'B:2_B:fF0004_0xH0001=1',
  'B:2_B:fM0004_0xH0001=1',
  /* float memory first (was already defined) */
  'fF0004>f0.5_B:fF0004_B:0xH0000_0xH0001=10',
  'B:fF0004_B:0xH0000_0xH0001=10',
  /* recall in subsource chains: unbound and memref-bound are defined */
  'B:{recall}_B:0xH0000_0xH0001=10',
  'K:0xH0003*2_B:{recall}_B:0xH0000_0xH0001=10',
  'K:d0xH0003_B:{recall}_B:0xH0000_0xH0001=10',
  /* modifying operators on chain members */
  'B:5*2_B:0xH0000_0xH0001=10',
  'B:1_B:0xH0000*3_0xH0001=10',
  'B:1_B:0xH0000/2_0xH0001=10',
  'B:1_B:0xH0000&3_0xH0001=10',
  /* constant-start chain feeding Measured / hit targets / pause / reset */
  'B:1_B:0xH0000_M:0xH0001=10',
  'B:1_B:0xH0000_0xH0001=10(3)',
  'B:1_B:0xH0000_P:0xH0001=10S0xH0002=1',
  'B:1_B:0xH0000_R:0xH0001=10S0xH0002=1(4)',
  /* chain remembered then recalled */
  'B:1_B:0xH0000_K:0xH0001_{recall}=9',
  /* alt groups with their own constant-start chains */
  '0xH0003=1SB:1_B:0xH0000_0xH0001=10SB:2_B:0xH0002_0xH0001=8',
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFrames(rand) {
  const frames = [];
  const ram = new Uint8Array(RAM_SIZE);
  for (let i = 0; i < RAM_SIZE; i++) ram[i] = Math.floor(rand() * 256);
  for (let f = 0; f < FRAMES; f++) {
    const mutations = Math.floor(rand() * 4);
    for (let m = 0; m < mutations; m++) {
      const addr = Math.floor(rand() * RAM_SIZE);
      ram[addr] = rand() < 0.7 ? Math.floor(rand() * 16) : Math.floor(rand() * 256);
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

const ROUNDS = Number(process.argv[2] ?? 50);
let failures = 0;

for (const def of DEFS) {
  for (let round = 0; round < ROUNDS; round++) {
    const rand = rng(1000 + round);
    const frames = randomFrames(rand);

    const c = runC(def, frames);
    if (c.error) { console.log(`C ERROR: ${c.error}\n  def: ${def}`); failures++; break; }

    let js;
    try { js = runCase(def, frames); }
    catch (e) { js = [`JS_THROW ${e.message}`]; }

    if (c.lines[0].startsWith('PARSE_ERROR') || js[0].startsWith('PARSE_ERROR') || js[0].startsWith('JS_THROW')) {
      if (c.lines[0] !== js[0]) {
        console.log(`PARSE MISMATCH def: ${def}\n  c:  ${c.lines[0]}\n  js: ${js[0]}`);
        failures++;
      }
      break;
    }

    let bad = false;
    for (let f = 0; f < frames.length; f++) {
      if (c.lines[f].trim() !== js[f].trim()) {
        console.log(`MISMATCH def: ${def} round ${round} frame ${f}\n  ram: ${Buffer.from(frames[f]).toString('hex')}\n  c:  ${c.lines[f]}\n  js: ${js[f]}`);
        failures++;
        bad = true;
        break;
      }
    }
    if (bad) break;
  }
}

console.log(`${DEFS.length} definitions x ${ROUNDS} rounds: ${failures} failing definitions`);
process.exit(failures ? 1 : 0);
