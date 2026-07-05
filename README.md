# cruncheevos-playtest

Playtest [RetroAchievements](https://retroachievements.org) achievements
before anyone plays them: record emulator memory as **Test Scenarios**,
replay them against your [cruncheevos](https://github.com/suXinjke/cruncheevos)
achievement logic in ordinary vitest tests, and step through every frame in
a visual inspector when something doesn't pop where it should.

<!-- TODO(akleemans): hero screenshot of the Scenario Viewer - e.g. the crystal-run
     recording with the achievement loaded at the pop frame (TRIGGERED badge, green
     condition dots, state timeline). Sells the tool better than any paragraph.
     For the image to show on npmjs.com too, commit it to the repo (e.g. assets/)
     and use an absolute URL:
     https://raw.githubusercontent.com/akleemans/cruncheevos-playtest/main/assets/viewer.png -->

```js
describe('Welcome to Monsterland', () => {
  playtest('pops exactly when the next level is unlocked at the save screen',
    scenario('cemetery1-finish-ranking-crystal', 'save-screen'),
    (s) => {
      expect(runAchievement(cheevo, s).triggeredFrame).toBe(s.marker('save-screen'));
    });

  playtest('does not pop when the level is finished via the skip-level cheat',
    scenario('cemetery1-finish-cheat-level-skip'),
    (s) => {
      expect(runAchievement(cheevo, s).triggered).toBe(false);
    });
});
```

Under the hood is a faithful JavaScript port of the
[rcheevos](https://github.com/RetroAchievements/rcheevos) trigger runtime —
the same evaluation engine emulators use — so your achievements behave in
tests exactly as they will on players' machines (see [Fidelity](#fidelity)).

## Getting started

In your cruncheevos achievement-scripts repo:

```sh
npm install --save-dev cruncheevos-playtest vitest
npx cruncheevos-playtest init my-game
```

This scaffolds a game folder — the recommended (not required) layout:

```
my-game/
├── my-game.js             your cruncheevos AchievementSet
├── <gameid>-Notes.json    code notes export (RAIntegration: RACache/Data)
├── recorder-config.lua    per-session recorder settings (name, console, ...)
├── record-scenario.lua    BizHawk recorder (don't edit; updated by init)
├── watchlist.lua          generated - what the recorder captures
├── scenarios/             recordings land here
└── tests/                 vitest scenario tests
```

Adding another game = adding another folder. All tooling discovers content
by scanning, so other layouts work too.

### 1. Sync from your code notes

```sh
npx cruncheevos-playtest sync my-game
```

Code notes are the single source of truth for what gets recorded; `sync`
makes everything derived from them current: it reads the game's notes (sizes
from the `[8-bit]`/`[16-bit]`/`[32-bit]` tags), writes `watchlist.lua`,
**verifies it covers every address your achievements actually read** (fails
loudly if notes are missing — add notes, re-export, rerun), and refreshes
the labels stored in existing scenarios. Rerun it whenever your notes
change; `--check` verifies without writing (handy in CI).

### 2. Record a Test Scenario (BizHawk)

<!-- TODO(akleemans): screenshot of BizHawk with the Lua Console running
     record-scenario.lua (the first-reads sanity output visible) -->

Edit `recorder-config.lua` (scenario `name`, `console`), load
`record-scenario.lua` in BizHawk's Lua Console, play, stop the script.

Two things worth knowing:

- **RA addresses are not System Bus addresses.** They follow the RA memory
  map; on GBA, `0x0000-0x7FFF` is IWRAM and `0x8000+` is EWRAM. The recorder
  translates automatically based on `console`, and prints its first reads on
  start — sanity-check them against the RAM watch before playing.
- Recordings are sparse and cheap (~10 kB/minute): a row is written only
  when a watched value changes, and held values expand back to the exact
  per-frame sequence — which Delta operands and hit counting require.
  Record generously: play past the interesting moment, capture menus,
  save screens, cheats being toggled. Scenarios are reusable evidence, and
  today's irrelevant address is tomorrow's regression test.

### 3. Set markers in the Scenario Viewer

```sh
npx cruncheevos-playtest viewer     # -> http://localhost:8123
```

<!-- TODO(akleemans): viewer screenshot (or crop of the hero shot): frame stepper,
     memory table with labels, per-condition panel -->

Step through frames (←/→, shift=±10, ctrl=±60, space=play) with screenshots,
all watched addresses (labels from your code notes, change highlighting),
and — after picking an achievement — a color-coded state timeline plus
**per-condition truth dots and hit counts for every frame**. When a test
fails, this is where you find out which condition didn't do what you
expected, on exactly the frame it didn't do it.

Name the important frames with **markers** ("save-screen", "boss-dead", …).
They're stored in the scenario's `meta.json` and become the frame references
your tests use — no magic numbers.

### 4. Write tests

```js
// my-game/tests/progression.test.js
import { describe, expect } from 'vitest';
import { playtest, requireScenario, runAchievement } from 'cruncheevos-playtest/vitest';
import set from '../my-game.js';

const scenario = (name, ...markers) =>
  requireScenario(new URL(`../scenarios/${name}`, import.meta.url), ...markers);
```

`playtest` is vitest's `it` with a guard: it skips (with instructions) until the scenario is recorded and
has the markers the test needs — write the tests first if you like.
Like a real emulator, triggers start in the `waiting` state and cannot pop
on a recording's first frame.

`runAchievement(achievementOrTriggerString, scenario)` returns a result with
`triggered`, `triggeredFrame`, `stateAt(frame)`, `measuredAt(frame)`,
`framesInState(state)` and `wasEver(state)`; scenarios offer `marker(name)`,
`slice(fromFrame, toFrame)` and `valueAt(frame, address)`.

## JS API

```js
import { parseTrigger, runTrigger, TriggerRunner, Scenario,
         parseRecording, bytesFromValues } from 'cruncheevos-playtest';
import { loadScenario, runAchievement, requireScenario } from 'cruncheevos-playtest/testing';
```

The low-level engine works without scenarios or cruncheevos — feed
`parseTrigger('0xH0001=16S...')` any trigger string and drive it with a
`peek(address, numBytes)` function or per-frame byte maps. See
[how-achievements-work.md](how-achievements-work.md) for the
trigger model itself (groups, flags, hit counts, Delta/Prior).

## Fidelity

The bundled engine is a line-faithful port of rcheevos' `src/rcheevos`
evaluation core (develop branch): all condition flags, operand types and
sizes, shared memrefs with Delta/Prior, hit counts, and the full trigger
state machine. It is validated two ways (maintainer tooling, in this repo):

- a unit suite ported from rcheevos' own tests (`npm test`)
- a **differential fuzzer** (`tools/difftest/`) comparing per-frame state,
  measured value and every hit count against the compiled C library on
  randomly generated triggers — 100,000+ triggers × 40 frames with zero
  divergence

One deliberate divergence: upstream reads uninitialized memory (a stale
union member) when the first of two consecutive SubSource conditions is a
constant; this port implements the clearly intended arithmetic instead.

Not ported: leaderboards, rich presence, the runtime/http client layers.

## Package layout

```
src/engine/       the rcheevos port (browser-safe, dependency-free)
src/              scenario format, discovery, watchlist, test helpers
bin/cli.js        init | viewer | sync
lua/              BizHawk recorder template
scaffold/         files copied into game folders by `init`
viewer/           Scenario Viewer (assets + server)
test/             engine + format tests        (repo only, not published)
tools/difftest/   fuzzer vs the C library      (repo only, not published)
```

## License

MIT
