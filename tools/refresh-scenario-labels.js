/**
 * Refresh the address labels in every scenario's meta.json from the current
 * code notes. Labels are snapshotted by the recorder at recording time, so
 * they go stale when notes are improved - run this after updating notes.
 * Only labels are touched; markers, descriptions and the recording itself
 * stay as they are.
 *
 * Usage: node tools/refresh-scenario-labels.js [notes file]
 *        (default: lua-script/5260-Notes.json)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCodeNotes } from '../src/code-notes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesFile = process.argv[2] ?? join(root, 'lua-script', '5260-Notes.json');

const labelByAddress = new Map(
  parseCodeNotes(readFileSync(notesFile, 'utf8')).map((n) => [n.address, n.label]));

const scenariosDir = join(root, 'scenarios');
for (const name of readdirSync(scenariosDir)) {
  const metaPath = join(scenariosDir, name, 'meta.json');
  if (!existsSync(metaPath)) continue;

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (!Array.isArray(meta.addresses)) continue;

  let updated = 0;
  for (const entry of meta.addresses) {
    const address = parseInt(entry.address, 16);
    const label = labelByAddress.get(address);
    if (label !== undefined && label !== entry.label) {
      entry.label = label;
      updated++;
    }
  }

  if (updated) {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log(`${name}: ${updated} labels refreshed`);
  } else {
    console.log(`${name}: up to date`);
  }
}
