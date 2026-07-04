/**
 * Test-side API: load recorded Test Scenarios from disk and run achievements
 * against them. Designed for vitest/node:test `describe`/`it` blocks:
 *
 *   const scenario = loadScenario('scenarios/cemetery1-regular-finish');
 *   const result = runAchievement(achievement, scenario);
 *   expect(result.triggeredFrame).toBe(scenario.marker('level-end'));
 *
 * Node-only (uses fs); the browser viewer uses src/scenario-format.js
 * directly.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scenario, parseRecording } from './scenario-format.js';
import { TriggerRunner, achievementToTriggerDefinition } from './engine/harness.js';

const asPath = (dir) => (dir instanceof URL || String(dir).startsWith('file:'))
  ? fileURLToPath(dir) : dir;

/**
 * Load a scenario folder (recording.txt + optional meta.json).
 * Accepts a path or a file: URL, so tests can resolve scenarios relative to
 * themselves: loadScenario(new URL('../scenarios/x', import.meta.url)).
 */
export function loadScenario(dir) {
  dir = asPath(dir);
  const recordingPath = join(dir, 'recording.txt');
  if (!existsSync(recordingPath))
    throw new Error(`no recording.txt in ${dir} - is this a scenario folder?`);

  const { columns, rows } = parseRecording(readFileSync(recordingPath, 'utf8'));

  let meta = {};
  const metaPath = join(dir, 'meta.json');
  if (existsSync(metaPath)) meta = JSON.parse(readFileSync(metaPath, 'utf8'));

  return new Scenario({ meta, columns, rows });
}

/**
 * Load a scenario for a test; returns { scenario, missing } where `missing`
 * explains why the test cannot run yet (folder or markers absent). Pair with
 * scenarioIt() from 'cruncheevos-playtest/vitest' so unrecorded scenarios
 * skip with instructions instead of failing.
 */
export function requireScenario(dir, ...markers) {
  dir = asPath(dir);
  const name = dir.split('/').filter(Boolean).pop();
  if (!existsSync(join(dir, 'recording.txt')))
    return { scenario: null, missing: `scenario "${name}" not recorded yet` };

  const scenario = loadScenario(dir);
  const absent = markers.filter((m) => scenario.markers[m] === undefined);
  if (absent.length)
    return { scenario, missing: `set marker(s) [${absent.join(', ')}] on "${name}" in the viewer` };

  return { scenario, missing: null };
}

/**
 * Result of running one achievement over one scenario. Frame arguments and
 * return values are emulator frame numbers (as recorded / as shown in the
 * viewer), not 0-based indices.
 */
export class ScenarioResult {
  constructor(scenario, runner, states, measured) {
    this.scenario = scenario;
    this.definition = runner.definition;
    /** @type {string[]} state returned for every frame */
    this.states = states;
    this._measured = measured;
    this.triggeredIndex = runner.triggeredFrame;
    /** frame number the achievement popped on, or null */
    this.triggeredFrame = runner.triggeredFrame === null
      ? null : scenario.frameNumberAt(runner.triggeredFrame);
    this.triggered = this.triggeredFrame !== null;
    this.measuredTarget = runner.measuredTarget;
  }

  /** Trigger state at a frame ('active', 'paused', 'primed', 'reset', ...). */
  stateAt(frameNumber) {
    return this.states[this.scenario.indexOfFrame(frameNumber)];
  }

  /** Measured progress value at a frame. */
  measuredAt(frameNumber) {
    return this._measured[this.scenario.indexOfFrame(frameNumber)];
  }

  /**
   * Contiguous frame ranges in which the given state was reported:
   * [{ from, to }] in emulator frame numbers, inclusive.
   */
  framesInState(state) {
    const ranges = [];
    let start = null;
    for (let i = 0; i <= this.states.length; i++) {
      const match = i < this.states.length && this.states[i] === state;
      if (match && start === null) start = i;
      else if (!match && start !== null) {
        ranges.push({
          from: this.scenario.frameNumberAt(start),
          to: this.scenario.frameNumberAt(i - 1),
        });
        start = null;
      }
    }
    return ranges;
  }

  /** True if the given state was ever reported. */
  wasEver(state) {
    return this.states.includes(state);
  }
}

/**
 * Run an achievement (cruncheevos Achievement or raw trigger string) over a
 * full scenario. The trigger starts in the 'waiting' state, exactly like a
 * freshly activated achievement in an emulator. All frames are evaluated,
 * even after the trigger fires (later states report 'inactive').
 */
export function runAchievement(achievement, scenario) {
  const runner = new TriggerRunner(achievementToTriggerDefinition(achievement));
  const states = new Array(scenario.length);
  const measured = new Array(scenario.length);

  const frames = scenario.frames;
  for (let i = 0; i < frames.length; i++) {
    states[i] = runner.tick(frames[i]);
    measured[i] = runner.measuredValue;
  }

  return new ScenarioResult(scenario, runner, states, measured);
}
