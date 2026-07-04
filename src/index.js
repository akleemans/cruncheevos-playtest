/**
 * rcheevos-js: JavaScript port of the rcheevos achievement trigger runtime
 * (https://github.com/RetroAchievements/rcheevos, src/rcheevos, develop).
 *
 * See docs/how-achievements-work.md for how the pieces fit together.
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
/* Node-only scenario loading + test runner: import from 'rcheevos-js/testing' */
