/**
 * Fetch a corpus of real achievement/leaderboard definitions from
 * RetroAchievements, for differential testing of the JS engine port
 * against the C library.
 *
 * Raw trigger logic (MemAddr) is only served by the Connect API
 * (dorequest.php?r=patch); the Web API v1 only returns an md5 of the logic
 * and the (unofficial) v2 JSON:API does not expose it at all. So this runs
 * in two phases:
 *
 *   1. Web API (needs RA_API_KEY): enumerate all games that have
 *      achievements, via GetConsoleIDs + GetGameList per console.
 *      GetGameList's DateModified tracks achievement modifications, so
 *      sorting by it newest-first prioritizes new and recently revised
 *      sets - those exercise the newest parts of the toolset.
 *   2. Connect API (needs RA_USER + RA_TOKEN): fetch r=patch per game,
 *      which returns every achievement's raw MemAddr, all leaderboard
 *      definitions and the rich presence script in a single request.
 *
 * RA_TOKEN is the Connect ("app") token emulators use, not the Web API
 * key. Get it with: RA_USER=you RA_PASSWORD=... node fetch-corpus.js login
 * (or copy it from an emulator config, e.g. RetroArch's cheevos_token).
 *
 * Usage:
 *   node fetch-corpus.js login             print the Connect token
 *   node fetch-corpus.js [options]         fetch the corpus
 *     --max-games N   only fetch the N most recently modified games (default: all)
 *     --delay MS      base pause between requests (default: 1500, plus jitter)
 *     --out DIR       corpus directory (default: tools/difftest/corpus)
 *     --refresh       re-fetch the cached per-console game lists
 *     --dry-run       phase 1 only: report what phase 2 would fetch
 *
 * The fetch is resumable: games whose stored DateModified still matches
 * the game list are skipped, so re-running only downloads new/changed sets.
 * Requests are strictly sequential with a pause in between - please keep
 * the delay >= 1000ms, this is a slow drip by design.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const WEB_API = 'https://retroachievements.org/API';
const CONNECT_API = 'https://retroachievements.org/dorequest.php';
const USER_AGENT = 'cruncheevos-playtest-corpus/0.1 (+https://github.com/akleemans/cruncheevos-playtest)';

/* ------------------------------------------------------------------ */
/* CLI / config                                                       */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'fetch';

function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const config = {
  maxGames: Number(argValue('--max-games', Infinity)),
  delayMs: Number(argValue('--delay', 1500)),
  outDir: argValue('--out', join(here, 'corpus')),
  refresh: args.includes('--refresh'),
  dryRun: args.includes('--dry-run'),
};

