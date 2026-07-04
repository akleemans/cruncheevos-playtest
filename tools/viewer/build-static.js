/**
 * Build the standalone Scenario Viewer: a single self-contained HTML file
 * that runs from disk (file://) with no server. Scenarios are opened via the
 * folder picker (Chrome/Edge get write access for marker editing; Firefox
 * falls back to a read-only directory input).
 *
 *   npm run viewer:build   ->  tools/viewer/dist/scenario-viewer.html
 *
 * Give that one file to anyone - they only need a scenarios folder. Drop an
 * achievements.json next to the scenario folders (tools/export-achievements.js)
 * to get the achievement dropdown as well.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [join(here, 'viewer.js')],
  bundle: true,
  format: 'esm',
  write: false,
  minify: false,
  legalComments: 'none',
});

/* prevent an early close of the inline script tag */
const js = result.outputFiles[0].text.replaceAll('</script>', '<\\/script>');

const html = readFileSync(join(here, 'index.html'), 'utf8')
  .replace('<script type="module" src="./viewer.js"></script>',
    `<script type="module">\n${js}\n</script>`);

mkdirSync(join(here, 'dist'), { recursive: true });
const out = join(here, 'dist', 'scenario-viewer.html');
writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} kB)`);
