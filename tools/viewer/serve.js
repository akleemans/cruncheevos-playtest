/**
 * Dev server for the Scenario Viewer. Zero dependencies.
 *
 *   npm run viewer     (or: node tools/viewer/serve.js [port])
 *   -> http://localhost:8123
 *
 * Serves the repo (so the viewer can import the engine from /src) plus a
 * small API:
 *   GET  /api/scenarios                     list of scenario metas
 *   GET  /api/scenarios/:name/screenshots   available screenshot frames
 *   POST /api/scenarios/:name/meta          save meta.json (marker editing)
 *   GET  /api/achievements                  achievements from the cruncheevos sets
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve, normalize, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] ?? 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function sendJson(res, data) {
  send(res, 200, JSON.stringify(data));
}

function safeName(name) {
  return /^[\w.-]+$/.test(name);
}

async function listScenarios() {
  const dir = join(root, 'scenarios');
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const scenarios = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await stat(join(dir, entry.name, 'recording.txt'));
    } catch {
      continue;
    }
    let meta = { name: entry.name };
    try {
      meta = { name: entry.name, ...JSON.parse(await readFile(join(dir, entry.name, 'meta.json'), 'utf8')) };
    } catch { /* meta is optional */ }
    scenarios.push(meta);
  }
  return scenarios;
}

async function listScreenshots(name) {
  try {
    const files = await readdir(join(root, 'scenarios', name, 'screenshots'));
    return files
      .filter((f) => f.endsWith('.png'))
      .map((f) => Number(f.slice(0, -4)))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function listAchievements() {
  const setsDir = join(root, 'cruncheevos-scripts-main');
  let files = [];
  try {
    files = (await readdir(setsDir)).filter((f) => f.endsWith('.js') &&
      !['index.js', 'eslint.config.js'].includes(f));
  } catch {
    return [];
  }

  const { achievementToTriggerDefinition } = await import(pathToFileURL(join(root, 'src', 'harness.js')));
  const result = [];
  for (const file of files) {
    try {
      const module = await import(pathToFileURL(join(setsDir, file)));
      const set = module.default;
      if (!set?.achievements) continue;
      for (const achievement of Object.values(set.achievements)) {
        result.push({
          set: set.title ?? file,
          title: achievement.title,
          definition: achievementToTriggerDefinition(achievement),
        });
      }
    } catch (e) {
      console.warn(`skipping ${file}: ${e.message}`);
    }
  }
  return result;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = decodeURIComponent(url.pathname);

    if (path === '/api/scenarios' && req.method === 'GET')
      return sendJson(res, await listScenarios());

    let match = path.match(/^\/api\/scenarios\/([^/]+)\/screenshots$/);
    if (match && req.method === 'GET') {
      if (!safeName(match[1])) return send(res, 400, '{"error":"bad name"}');
      return sendJson(res, await listScreenshots(match[1]));
    }

    match = path.match(/^\/api\/scenarios\/([^/]+)\/meta$/);
    if (match && req.method === 'POST') {
      if (!safeName(match[1])) return send(res, 400, '{"error":"bad name"}');
      const body = await readBody(req);
      JSON.parse(body); /* validate before writing */
      await writeFile(join(root, 'scenarios', match[1], 'meta.json'),
        JSON.stringify(JSON.parse(body), null, 2) + '\n');
      return sendJson(res, { ok: true });
    }

    if (path === '/api/achievements' && req.method === 'GET')
      return sendJson(res, await listAchievements());

    /* redirect so relative imports in index.html resolve correctly */
    if (path === '/') {
      res.writeHead(302, { location: '/tools/viewer/index.html' + url.search });
      return res.end();
    }

    /* static files */
    const full = normalize(join(root, path));
    if (!full.startsWith(root)) return send(res, 403, '{"error":"forbidden"}');

    try {
      const data = await readFile(full);
      return send(res, 200, data, MIME[extname(full)] ?? 'application/octet-stream');
    } catch {
      return send(res, 404, '{"error":"not found"}');
    }
  } catch (e) {
    return send(res, 500, JSON.stringify({ error: e.message }));
  }
});

server.listen(port, () => {
  console.log(`Scenario Viewer: http://localhost:${port}`);
});
