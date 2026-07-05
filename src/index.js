/**
 * cruncheevos-playtest public API: the rcheevos trigger engine port
 * (https://github.com/RetroAchievements/rcheevos, src/rcheevos, develop)
 * plus the Test Scenario format and code-notes tooling.
 *
 * Node-only test helpers live in 'cruncheevos-playtest/testing'; the vitest
 * bindings in 'cruncheevos-playtest/vitest'. See achievement-trigger-model.md (in the repo)
 * for the trigger model itself.
 */

export { parseTrigger, Trigger, MEASURED_UNKNOWN, conditionSpans } from './engine/trigger.js';
export { ParseError } from './engine/memref.js';
export {
  TriggerRunner,
  runTrigger,
  createPeek,
  bytesFromValues,
  achievementToTriggerDefinition,
} from './engine/harness.js';
export { Scenario, parseRecording, serializeRecording } from './scenario-format.js';
export { parseCodeNotes, codeNotesToWatchlist } from './code-notes.js';
/* Node-only scenario loading + test runner: import from 'cruncheevos-playtest/testing' */
