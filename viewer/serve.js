/**
 * Scenario Viewer server. Zero dependencies. Started by the CLI:
 *
 *   npx cruncheevos-playtest viewer   (from your achievement-scripts repo)
 *
 * Viewer assets and the engine are served from the installed package;
 * scenario data and achievement sets come from the consumer repo (`root`),
 * discovered by scanning - any folder layout works (see src/discover.js).
 *
 * API (scenario ids are root-relative folder paths):
 *   GET  /api/scenarios                list of { id, ...meta }
 *   GET  /api/recording?id=            recording.txt content
 *   GET  /api/screenshots?id=          available screenshot frame numbers
 *   GET  /api/screenshot?id=&frame=    one screenshot png
 *   POST /api/meta?id=                 save meta.json (marker editing)
 *   GET  /api/achievements             flattened achievements from all sets
 */

import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findScenarioDirs, discoverAchievements, loadConfig } from '../src/discover.js';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const sendJson = (res, data) => send(res, 200, JSON.stringify(data));

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolvePromise(data));
    req.on('error', reject);
  });
}

export function startViewer({ root = process.cwd(), port = 8123 } = {}) {
  root = resolve(root);
  const config = loadConfig(root);

  /* resolve a scenario id (root-relative path) safely */
  const scenarioDir = (id) => {
    if (!id) return null;
    const full = normalize(resolve(root, id));
    return full.startsWith(root) ? full : null;
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      const path = decodeURIComponent(url.pathname);
      const id = url.searchParams.get('id');

      if (path === '/api/scenarios') {
        const list = [];
        for (const rel of findScenarioDirs(root)) {
          let meta = {};
          try {
            meta = JSON.parse(await readFile(join(root, rel, 'meta.json'), 'utf8'));
          } catch { /* meta is optional */ }
          list.push({ ...meta, id: rel });
        }
        return sendJson(res, list);
      }

      if (path === '/api/recording') {
        const dir = scenarioDir(id);
        if (!dir) return send(res, 400, '{"error":"bad id"}');
        return send(res, 200, await readFile(join(dir, 'recording.txt')), MIME['.txt']);
      }

      if (path === '/api/screenshots') {
        const dir = scenarioDir(id);
        if (!dir) return send(res, 400, '{"error":"bad id"}');
        try {
          const files = await readdir(join(dir, 'screenshots'));
          return sendJson(res, files
            .filter((f) => f.endsWith('.png'))
            .map((f) => Number(f.slice(0, -4)))
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => a - b));
        } catch {
          return sendJson(res, []);
        }
      }

      if (path === '/api/screenshot') {
        const dir = scenarioDir(id);
        const frame = Number(url.searchParams.get('frame'));
        if (!dir || !Number.isFinite(frame)) return send(res, 400, '{"error":"bad request"}');
        try {
          return send(res, 200, await readFile(join(dir, 'screenshots', `${frame}.png`)), MIME['.png']);
        } catch {
          return send(res, 404, '{"error":"not found"}');
        }
      }

      if (path === '/api/meta' && req.method === 'POST') {
        const dir = scenarioDir(id);
        if (!dir) return send(res, 400, '{"error":"bad id"}');
        const meta = JSON.parse(await readBody(req)); /* validate before writing */
        delete meta.id; /* server-side property, not part of the file */
        await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
        return sendJson(res, { ok: true });
      }

      if (path === '/api/achievements')
        return sendJson(res, await discoverAchievements(root, config));

      /* viewer assets + engine, served from the installed package */
      if (path === '/') {
        res.writeHead(302, { location: '/viewer/index.html' + url.search });
        return res.end();
      }
      if (path.startsWith('/viewer/') || path.startsWith('/src/')) {
        const full = normalize(join(packageDir, path));
        if (!full.startsWith(packageDir)) return send(res, 403, '{"error":"forbidden"}');
        try {
          return send(res, 200, await readFile(full), MIME[extname(full)] ?? 'application/octet-stream');
        } catch {
          return send(res, 404, '{"error":"not found"}');
        }
      }

      return send(res, 404, '{"error":"not found"}');
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: e.message }));
    }
  });

  server.listen(port, () => {
    console.log(`Scenario Viewer: http://localhost:${port}  (scenarios from ${root})`);
  });

  return server;
}
