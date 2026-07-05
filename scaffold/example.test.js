/**
 * Scenario tests: plain vitest. One `describe` per achievement, one `test`
 * per recorded Test Scenario with the expected outcome.
 *
 * Record scenarios with record-scenario.lua, then set markers in the
 * Scenario Viewer (npx cruncheevos-playtest viewer) while stepping through
 * the frames. A missing scenario or marker fails the test with a message
 * saying exactly what to record or set.
 */

import { describe, test, expect } from 'vitest';
import { loadScenario, runAchievement } from 'cruncheevos-playtest/testing';
import set from '../my-game.js'; // <- your cruncheevos AchievementSet

/* scenarios live next to these tests, resolved relative to this file */
const scenario = (name) => loadScenario(new URL(`../scenarios/${name}`, import.meta.url));

const achievement = (title) => {
  const found = Object.values(set.achievements).find((a) => a.title === title);
  if (!found) throw new Error(`achievement "${title}" not found in set`);
  return found;
};

describe('My First Achievement', () => {
  const cheevo = achievement('My First Achievement');

  test('pops exactly on the expected frame', () => {
    const s = scenario('my-first-scenario');
    expect(runAchievement(cheevo, s).triggeredFrame).toBe(s.marker('the-moment'));
  });

  test('does not pop when playing with a cheat', () => {
    const s = scenario('my-cheat-scenario');
    const result = runAchievement(cheevo, s);
    expect(result.triggered).toBe(false);
    /* more to assert on: result.stateAt(frame), result.framesInState('paused'),
     * result.wasEver('primed'), result.measuredAt(frame), s.slice(from, to) */
  });

  /* to commit a test before its scenario is recorded, skip it conditionally
   * (standard vitest) instead of commenting it out:
   *
   *   import { hasScenario } from 'cruncheevos-playtest/testing';
   *   const dir = new URL('../scenarios/boss-kill', import.meta.url);
   *   test.skipIf(!hasScenario(dir))('pops at the boss kill', () => { ... });
   */
});
