/**
 * Discovery of consumer-repo content: Test Scenario folders and cruncheevos
 * achievement sets. The consumer decides their own layout - everything here
 * scans rather than assumes, so flat repos and per-game folders both work.
 *
 * Auto-scan only imports .js files whose source reads like a cruncheevos set,
 * so the other scripts a repo collects (note converters, formatters) are never
 * executed by the viewer.
 *
 * Optional config, in the consumer's package.json:
 *
 *   "cruncheevosPlaytest": {
 *     "sets": ["monster-force/monster-force.js", ...]   // skip auto-scan
 *   }
 *
 * Node-only.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { achievementToTriggerDefinition } from './engine/harness.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'screenshots']);
const SKIP_SCAN_DIRS = ['scenarios', 'tests', 'test', 'src', 'bin', 'scripts', 'tools', 'docs'];

/** Read the "cruncheevosPlaytest" config key from <root>/package.json. */
export function loadConfig(root = process.cwd()) {
  root = resolve(root);
  let config = {};
  try {
    config = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).cruncheevosPlaytest ?? {};
  } catch { /* no package.json is fine */ }
  return { root, ...config };
}

/**
 * Find all scenario folders (directories containing recording.txt) under
 * root, up to a few levels deep. Returns repo-relative paths, sorted.
 *
 * `scope` (a root-relative folder) restricts the scan to that subtree; ids
 * stay root-relative either way.
 */
export function findScenarioDirs(root, { maxDepth = 4, scope = null } = {}) {
  const found = [];

  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((e) => e.isFile() && e.name === 'recording.txt')) {
      found.push(relative(root, dir));
      return; /* scenario folders don't nest */
    }
    if (depth >= maxDepth) return;

    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.'))
        walk(join(dir, entry.name), depth + 1);
    }
  };

  walk(scope ? resolve(root, scope) : root, 0);
  return found.sort();
}

const SET_FILE_EXCLUDE = /(\.test\.|\.spec\.|\.config\.|^index\.js$|^eslint|^vitest)/;

/*
 * Importing a file runs it, and a consumer repo is full of .js that is not a
 * set: one-off scripts that read process.argv, write files, or call
 * process.exit() on bad usage - the last of which kills the viewer outright,
 * past any try/catch around the import. So candidates are recognised from
 * their source text first, and only files that read like a cruncheevos set
 * are ever imported: they pull in @cruncheevos/core (or name AchievementSet)
 * and they default-export something.
 */
const SET_FILE_MARKERS = [
  /(['"]@cruncheevos\/core['"]|\bAchievementSet\b)/,
  /\bexport\s+(default\b|\{[^}]*\bdefault\b)/,
];

function looksLikeSetFile(file) {
  try {
    const source = readFileSync(file, 'utf8');
    return SET_FILE_MARKERS.every((marker) => marker.test(source));
  } catch {
    return false; /* unreadable: not importable either */
  }
}

/** True when file (absolute) lives inside <root>/<scope>. */
function inScope(root, scope, file) {
  const rel = relative(resolve(root, scope), file);
  return rel !== '' && !rel.startsWith('..');
}

/**
 * Candidate set files: .js in the scan base or one directory deep that read
 * like a cruncheevos set (see looksLikeSetFile). The scan base is
 * <root>/<scope> when scoped, else root.
 *
 * A configured `sets` list is taken as given - the consumer named those files
 * deliberately, so they are neither name-filtered nor sniffed.
 */
function candidateSetFiles(root, config, scope = null) {
  if (Array.isArray(config.sets)) {
    const configured = config.sets.map((p) => join(root, p));
    return scope ? configured.filter((f) => inScope(root, scope, f)) : configured;
  }

  const base = scope ? resolve(root, scope) : root;
  const candidates = [];
  const scanDir = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.js') &&
          !SET_FILE_EXCLUDE.test(entry.name) && looksLikeSetFile(file))
        candidates.push(file);
    }
  };

  scanDir(base);
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.') &&
        !SKIP_SCAN_DIRS.includes(entry.name)) {
      try { scanDir(join(base, entry.name)); } catch { /* unreadable */ }
    }
  }
  return candidates;
}

/**
 * Import cruncheevos sets and flatten their achievements:
 * [{ set, title, definition, file }]. Files that fail to import or don't
 * export a set are skipped silently (auto-scan mode) - the consumer repo
 * legitimately contains non-set .js files, though candidateSetFiles has
 * already kept those from being imported in the first place.
 *
 * `scope` (a root-relative folder) limits the search to that subtree.
 */
export async function discoverAchievements(root, config = {}, { scope = null } = {}) {
  const achievements = [];

  for (const file of candidateSetFiles(root, config, scope)) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    try {
      const module = await import(pathToFileURL(file));
      const set = module.default;
      if (!set?.achievements) continue;
      for (const achievement of Object.values(set.achievements)) {
        achievements.push({
          set: set.title ?? relative(root, file),
          title: achievement.title,
          definition: achievementToTriggerDefinition(achievement),
          file: relative(root, file),
        });
      }
    } catch (e) {
      if (Array.isArray(config.sets)) /* explicitly configured: complain */
        console.warn(`could not load set ${relative(root, file)}: ${e.message}`);
    }
  }

  return achievements;
}
