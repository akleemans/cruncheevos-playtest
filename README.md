# rcheevos-js

A JavaScript port of the [rcheevos](https://github.com/RetroAchievements/rcheevos)
achievement **trigger runtime** (the `src/rcheevos` evaluation engine that
emulators use to decide when an achievement pops), ported from the `develop`
branch.

Purpose: **test RetroAchievements achievement logic offline** — feed the
engine a frame-by-frame memory recording (e.g. captured with a BizHawk Lua
script) and assert that an achievement triggers on exactly the frame you
expect. Works directly with achievements defined via
[@cruncheevos/core](https://github.com/suXinjke/cruncheevos).

New to the trigger model? Read
[docs/how-achievements-work.md](docs/how-achievements-work.md) first.

## What's implemented

- Full trigger parsing of the condition string format (`0xH1234=5_P:...S...`),
  identical to `rc_parse_trigger`
- All condition flags: PauseIf, ResetIf, ResetNextIf, AndNext, OrNext,
  AddSource, SubSource, AddAddress, AddHits, SubHits, Measured (+percent),
  MeasuredIf, Trigger, Remember/Recall
- All operand types and sizes: bit0–7, nibbles, 8/16/24/32-bit LE/BE,
  bitcount, float/double32/MBF32, BCD, inverted, Delta, Prior, constants
- Shared memory references with Delta/Prior tracking, modified-memref chains,
  hit counts, and the full trigger state machine
  (waiting/active/paused/primed/reset/triggered)

Not ported: leaderboards, rich presence, the runtime/http client layers.

### Fidelity

The engine is validated two ways (see `tools/difftest/`):

- a unit test suite ported from rcheevos' own tests (`npm test`)
- a **differential fuzzer** that compiles the real C library and compares
  per-frame state, measured value and every hit count against this port on
  randomly generated triggers. 90,000+ random triggers × 40 frames each ran
  with zero divergence.

One deliberate divergence: upstream has undefined behavior (it reads heap
pointer bits, nondeterministic across runs) when the first of two
consecutive SubSource conditions is a constant, e.g. `B:h30_B:0xHb_...`.
This port implements the clearly intended arithmetic instead. Real
achievement sets are unlikely to hit this.

## Usage

```js
import { parseTrigger, TriggerRunner, runTrigger, bytesFromValues } from 'rcheevos-js';
```

### Run an achievement over a recording

```js
import { runTrigger } from 'rcheevos-js';
import set from './cruncheevos-scripts-main/monster-force.js';

const achievement = Object.values(set.achievements)
  .find(a => a.title === 'Welcome to Monsterland');

// one memory snapshot per frame; several formats accepted (see below)
const frames = [
  { 0x0770: 0x0f, 0x34dd: 0x00 },
  { 0x0770: 0x11, 0x34dd: 0x00, 0x35b8: 2 },
  // ...
];

const { triggeredFrame, states } = runTrigger(achievement, frames);
// triggeredFrame: 0-based frame index the achievement popped on, or null
// states: the trigger state for every frame ('waiting', 'active', 'paused', ...)
```

`runTrigger` accepts a cruncheevos `Achievement` or a raw trigger string.
Like a real emulator, the trigger starts in the `waiting` state: it cannot
pop while its conditions are already true on the very first frame.

### Frame formats

Each frame can be:

- a **plain object / Map of address → byte value** (sparse; unrecorded
  addresses read as 0)
- a **Uint8Array** (full memory dump)
- a **function** `(address, numBytes) => value` (little-endian reads)

If your recording stores multi-byte watch values instead of bytes, expand
them once per frame:

```js
import { bytesFromValues } from 'rcheevos-js';

const frame = bytesFromValues({
  0x0770: 0x0f,                        // 1 byte
  0x35a4: { value: 800, size: 4 },     // 32-bit watch value
});
```

(Compose the whole frame in one `bytesFromValues` call — don't spread an
already-expanded byte map together with a multi-byte entry for the same
address.)

### Step frame-by-frame

```js
import { TriggerRunner } from 'rcheevos-js';

const runner = new TriggerRunner(achievement);
for (const frame of frames) {
  const state = runner.tick(frame);
  console.log(runner.frame, state, runner.measuredValue);
}
console.log('popped on frame', runner.triggeredFrame);
```

### Low-level API

```js
import { parseTrigger } from 'rcheevos-js';

const trigger = parseTrigger('0xH0001=16S0xH0002=52S0xL0004=6');
trigger.state = 'active';                  // skip the waiting state
const state = trigger.evaluate(peek);      // peek(address, numBytes) => value
trigger.getHitCount(groupIndex, condIndex);
trigger.measuredValue; trigger.measuredTarget;
trigger.reset();
```

`evaluate` mirrors `rc_evaluate_trigger`, including the transient `'reset'`
return value and the permanent `'triggered'` state.

## The scenario testing workflow

Three entities:

1. **Achievement** — defined with @cruncheevos/core (`cruncheevos-scripts-main/`),
   executed by this engine.
2. **Test Scenario** — a recorded play session: `scenarios/<name>/` with
   `recording.txt` (watched memory per frame), `meta.json` (description,
   address labels, named **markers**) and `screenshots/`. Recorded in BizHawk
   with `lua-script/record_scenario.lua`.
3. **Scenario tests** — vitest `describe`(achievement) / `it`(scenario +
   expected outcome) blocks in `scenario-tests/`, using markers instead of
   raw frame numbers.

### 1. Record a scenario (BizHawk)

Generate the watchlist (required) from your RA code notes — the
`<gameid>-Notes.json` from RAIntegration's `RACache/Data` folder; sizes are
taken from the `[8-bit]`/`[16-bit]`/`[32-bit]` tags:

```sh
node tools/notes-to-watchlist.js lua-script/5260-Notes.json > lua-script/watchlist.lua
npm run check-watchlist   # verifies the notes cover every address the achievements read
```

Set `CONSOLE` in `lua-script/record_scenario.lua` — **RA code-note addresses
are not BizHawk System Bus addresses**. They follow the RA memory map
(rcheevos `consoleinfo.c`); on GBA, `0x0000-0x7FFF` is IWRAM and
`0x8000-0x47FFF` is EWRAM, and the recorder translates automatically. On
startup it prints the first read of each address — **compare those against
BizHawk's RAM watch before recording**; if they're nonsense (e.g. a "Current
level" of 192), the console/domain setting is wrong.

Adjust the `SCENARIO` block, load the script in BizHawk's Lua Console, play
the scenario, stop the script. `recording.txt` uses a sparse line format:
the first row is a full snapshot, later rows list only the cells that
changed (`9203,0x359c=4380`), and unlisted cells hold their previous value —
which expands back to the exact per-frame sequence required for Delta
operands and hit counting. Every line is flushed immediately, so even a
crashed emulator leaves a valid recording.

### 2. Inspect it in the Scenario Viewer

```sh
npm run viewer          # -> http://localhost:8123
```

Step through frames (←/→, shift=±10, ctrl=±60, space=play) with the nearest
screenshot on top and all watched addresses (with code-note labels, change
highlighting) below. Pick an achievement (loaded from your cruncheevos sets)
or paste any trigger string to get:

- a color-coded **state timeline** (waiting/active/paused/primed/reset/triggered)
- **per-condition** truth dots and live hit counts for every frame
- the Measured progress bar

Set **markers** at interesting frames ("level-end", "cheat-on", …) — they're
saved into the scenario's `meta.json` and become the frame references your
tests use. Shareable links: `?scenario=<name>&trigger=<title>&frame=<n>`.

**Standalone viewer (no server):** `npm run viewer:build` produces
`tools/viewer/dist/scenario-viewer.html` — a single self-contained file you
can open from disk or send to anyone. Use "📁 Open folder" to load a
scenarios folder (Chrome/Edge: full marker editing via the folder picker;
Firefox: read-only). Run `npm run export-achievements` to drop an
`achievements.json` into `scenarios/` so the standalone viewer gets the
achievement dropdown too.

### 3. Write the tests (vitest)

```js
// scenario-tests/welcome-to-monsterland.test.js
import { describe, it, expect } from 'vitest';
import { loadScenario, runAchievement } from '../src/testing.js';
import set from '../cruncheevos-scripts-main/monster-force.js';

const cheevo = Object.values(set.achievements)
  .find(a => a.title === 'Welcome to Monsterland');
const regular = loadScenario('scenarios/cemetery1-regular-finish');
const cheatRun = loadScenario('scenarios/cemetery1-invincibility-cheat');

describe('Welcome to Monsterland', () => {
  it('pops exactly on the level-end screen', () => {
    const result = runAchievement(cheevo, regular);
    expect(result.triggeredFrame).toBe(regular.marker('level-end'));
  });

  it('locks while the invincibility cheat pause is latched', () => {
    const result = runAchievement(cheevo, cheatRun.slice(0, cheatRun.marker('exit-to-menu') - 1));
    expect(result.triggered).toBe(false);
    expect(result.stateAt(cheatRun.marker('cheat-on'))).toBe('paused');
  });
});
```

`ScenarioResult` gives you `triggered`, `triggeredFrame`, `stateAt(frame)`,
`measuredAt(frame)`, `framesInState(state)` (ranges) and `wasEver(state)`;
`Scenario` gives `marker(name)`, `slice(from, to)` and `valueAt(frame, addr)`.
When an `it` fails, open the same scenario + achievement in the viewer and
scrub to the frame in question — the per-condition hit counts show exactly
which condition didn't do what you expected.

Tests for scenarios that aren't recorded yet (or lack the needed markers)
skip with a message saying exactly what's missing.

## Tests

```sh
npm test                 # engine unit + integration tests (node:test)
npm run test:scenarios   # achievement/scenario tests (vitest)
```

Differential testing against the C library (requires gcc and a checkout of
rcheevos):

```sh
cd tools/difftest
gcc -O1 -I$RC/include -I$RC/src -I$RC/src/rcheevos c-harness.c \
  $RC/src/rcheevos/{alloc,condition,condset,memref,operand,trigger,value,format,lboard,richpresence}.c \
  $RC/src/rc_util.c -lm -o c-harness
node fuzz.js 10000 <seed>
```

## Layout

```
src/                the engine (one module per rcheevos C file)
  typed-value.js      rc_typed_value_t arithmetic (u32/i32/f32 semantics)
  memref.js           memory references, sizes, delta/prior, modified memrefs
  operand.js          operand parsing + evaluation
  condition.js        condition parsing, flags, comparators
  condset.js          group classification + per-frame evaluation
  trigger.js          trigger parsing + state machine (+ conditionSpans)
  harness.js          runner/peek helpers (not part of rcheevos)
  scenario-format.js  Test Scenario recording parsing + frame expansion (browser-safe)
  testing.js          loadScenario/runAchievement for vitest (Node-only)
  code-notes.js       RA code notes parser
scenarios/          recorded Test Scenarios
scenario-tests/     vitest achievement/scenario tests
lua-script/         BizHawk recorder (record_scenario.lua) + code notes + watchlist
test/               engine unit + integration tests (node:test)
tools/
  viewer/           Scenario Viewer (npm run viewer)
  difftest/         differential fuzzer against the compiled C library
  notes-to-watchlist.js       code notes -> Lua watchlist
  check-watchlist.js          verify notes cover all achievement addresses
  refresh-scenario-labels.js  refresh meta.json labels from current notes
  export-achievements.js      achievements.json for the standalone viewer
docs/               how achievements work
```
