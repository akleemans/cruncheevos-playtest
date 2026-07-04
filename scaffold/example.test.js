/**
 * Scenario tests: one `describe` per achievement, one `it` per recorded
 * Test Scenario with the expected outcome.
 *
 * scenarioIt() skips (with a reason) until the scenario folder exists and
 * has the markers the test needs - record with record_scenario.lua, then
 * set markers in the Scenario Viewer (npx cruncheevos-playtest viewer)
 * while stepping through the frames.
 *
 * Run with vitest. See the cruncheevos-playtest README for the full API.
 */

import { describe, expect } from 'vitest';
import { scenarioIt, requireScenario, runAchievement } from 'cruncheevos-playtest/vitest';
import set from '../my-game.js'; // <- your cruncheevos AchievementSet

const achievement = (title) => {
  const found = Object.values(set.achievements).find((a) => a.title === title);
  if (!found) throw new Error(`achievement "${title}" not found in set`);
  return found;
};

/* scenarios live next to these tests, resolved relative to this file */
const scenario = (name, ...markers) =>
  requireScenario(new URL(`../scenarios/${name}`, import.meta.url), ...markers);

describe('My First Achievement', () => {
  const cheevo = achievement('My First Achievement');

  scenarioIt('pops exactly on the expected frame',
    scenario('my-first-scenario', 'the-moment'),
    (s) => {
      const result = runAchievement(cheevo, s);
      expect(result.triggeredFrame).toBe(s.marker('the-moment'));
    });

  scenarioIt('does not pop when playing with a cheat',
    scenario('my-cheat-scenario'),
    (s) => {
      const result = runAchievement(cheevo, s);
      expect(result.triggered).toBe(false);
      /* more to assert on: result.stateAt(frame), result.framesInState('paused'),
       * result.wasEver('primed'), result.measuredAt(frame), s.slice(from, to) */
    });
});
