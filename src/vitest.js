/**
 * vitest bindings. Import from 'cruncheevos-playtest/vitest' inside test
 * files (vitest must be installed in the consuming project):
 *
 *   import { describe, expect } from 'vitest';
 *   import { playtest, requireScenario, runAchievement } from 'cruncheevos-playtest/vitest';
 *
 *   const scenario = (name, ...markers) =>
 *     requireScenario(new URL(`../scenarios/${name}`, import.meta.url), ...markers);
 *
 *   describe('My Achievement', () => {
 *     playtest('pops at the boss kill', scenario('boss-kill', 'boss-dead'), (s) => {
 *       expect(runAchievement(cheevo, s).triggeredFrame).toBe(s.marker('boss-dead'));
 *     });
 *   });
 */

import { it } from 'vitest';

export { requireScenario, loadScenario, runAchievement, ScenarioResult } from './testing.js';

/**
 * it() that skips itself with a reason while the scenario is incomplete
 * (not recorded yet, or missing the markers the test needs).
 */
export function playtest(title, req, fn) {
  if (req.missing) {
    it.skip(`${title} — SKIPPED: ${req.missing}`, () => {});
  } else {
    it(title, () => fn(req.scenario));
  }
}
