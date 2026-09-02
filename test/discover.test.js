/**
 * Discovery of sets in a consumer repo. The point of these is the filtering:
 * importing a file runs it, and game folders hold one-off scripts next to the
 * set - a script that calls process.exit() on bad usage would take the viewer
 * down with it, past the try/catch around the import.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverAchievements, findScenarioDirs } from '../src/discover.js';

let root;

const write = (rel, source) => {
  const file = join(root, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, source);
};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'playtest-discover-'));

  write('mr-do/mr-do.js', `
    /* stands in for a cruncheevos AchievementSet */
    const set = { title: 'Mr. Do!', achievements: {
      1: { title: 'Beat1', conditions: [['0xH00d0db=1']] },
    } };
    export default set;
  `);

  /* the shape of file that used to kill the viewer */
  write('mr-do/user-notes-to-json.js', `
    export const parseUserNotes = () => [];
    if (process.argv.slice(2).length !== 1) {
      console.error('Name exactly one file');
      process.exit(1);
    }
  `);

  /* default-exports, but has nothing to do with cruncheevos */
  write('mr-do/format.js', 'export default function format() {}');

  write('scripts/align-conditions.js', 'process.exit(1);');
  write('mr-do/scenarios/level-1/recording.txt', 'frame,0x0770:u8\n100,0x0770=1\n101\n');
});

after(() => rmSync(root, { recursive: true, force: true }));

test('auto-scan imports the set and leaves scripts in the same folder alone', async () => {
  const achievements = await discoverAchievements(root, {});

  assert.deepEqual(achievements.map((a) => a.file), [join('mr-do', 'mr-do.js')]);
  assert.equal(achievements[0].title, 'Beat1');
  assert.equal(achievements[0].definition, '0xH00d0db=1');
});

test('scoping to a game folder still finds its set', async () => {
  const achievements = await discoverAchievements(root, {}, { scope: 'mr-do' });
  assert.equal(achievements.length, 1);
});

test('an explicitly configured set is used as given, unsniffed', async () => {
  const achievements = await discoverAchievements(root, { sets: ['mr-do/mr-do.js'] });
  assert.equal(achievements.length, 1);
});

test('scenario folders are found by their recording.txt', () => {
  assert.deepEqual(findScenarioDirs(root), [join('mr-do', 'scenarios', 'level-1')]);
});
