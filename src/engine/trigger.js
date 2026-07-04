/**
 * Port of rcheevos' trigger handling (src/rcheevos/trigger.c).
 *
 * A trigger is one core group ("requirement") plus any number of alt groups
 * ("alternatives"). The trigger fires when the core group is true and, if
 * any alt groups exist, at least one alt group is also true.
 *
 * Trigger states (mirrors RC_TRIGGER_STATE_*):
 *   'inactive'  - not being processed
 *   'waiting'   - cannot fire until it has been false for at least one frame
 *   'active'    - may fire
 *   'paused'    - a PauseIf keeps the whole trigger from firing
 *   'reset'     - hit counts were reset this frame (transient return value)
 *   'triggered' - the trigger fired
 *   'primed'    - all non-Trigger conditions are true ("challenge indicator")
 *   'disabled'  - cannot be processed
 */

import { Memrefs, ParseError } from './memref.js';
import { parseCondset, testCondset, resetCondset, newEvalState } from './condset.js';
import { parseCondition, conditionUpdateParseState } from './condition.js';
import { NONE, U32, compare as typedCompare, convert as tvConvert, typedValue } from './typed-value.js';

export const MEASURED_UNKNOWN = 0xffffffff;

export function newParseState() {
  return {
    memrefs: new Memrefs(),
    addsourceParent: null,
    addsourceOper: null,
    indirectParent: null,
    remember: null,
    measuredTarget: 0,
    hasRequiredHits: false,
    measuredAsPercent: false,
    isValue: false,
    ignoreNonParseErrors: false,
  };
}

export class Trigger {
  constructor() {
    /** @type {object|null} the core group */
    this.requirement = null;
    /** @type {object[]} the alt groups */
    this.alternatives = [];
    this.measuredValue = 0;
    this.measuredTarget = 0;
    this.measuredAsPercent = false;
    this.state = 'waiting';
    this.hasHits = false;
    this.memrefs = new Memrefs();
  }

  /** All groups: core (if any) followed by alts. Mirrors trigger_get_cond indexing. */
  get groups() {
    return [this.requirement, ...this.alternatives];
  }

  /** Convenience accessor for tests: hit count of condition `condIndex` in group `groupIndex`. */
  getHitCount(groupIndex, condIndex) {
    const group = this.groups[groupIndex];
    return group?.conditions[condIndex]?.currentHits;
  }

  /** Mirrors rc_reset_trigger. */
  reset() {
    this._resetHitCounts();
    this.state = 'waiting';
    if (this.measuredTarget) this.measuredValue = MEASURED_UNKNOWN;
    this.hasHits = false;
  }

  _resetHitCounts() {
    if (this.requirement) resetCondset(this.requirement);
    for (const condset of this.alternatives) resetCondset(condset);
  }

  /**
   * Mirrors rc_evaluate_trigger: advance one frame.
   * `peek(address, numBytes) -> number` reads little-endian from game memory.
   * Returns the resulting state ('triggered', 'primed', 'active', 'paused',
   * 'reset', 'waiting' or 'inactive').
   */
  evaluate(peek) {
    switch (this.state) {
      case 'triggered':
        /* previously triggered - do nothing, return inactive so the caller
         * doesn't think it triggered again */
        return 'inactive';

      case 'disabled':
        return 'inactive';

      case 'inactive':
        /* not yet active - update the memrefs so deltas are correct when it
         * becomes active */
        this.memrefs.update(peek);
        return 'inactive';

      default:
        break;
    }

    /* update the memory references */
    this.memrefs.update(peek);

    /* process the trigger */
    const evalState = newEvalState(peek);
    let measuredValue = typedValue(NONE, 0);
    let measuredFromHits = false;
    let ret, isPaused, isPrimed;

    if (this.requirement !== null) {
      ret = testCondset(this.requirement, evalState);
      isPaused = evalState.isPaused;
      isPrimed = evalState.isPrimed;

      if (evalState.measuredValue.type !== NONE) {
        measuredValue = { ...evalState.measuredValue };
        measuredFromHits = !!evalState.measuredFromHits;
      }
    } else {
      ret = 1;
      isPaused = 0;
      isPrimed = 1;
    }

    if (this.alternatives.length) {
      let sub = 0;
      let subPaused = 1;
      let subPrimed = 0;

      for (const condset of this.alternatives) {
        sub |= testCondset(condset, evalState);
        subPaused &= evalState.isPaused;
        subPrimed |= evalState.isPrimed;

        if (evalState.measuredValue.type !== NONE) {
          /* keep the largest captured Measured value */
          if (measuredValue.type === NONE ||
              typedCompare(evalState.measuredValue, measuredValue, 'gt')) {
            measuredValue = { ...evalState.measuredValue };
            measuredFromHits = !!evalState.measuredFromHits;
          }
        }
      }

      /* to trigger, the core must be true and at least one alt must be true */
      ret &= sub;
      isPrimed &= subPrimed;

      /* if the core is not paused, all alts must be paused to count as a
       * paused trigger */
      isPaused |= subPaused;
    }

    if (isPaused) {
      /* if the trigger is fully paused, ignore updates to the measured value */
    } else if (measuredValue.type === NONE) {
      /* no measured value captured - keep the old value (a paused alt can
       * hide the measured value without fully pausing the trigger) */
    } else {
      tvConvert(measuredValue, U32);
      this.measuredValue = measuredValue.value;
    }

    /* if any ResetIf condition was true, reset the hit counts */
    if (evalState.wasReset) {
      /* if the measured value came from a hit count, reset it */
      if (measuredFromHits) {
        this.measuredValue = 0;
      } else if (isPaused && this.measuredValue) {
        /* if the measured value is in a paused group, measuredFromHits won't
         * have been set - attempt to determine if it should have been */
        if (this.requirement?.isPaused &&
            condsetIsMeasuredFromHitcount(this.requirement, this.measuredValue)) {
          this.measuredValue = 0;
        } else {
          for (const condset of this.alternatives) {
            if (condset.isPaused && condsetIsMeasuredFromHitcount(condset, this.measuredValue)) {
              this.measuredValue = 0;
              break;
            }
          }
        }
      }

      this._resetHitCounts();

      /* if there were hit counts to clear, return 'reset', but don't change
       * the state */
      if (this.hasHits) {
        this.hasHits = false;

        /* cannot be primed while ResetIf is true */
        if (this.state === 'primed')
          this.state = 'active';

        return 'reset';
      }

      /* any hits that were tallied were just reset */
      evalState.hasHits = 0;
      isPrimed = 0;
    } else if (ret) {
      /* if the state is 'waiting' and the trigger is ready to fire, ignore
       * it and reset the hit counts */
      if (this.state === 'waiting') {
        this.reset();
        this.hasHits = false;
        return 'waiting';
      }

      this.state = 'triggered';
      return 'triggered';
    }

    /* did not trigger this frame */
    this.hasHits = !!evalState.hasHits;

    if (isPaused) this.state = 'paused';
    else if (isPrimed) this.state = 'primed';
    else this.state = 'active';

    /* if an individual condition was reset, notify the caller */
    if (evalState.wasCondReset)
      return 'reset';

    return this.state;
  }

