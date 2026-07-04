/**
 * Export all achievements from the cruncheevos sets to
 * scenarios/achievements.json, so the standalone Scenario Viewer
 * (tools/viewer/dist/scenario-viewer.html) can offer the achievement
 * dropdown without a server.
 *
 * Usage: node tools/export-achievements.js
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { achievementToTriggerDefinition } from '../src/harness.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const setsDir = join(root, 'cruncheevos-scripts-main');

const achievements = [];
for (const file of readdirSync(setsDir)) {
  if (!file.endsWith('.js') || ['index.js', 'eslint.config.js'].includes(file)) continue;
  try {
    const set = (await import(pathToFileURL(join(setsDir, file)))).default;
    if (!set?.achievements) continue;
    for (const achievement of Object.values(set.achievements)) {
      achievements.push({
        set: set.title ?? file,
        title: achievement.title,
        definition: achievementToTriggerDefinition(achievement),
      });
    }
  } catch (e) {
    console.warn(`skipping ${file}: ${e.message}`);
  }
}

const out = join(root, 'scenarios', 'achievements.json');
writeFileSync(out, JSON.stringify(achievements, null, 2) + '\n');
console.log(`${out}: ${achievements.length} achievements`);
