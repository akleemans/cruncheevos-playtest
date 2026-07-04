/**
 * Scenario tests for Monster Force achievements: one `describe` per
 * achievement, one `it` per recorded Test Scenario with the expected
 * outcome.
 *
 * Tests are guarded by requireScenario(): they skip (with a reason) until
 * the scenario folder exists and has the markers the test needs. Record with
 * lua-script/record_scenario.lua, then set markers in the Scenario Viewer
 * (npm run viewer) while stepping through the frames.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { loadScenario, runAchievement } from '../src/testing.js';
import set from '../cruncheevos-scripts-main/monster-force.js';

const achievement = (title) => {
  const found = Object.values(set.achievements).find((a) => a.title === title);
  if (!found) throw new Error(`achievement "${title}" not found in set`);
  return found;
};

/**
 * Load a scenario for testing; returns { scenario, missing } where missing
 * explains why the test cannot run yet (folder or markers absent).
 */
function requireScenario(name, ...markers) {
  const dir = `scenarios/${name}`;
  if (!existsSync(`${dir}/recording.txt`))
    return { scenario: null, missing: `scenario "${name}" not recorded yet` };

  const scenario = loadScenario(dir);
  const absent = markers.filter((m) => scenario.markers[m] === undefined);
  if (absent.length)
    return { scenario, missing: `set marker(s) [${absent.join(', ')}] on "${name}" in the viewer` };

  return { scenario, missing: null };
}

/** it() that skips itself with a reason while the scenario is incomplete. */
function scenarioIt(title, req, fn) {
  if (req.missing) {
    it.skip(`${title} — SKIPPED: ${req.missing}`, () => {});
  } else {
    it(title, () => fn(req.scenario));
  }
}

describe('Welcome to Monsterland', () => {
  const cheevo = achievement('Welcome to Monsterland');

  /* The achievement triggers on the maxLevelUnlocked 0->1 transition at the
   * save screen (gameState 0x13), not on the rank write - rank-0 ("Bronze
   * (skipped)", < 500 atoms) finishes would otherwise be missable. */
  scenarioIt('pops exactly when the next level is unlocked at the save screen (crystal run)',
    requireScenario('cemetery1-finish-ranking-crystal', 'save-screen', 'rank-written'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggeredFrame).toBe(scenario.marker('save-screen'));
      /* deliberately later than the score screen's rank write */
      expect(result.triggeredFrame).toBeGreaterThan(scenario.marker('rank-written'));
    });

  scenarioIt('pops on a rank-0 finish too (the formerly missable case)',
    requireScenario('cemetery1-finish-ranking-0', 'save-screen'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggeredFrame).toBe(scenario.marker('save-screen'));
    });

  scenarioIt('locks (paused) from the moment the invincibility cheat is enabled',
    requireScenario('cemetery1-finish-cheat-invincibility', 'cheat-on'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggered).toBe(false);
      expect(result.stateAt(scenario.marker('cheat-on'))).toBe('paused');
    });

  scenarioIt('stays locked when the cheat is disabled again before the finish',
    requireScenario('cemetery1-finish-cheat-invincibility-inactive', 'cheat-off', 'score-screen'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggered).toBe(false);
      /* the PauseIf hit count keeps the core group locked after the toggle */
      expect(result.stateAt(scenario.marker('cheat-off'))).toBe('paused');
      expect(result.stateAt(scenario.marker('score-screen'))).toBe('paused');
    });

  scenarioIt('does not pop when the level is finished via the skip-level cheat',
    requireScenario('cemetery1-finish-cheat-level-skip', 'skip-used'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggered).toBe(false);
      expect(result.wasEver('paused')).toBe(true);
    });

  /* Mina protection: the core requires character <= 2 (Frank/Drac/Wolfie);
   * this run plays as cheat-unlocked Mina (0x0878 = 3) throughout. */
  scenarioIt('does not pop when playing as cheat-unlocked Mina',
    requireScenario('cemetery1-finish-cheat-mina'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggered).toBe(false);
    });

  /* Save protection: loading an in-game save that already has Cemetery 1
   * beaten bumps maxLevelUnlocked 0->1 during the load sequence (marker
   * 'save-loaded', gameState 0xa) - the same transition the trigger is
   * anchored on. Only the gameState=0x13 condition keeps this from popping;
   * this scenario is the regression test for it. */
  scenarioIt('does not pop when loading a save where the level is already beaten',
    requireScenario('cemetery1-unlocked-save-state-loaded', 'save-loaded'),
    (scenario) => {
      const result = runAchievement(cheevo, scenario);
      expect(result.triggered).toBe(false);
    });
});
