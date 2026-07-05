#!/usr/bin/env node

/**
 * cruncheevos-playtest CLI. Run from your achievement-scripts repo:
 *
 *   cruncheevos-playtest init <gameDir>       scaffold a game folder
 *   cruncheevos-playtest viewer [--port N]    Scenario Viewer for this repo
 *   cruncheevos-playtest sync <gameDir> [--check]
 *       regenerate <gameDir>/watchlist.lua from the code notes, verify it
 *       covers every address the game's achievements read, and refresh the
 *       labels stored in existing scenarios (--check: verify only)
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));

const HELP = `cruncheevos-playtest - playtest RetroAchievements achievements

Usage:
  cruncheevos-playtest init <gameDir>        scaffold a game folder (recorder,
                                             config, scenarios/, tests/)
  cruncheevos-playtest viewer [--port N]     open the Scenario Viewer for the
                                             current repo (default port 8123)
  cruncheevos-playtest sync <gameDir>        sync everything derived from the
                                             game's code notes: regenerate
                                             watchlist.lua, verify it covers all
                                             achievement addresses, refresh the
                                             labels stored in scenarios
      --check                                verify coverage only, write nothing

Docs: the package README, and achievement-trigger-model.md in the repo.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/* ------------------------------------------------------------------ */

async function init() {
  const gameDir = positional[0];
  if (!gameDir) fail('usage: cruncheevos-playtest init <gameDir>');

  mkdirSync(join(gameDir, 'scenarios'), { recursive: true });
  mkdirSync(join(gameDir, 'tests'), { recursive: true });

  const scaffold = [
    [join(packageDir, 'lua', 'record-scenario.lua'), join(gameDir, 'record-scenario.lua')],
    [join(packageDir, 'scaffold', 'recorder-config.lua'), join(gameDir, 'recorder-config.lua')],
    [join(packageDir, 'scaffold', 'example.test.js'), join(gameDir, 'tests', 'example.test.js')],
  ];

  for (const [from, to] of scaffold) {
    if (existsSync(to)) {
      console.log(`  kept     ${to} (already exists)`);
    } else {
      copyFileSync(from, to);
      console.log(`  created  ${to}`);
    }
  }

  console.log(`
Next steps:
  1. put your achievement set (.js) and code notes export
     (<gameid>-Notes.json, from RAIntegration's RACache/Data) into ${gameDir}/
  2. edit ${gameDir}/recorder-config.lua (game name, console)
  3. cruncheevos-playtest sync ${gameDir}
  4. record: load ${gameDir}/record-scenario.lua in BizHawk's Lua Console
  5. cruncheevos-playtest viewer  ->  set markers on your recordings
  6. write tests in ${gameDir}/tests/ (see example.test.js), run with vitest
`);
}

/* ------------------------------------------------------------------ */

async function viewer() {
  const portFlag = args.find((a) => a.startsWith('--port'));
  const port = portFlag ? Number(portFlag.split('=')[1] ?? positional[0]) : 8123;
  const { startViewer } = await import(pathToFileURL(join(packageDir, 'viewer', 'serve.js')));
  startViewer({ root: process.cwd(), port: Number.isFinite(port) ? port : 8123 });
}

/* ------------------------------------------------------------------ */

async function sync() {
  const gameDir = positional[0];
  if (!gameDir) fail('usage: cruncheevos-playtest sync <gameDir> [--check]');
  if (!existsSync(gameDir)) fail(`no such directory: ${gameDir}`);

  const { findNotesFile, watchlistLua, findUncoveredAddresses, refreshScenarioLabels,
          parseCodeNotes, codeNotesToWatchlist } = await import(pathToFileURL(join(packageDir, 'src', 'watchlist.js')));

  /* 1. notes -> watchlist */
  const notesFile = findNotesFile(gameDir);
  if (!notesFile) {
    fail(`no code notes found in ${gameDir} - expected notes.json or <gameid>-Notes.json\n` +
         `(RAIntegration caches it in RACache/Data after loading the game)`);
  }
  const notes = parseCodeNotes(readFileSync(notesFile, 'utf8'));
  const entries = codeNotesToWatchlist(notes).map((entry, i) => ({ ...entry, label: notes[i].label }));

  const watchlistPath = join(gameDir, 'watchlist.lua');
  if (!flags.has('--check')) {
    writeFileSync(watchlistPath, watchlistLua(entries, basename(notesFile)));
    console.log(`${watchlistPath}: ${entries.length} addresses (from ${basename(notesFile)})`);
  }

  /* 2. coverage check against the game's achievement set */
  const setFile = readdirSync(gameDir).find((f) => f.endsWith('.js') &&
    !/(\.test\.|\.config\.|^eslint|^vitest)/.test(f) && f !== 'record-scenario.lua');
  if (!setFile) {
    console.log('no achievement set (.js) in the game folder - skipping the coverage check');
  } else {
    const setModule = (await import(pathToFileURL(resolve(gameDir, setFile)))).default;
    if (!setModule?.achievements) fail(`${setFile} does not export a cruncheevos AchievementSet`);

    const watched = new Set(entries.map((e) => e.address));
    const missing = findUncoveredAddresses(setModule, watched);
    if (missing.length) {
      console.error(`\nMISSING - read by achievements but not covered by the code notes:`);
      for (const { address, size, usedBy } of missing) {
        const shown = usedBy.slice(0, 3).join(', ') + (usedBy.length > 3 ? `, +${usedBy.length - 3} more` : '');
        console.error(`  0x${address.toString(16).padStart(4, '0')} (${size})  -- ${shown}`);
      }
      console.error('\nadd code notes for these, refresh the notes export, then rerun this command');
      process.exit(1);
    }
    console.log(`coverage OK: every address used by ${setFile} will be recorded`);
  }

  /* 3. refresh labels stored in existing scenarios */
  if (!flags.has('--check')) {
    for (const { dir, updated } of refreshScenarioLabels(resolve(gameDir), notes)) {
      if (updated) console.log(`${dir}: ${updated} labels refreshed`);
    }
  }
}

/* ------------------------------------------------------------------ */

switch (command) {
  case 'init': await init(); break;
  case 'viewer': await viewer(); break;
  case 'sync': await sync(); break;
  default:
    console.log(HELP);
    process.exit(command === undefined || command === 'help' ? 0 : 1);
}