if (config.delayMs < 1000) {
  console.error('Refusing to run with --delay < 1000ms; please be gentle with the RA API.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Polite HTTP: sequential, paced, with backoff                       */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let requestCount = 0;

async function pacedFetchJson(url, label) {
  if (requestCount++ > 0) {
    await sleep(config.delayMs + Math.floor(Math.random() * 500));
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (e) {
      console.error(`  ${label}: network error (${e.message}), attempt ${attempt}/5`);
      await sleep(5000 * attempt);
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      const backoff = Math.max(retryAfter * 1000, 2 ** attempt * 2000);
      console.error(`  ${label}: HTTP ${response.status}, backing off ${Math.round(backoff / 1000)}s (attempt ${attempt}/5)`);
      await sleep(backoff);
      continue;
    }

    if (!response.ok) {
      throw new Error(`${label}: HTTP ${response.status}`);
    }

    return response.json();
  }

  throw new Error(`${label}: giving up after 5 attempts`);
}

/* ------------------------------------------------------------------ */
/* login helper                                                       */
/* ------------------------------------------------------------------ */

async function login() {
  const user = process.env.RA_USER;
  const password = process.env.RA_PASSWORD;
  if (!user || !password) {
    console.error('Set RA_USER and RA_PASSWORD to fetch the Connect token.');
    process.exit(1);
  }

  const url = `${CONNECT_API}?r=login2&u=${encodeURIComponent(user)}&p=${encodeURIComponent(password)}`;
  const data = await pacedFetchJson(url, 'login2');
  if (!data.Success) {
    console.error(`Login failed: ${data.Error ?? 'unknown error'}`);
    process.exit(1);
  }

  console.log('Login OK. Export this for the fetch run (do not commit it):');
  console.log(`  export RA_USER=${data.User}`);
  console.log(`  export RA_TOKEN=${data.Token}`);
}

/* ------------------------------------------------------------------ */
/* Phase 1: enumerate games with achievements (Web API)               */
/* ------------------------------------------------------------------ */

async function enumerateGames(apiKey) {
  const listsDir = join(config.outDir, 'gamelists');
  mkdirSync(listsDir, { recursive: true });

  const consoles = await pacedFetchJson(
    `${WEB_API}/API_GetConsoleIDs.php?a=1&g=1&y=${apiKey}`, 'GetConsoleIDs');
  console.log(`${consoles.length} active game systems`);

  const games = [];
  for (const console_ of consoles) {
    const cacheFile = join(listsDir, `${console_.ID}.json`);
    let list;
    if (!config.refresh && existsSync(cacheFile)) {
      list = JSON.parse(readFileSync(cacheFile, 'utf8'));
    } else {
      list = await pacedFetchJson(
        `${WEB_API}/API_GetGameList.php?i=${console_.ID}&f=1&y=${apiKey}`,
        `GetGameList(${console_.Name})`);
      writeFileSync(cacheFile, JSON.stringify(list));
    }
    console.log(`  ${console_.Name}: ${list.length} games with achievements`);
    for (const game of list) {
      games.push({
        id: game.ID,
        title: game.Title,
        consoleId: game.ConsoleID,
        consoleName: game.ConsoleName,
        numAchievements: game.NumAchievements,
        numLeaderboards: game.NumLeaderboards,
        dateModified: game.DateModified,
      });
    }
  }

  /* newest achievement modifications first */
  games.sort((a, b) => String(b.dateModified ?? '').localeCompare(String(a.dateModified ?? '')));
  return games;
}

/* ------------------------------------------------------------------ */
/* Phase 2: fetch raw definitions per game (Connect API)              */
/* ------------------------------------------------------------------ */

async function fetchPatch(game, user, token) {
  const url = `${CONNECT_API}?r=patch&g=${game.id}` +
    `&u=${encodeURIComponent(user)}&t=${encodeURIComponent(token)}`;
  const data = await pacedFetchJson(url, `patch(${game.id})`);

  if (!data.Success) {
    return { error: data.Error ?? 'unknown error' };
  }

  const patch = data.PatchData;
  return {
    id: game.id,
    title: patch.Title,
    consoleId: patch.ConsoleID,
    dateModified: game.dateModified,
    achievements: (patch.Achievements ?? []).map((a) => ({
      id: a.ID,
      title: a.Title,
      flags: a.Flags,
      type: a.Type,
      memAddr: a.MemAddr,
    })),
    leaderboards: (patch.Leaderboards ?? []).map((l) => ({
      id: l.ID,
      title: l.Title,
      format: l.Format,
      lowerIsBetter: l.LowerIsBetter,
      mem: l.Mem,
    })),
    richPresence: patch.RichPresencePatch ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

if (command === 'login') {
  await login();
  process.exit(0);
}

const apiKey = process.env.RA_API_KEY;
if (!apiKey) {
  console.error('Set RA_API_KEY (Web API key from your RA control panel).');
  process.exit(1);
}

const games = await enumerateGames(apiKey);
console.log(`\n${games.length} games with achievements total`);

const selected = Number.isFinite(config.maxGames) ? games.slice(0, config.maxGames) : games;

const gamesDir = join(config.outDir, 'games');
mkdirSync(gamesDir, { recursive: true });

let toFetch = [];
for (const game of selected) {
  const file = join(gamesDir, `${game.id}.json`);
  if (existsSync(file)) {
    const existing = JSON.parse(readFileSync(file, 'utf8'));
    if (existing.dateModified === game.dateModified) continue; /* up to date */
  }
  toFetch.push(game);
}

const estimateMin = Math.round((toFetch.length * (config.delayMs + 250)) / 60000);
console.log(`${selected.length} games selected (newest modifications first), ` +
  `${selected.length - toFetch.length} already up to date, ${toFetch.length} to fetch`);
console.log(`Estimated time at ${config.delayMs}ms delay: ~${estimateMin} min\n`);

if (config.dryRun) {
  console.log('Dry run - stopping before the Connect API phase.');
  process.exit(0);
}

const user = process.env.RA_USER;
const token = process.env.RA_TOKEN;
if (!user || !token) {
  console.error('Set RA_USER and RA_TOKEN (Connect/app token, see file header) to fetch definitions.');
  process.exit(1);
}

let fetched = 0;
let failed = 0;
let achievementCount = 0;
const failures = [];

for (const game of toFetch) {
  const result = await fetchPatch(game, user, token);

  if (result.error) {
    failed++;
    failures.push({ id: game.id, title: game.title, error: result.error });
    console.error(`  FAIL ${game.id} (${game.title}): ${result.error}`);
    if (failed >= 10 && fetched === 0) {
      console.error('First 10 requests all failed - aborting, please check credentials.');
      break;
    }
    continue;
  }

  writeFileSync(join(gamesDir, `${game.id}.json`), JSON.stringify(result, null, 1));
  fetched++;
  achievementCount += result.achievements.length;

  if (fetched % 25 === 0) {
    console.log(`  ${fetched}/${toFetch.length} games, ${achievementCount} achievements so far`);
  }
}

const manifest = {
  fetchedAt: new Date().toISOString(),
  games: selected.map((g) => ({ ...g, file: `games/${g.id}.json` })),
  failures,
};
writeFileSync(join(config.outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));

console.log(`\nDone: ${fetched} games fetched (${achievementCount} achievements), ` +
  `${failed} failures, corpus in ${config.outDir}`);
