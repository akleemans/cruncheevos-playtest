/**
 * Cross-reference the memory addresses used by a cruncheevos set's
 * achievements against the recorder's watch files, and report addresses
 * that would NOT be recorded. Run this before recording scenarios.
 *
 * Usage:
 *   node tools/check-watchlist.js [set.js] [watchfile.lua ...]
 * Defaults:
 *   set:       cruncheevos-scripts-main/monster-force.js
 *   watchfile: lua-script/watchlist.lua
 *
 * The watchlist is generated from the code notes (tools/notes-to-watchlist.js),
 * which are the single source of truth - when something is missing, add a
 * code note for it and regenerate the watchlist.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseTrigger } from '../src/trigger.js';
import { achievementToTriggerDefinition } from '../src/harness.js';
import { memrefSharedSize } from '../src/memref.js';

const args = process.argv.slice(2);
const setFile = args[0] ?? 'cruncheevos-scripts-main/monster-force.js';
const watchFiles = args.length > 1 ? args.slice(1)
  : ['lua-script/watchlist.lua'];

/* addresses covered by the watch files (crude but sufficient lua scan) */
const watched = new Set();
for (const file of watchFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/address\s*=\s*0x([0-9a-fA-F]+)/g))
    watched.add(parseInt(match[1], 16));
}

const SIZE_TO_WATCH = { '8bit': 'u8', '16bit': 'u16', '32bit': 'u32' };

const set = (await import(pathToFileURL(setFile))).default;
const needed = new Map(); /* address -> { size, usedBy: Set } */

for (const achievement of Object.values(set.achievements)) {
  const trigger = parseTrigger(achievementToTriggerDefinition(achievement));
  for (const memref of trigger.memrefs.memrefs) {
    const entry = needed.get(memref.address) ??
      { size: SIZE_TO_WATCH[memrefSharedSize(memref.size)] ?? 'u32', usedBy: new Set() };
    entry.usedBy.add(achievement.title);
    needed.set(memref.address, entry);
  }
}

const missing = [...needed.entries()]
  .filter(([address]) => !watched.has(address))
  .sort((a, b) => a[0] - b[0]);

console.log(`${setFile}: achievements read ${needed.size} addresses; ` +
  `${watchFiles.join(' + ')} cover ${watched.size}`);

if (!missing.length) {
  console.log('OK: every address used by the achievements will be recorded');
} else {
  console.log(`\nMISSING - these are read by achievements but not watched:`);
  for (const [address, { size, usedBy }] of missing) {
    const names = [...usedBy];
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? `, +${names.length - 3} more` : '');
    console.log(`  { address = 0x${address.toString(16).padStart(4, '0')}, size = "${size}", label = "" },  -- ${shown}`);
  }
  console.log('\nadd code notes for these, refresh the notes export, then regenerate:');
  console.log('  node tools/notes-to-watchlist.js lua-script/<notes file> > lua-script/watchlist.lua');
  process.exitCode = 1;
}