  /**
   * Mirrors rc_test_trigger: forces the trigger active and returns whether
   * it fired this frame (legacy helper, mostly useful in tests).
   */
  test(peek) {
    this.state = 'active';
    return this.evaluate(peek) === 'triggered';
  }
}

/** Mirrors rc_condset_is_measured_from_hitcount. */
function condsetIsMeasuredFromHitcount(condset, measuredValue) {
  for (const condition of condset.conditions) {
    if (condition.type === 'measured' && condition.requiredHits &&
        condition.currentHits === measuredValue) {
      return true;
    }
  }
  return false;
}

/**
 * Mirrors rc_parse_trigger / rc_parse_trigger_internal.
 * Parses a trigger definition like "0xH0001=16S0xH0002=52S0xL0004=6".
 * Throws ParseError on invalid input.
 */
export function parseTrigger(definition) {
  if (typeof definition !== 'string')
    throw new TypeError('trigger definition must be a string');

  const cursor = { s: definition, i: 0 };
  const parse = newParseState();
  const trigger = new Trigger();

  trigger.memrefs = parse.memrefs;

  if (cursor.s[cursor.i] === 's' || cursor.s[cursor.i] === 'S') {
    trigger.requirement = null;
  } else {
    trigger.requirement = parseCondset(cursor, parse);
  }

  while (cursor.s[cursor.i] === 's' || cursor.s[cursor.i] === 'S') {
    cursor.i++;
    trigger.alternatives.push(parseCondset(cursor, parse));
  }

  if (cursor.i !== definition.length)
    throw new ParseError('RC_INVALID_MEMORY_OPERAND', cursor);

  trigger.measuredTarget = parse.measuredTarget;
  trigger.measuredValue = parse.measuredTarget ? MEASURED_UNKNOWN : 0;
  trigger.measuredAsPercent = parse.measuredAsPercent;
  trigger.state = 'waiting';
  trigger.hasHits = false;

  return trigger;
}

/**
 * Source-text spans of every condition in a trigger definition, grouped like
 * Trigger#groups (core first, then alts; empty groups yield []). Lets tools
 * display each parsed condition with its original text. Splitting the string
 * naively on 'S' would break on bit6 operands like "0xS0004", so this walks
 * the definition with the real parser.
 */
export function conditionSpans(definition) {
  const cursor = { s: definition, i: 0 };
  const parse = newParseState();
  parse.ignoreNonParseErrors = true;
  const groups = [];

  const parseGroupSpans = () => {
    const spans = [];
    if (cursor.s[cursor.i] === 'S' || cursor.s[cursor.i] === 's' || cursor.i >= cursor.s.length)
      return spans;

    parse.addsourceOper = null;
    parse.addsourceParent = null;
    parse.indirectParent = null;
    parse.remember = null;

    for (;;) {
      const start = cursor.i;
      const condition = parseCondition(cursor, parse);
      conditionUpdateParseState(condition, parse);
      spans.push({ start, end: cursor.i, text: definition.slice(start, cursor.i) });
      if (cursor.s[cursor.i] !== '_') break;
      cursor.i++;
    }
    return spans;
  };

  groups.push(parseGroupSpans());
  while (cursor.s[cursor.i] === 'S' || cursor.s[cursor.i] === 's') {
    cursor.i++;
    groups.push(parseGroupSpans());
  }

  return groups;
}
