/**
 * Port of rcheevos' condition set handling (src/rcheevos/condset.c).
 *
 * A condition set (group) is evaluated in classification order, not in
 * definition order: Pause conditions first (a true PauseIf stops the whole
 * group), then Reset conditions, then conditions with hit targets, then
 * Measured conditions, then everything else. Combining conditions
 * (AndNext/OrNext/AddHits/SubHits/ResetNextIf/Remember) travel with the
 * condition they modify. AddSource/SubSource/AddAddress conditions were
 * compiled into modified memrefs at parse time and are not evaluated here.
 */

import { parseCondition, conditionUpdateParseState, testCondition } from './condition.js';
import { evaluateOperand, operatorIsModifying, operandTypeIsMemref } from './operand.js';
import { ParseError, MEMREF_MODIFIED } from './memref.js';
import { U32, NONE, typedValue } from './typed-value.js';

const CLASS_COMBINING = 'combining';
const CLASS_PAUSE = 'pause';
const CLASS_RESET = 'reset';
const CLASS_HITTARGET = 'hittarget';
const CLASS_MEASURED = 'measured';
const CLASS_OTHER = 'other';
const CLASS_INDIRECT = 'indirect';

/** Mirrors rc_classify_condition. */
function classifyCondition(condition) {
  switch (condition.type) {
    case 'pauseif':
      return CLASS_PAUSE;
    case 'resetif':
      return CLASS_RESET;
    case 'addaddress':
    case 'addsource':
    case 'subsource':
      /* handled by modified memrefs */
      return CLASS_INDIRECT;
    case 'addhits':
    case 'andnext':
    case 'ornext':
    case 'remember':
    case 'resetnextif':
    case 'subhits':
      return CLASS_COMBINING;
    case 'measured':
    case 'measuredif':
      /* even without a hit target, must be evaluated every frame */
      return CLASS_MEASURED;
    default:
      return condition.requiredHits !== 0 ? CLASS_HITTARGET : CLASS_OTHER;
  }
}

/**
 * Mirrors rc_condition_update_recall_operand: re-bind unresolved {recall}
 * operands (including those inside modified memref trees) to the remember
 * operand from the pause block.
 */
function updateRecallOperand(operand, remember) {
  if (operand.type === 'recall') {
    if (operandTypeIsMemref(operand.memrefAccessType) && operand.memref == null) {
      Object.assign(operand, remember);
      operand.memrefAccessType = operand.type;
      operand.type = 'recall';
    }
  } else if (operandTypeIsMemref(operand.type) && operand.memref?.kind === MEMREF_MODIFIED) {
    updateRecallOperand(operand.memref.parent, remember);
    updateRecallOperand(operand.memref.modifier, remember);
  }
}

/**
 * Mirrors rc_update_condition_pause_remember: because Pause conditions are
 * evaluated before everything else, {recall} bindings that cross the
 * pause/non-pause boundary have to be fixed up after parsing.
 */
function updateConditionPauseRemember(self) {
  let pauseRemember = null;

  for (const condition of self.pauseConditions) {
    if (condition.type === 'remember') {
      pauseRemember = condition.operand1;
    } else if (pauseRemember === null) {
      /* if we picked up a non-pause remember, discard it */
      for (const operand of [condition.operand1, condition.operand2]) {
        if (operand.type === 'recall' && operandTypeIsMemref(operand.memrefAccessType))
          operand.memref = null;
      }
    }
  }

  if (pauseRemember) {
    const pauseSet = new Set(self.pauseConditions);
    for (const condition of self.conditions) {
      if (!pauseSet.has(condition)) {
        /* a non-pause condition without its own remember uses the last pause remember */
        updateRecallOperand(condition.operand1, pauseRemember);
        updateRecallOperand(condition.operand2, pauseRemember);
      }

      /* anything after this point will have already been handled */
      if (condition.type === 'remember')
        break;
    }
  }
}

/** Mirrors rc_parse_condset. Returns a condset, advances cursor. */
export function parseCondset(cursor, parse) {
  const self = {
    conditions: [],
    pauseConditions: [],
    resetConditions: [],
    hittargetConditions: [],
    measuredConditions: [],
    otherConditions: [],
    indirectConditions: [],
    hasPause: false,
    isPaused: false,
  };

  const s = cursor.s;
  if (s[cursor.i] === 'S' || s[cursor.i] === 's' || cursor.i >= s.length) {
    /* empty group - editor allows it, so we have to support it */
    return self;
  }

  /* prevent bleedthrough of incomplete chains from other groups */
  parse.addsourceOper = null;
  parse.addsourceParent = null;
  parse.indirectParent = null;

  /* each condition set has a functionally new recall accumulator */
  parse.remember = null;

  let measuredTarget = 0;

  for (;;) {
    const condition = parseCondition(cursor, parse);

    if (condition.oper === 'none' && !parse.ignoreNonParseErrors) {
      switch (condition.type) {
        case 'addaddress':
        case 'addsource':
        case 'subsource':
        case 'remember':
          /* these conditions don't require a right hand side (implied *1) */
          break;

        case 'measured':
          /* right hand side is not required when Measured is used in a value */
          if (parse.isValue) break;
          /* fallthrough */
        default:
          throw new ParseError('RC_INVALID_OPERATOR', cursor);
      }
    }

    switch (condition.type) {
      case 'measured':
        if (measuredTarget !== 0) {
          /* multiple Measured flags cannot exist in the same group */
          if (!parse.ignoreNonParseErrors)
            throw new ParseError('RC_MULTIPLE_MEASURED', cursor);
        } else if (parse.isValue) {
          measuredTarget = 0xffffffff;
          if (!operatorIsModifying(condition.oper)) {
            /* measuring a comparison in a value tallies a hit count */
            condition.requiredHits = measuredTarget;
          }
        } else if (condition.requiredHits !== 0) {
          measuredTarget = condition.requiredHits;
        } else if (condition.operand2.type === 'const') {
          measuredTarget = condition.operand2.num;
        } else if (condition.operand2.type === 'fp') {
          measuredTarget = Math.trunc(condition.operand2.dbl) >>> 0;
        } else if (!parse.ignoreNonParseErrors) {
          throw new ParseError('RC_INVALID_MEASURED_TARGET', cursor);
        }

        if (parse.measuredTarget && measuredTarget !== parse.measuredTarget) {
          /* multiple Measured flags in separate groups must have the same target */
          if (!parse.ignoreNonParseErrors)
            throw new ParseError('RC_MULTIPLE_MEASURED', cursor);
        }

        parse.measuredTarget = measuredTarget;
        break;

      case 'standard':
      case 'trigger':
        /* these flags are not allowed in value expressions */
        if (parse.isValue && !parse.ignoreNonParseErrors)
          throw new ParseError('RC_INVALID_VALUE_FLAG', cursor);
        break;

      default:
        break;
    }

    conditionUpdateParseState(condition, parse);
    self.conditions.push(condition);

    if (s[cursor.i] !== '_') break;
    cursor.i++;
  }

  /* distribute conditions into classification blocks; combining conditions
   * travel with the next non-combining, non-indirect condition */
  const blocks = {
    [CLASS_PAUSE]: self.pauseConditions,
    [CLASS_RESET]: self.resetConditions,
    [CLASS_HITTARGET]: self.hittargetConditions,
    [CLASS_MEASURED]: self.measuredConditions,
    [CLASS_OTHER]: self.otherConditions,
  };
  let pending = [];

  for (const condition of self.conditions) {
    const classification = classifyCondition(condition);
    if (classification === CLASS_INDIRECT) {
      self.indirectConditions.push(condition);
    } else if (classification === CLASS_COMBINING) {
      pending.push(condition);
    } else {
      blocks[classification].push(...pending, condition);
      pending = [];
    }
  }
  /* trailing combining conditions that don't feed a real condition */
  self.otherConditions.push(...pending);

  self.hasPause = self.pauseConditions.length > 0;
  if (self.hasPause && parse.remember)
    updateConditionPauseRemember(self);

  return self;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                         */
/* ------------------------------------------------------------------ */

export function newEvalState(peek) {
  return {
    peek,
    measuredValue: typedValue(NONE, 0),
    addHits: 0,
    isTrue: 1,
    isPrimed: 1,
    isPaused: 0,
    canMeasure: 1,
    measuredFromHits: 0,
    andNext: 1,
    orNext: 0,
    resetNext: 0,
    stopProcessing: 0,
    hasHits: 0,
    wasReset: 0,
    wasCondReset: 0,
    canShortCircuit: 0,
  };
}

/** Mirrors rc_condset_evaluate_condition_no_add_hits. */
function evaluateConditionNoAddHits(condition, evalState) {
  let condValid = testCondition(condition, evalState) ? 1 : 0;
  condition.isTrue = condValid;

  if (evalState.resetNext) {
    /* previous ResetNextIf resets the hit count on this condition and
     * prevents it from being true */
    if (condition.currentHits !== 0) evalState.wasCondReset = 1;

    condition.currentHits = 0;
    condValid = 0;
  } else {
    /* apply chained logic flags */
    condValid &= evalState.andNext;
    condValid |= evalState.orNext;

    if (condValid) {
      /* true conditions update their hit count */
      evalState.hasHits = 1;

      if (condition.requiredHits === 0) {
        /* no target hit count, just keep tallying */
        condition.currentHits = (condition.currentHits + 1) >>> 0;
      } else if (condition.currentHits < condition.requiredHits) {
        /* target hit count hasn't been met - only true if it becomes met */
        condition.currentHits++;
        condValid = condition.currentHits === condition.requiredHits ? 1 : 0;
      } else {
        /* target hit count has been met, do nothing */
      }
    } else if (condition.currentHits > 0) {
      /* was true in the past; if the hit target is met, it's true now */
      evalState.hasHits = 1;
      condValid = condition.currentHits === condition.requiredHits ? 1 : 0;
    }
  }

  /* reset chained logic flags for the next condition */
  evalState.andNext = 1;
  evalState.orNext = 0;

  return condValid;
}

/** Mirrors rc_condset_evaluate_total_hits. */
function evaluateTotalHits(condition, evalState) {
  let totalHits = condition.currentHits;

  if (condition.requiredHits !== 0) {
    /* recalculate including the AddHits counter */
    const signedHits = condition.currentHits + evalState.addHits;
    totalHits = signedHits >= 0 ? signedHits >>> 0 : 0;
  }

  evalState.addHits = 0;
  return totalHits;
}

/** Mirrors rc_condset_evaluate_condition. */
function evaluateCondition(condition, evalState) {
  let condValid = evaluateConditionNoAddHits(condition, evalState);

  if (evalState.addHits !== 0 && condition.requiredHits !== 0) {
    const totalHits = evaluateTotalHits(condition, evalState);
    condValid = totalHits >= condition.requiredHits ? 1 : 0;
  }

  evalState.resetNext = 0;
  return condValid;
}

function evaluateStandard(condition, evalState) {
  const condValid = evaluateCondition(condition, evalState);

  evalState.isTrue &= condValid;
  evalState.isPrimed &= condValid;

  if (!condValid && evalState.canShortCircuit)
    evalState.stopProcessing = 1;
}

function evaluatePauseIf(condition, evalState) {
  const condValid = evaluateCondition(condition, evalState);

  if (condValid) {
    evalState.isPaused = 1;

    /* set cannot be valid if it's paused */
    evalState.isTrue = evalState.isPrimed = 0;

    /* stop processing the rest of the group */
    evalState.stopProcessing = 1;
  } else if (condition.requiredHits === 0) {
    /* PauseIf without a hit count resets its own hit count when false */
    condition.currentHits = 0;
  } else {
    /* PauseIf with an unmet hit count - ignore for now */
  }
}

function evaluateResetIf(condition, evalState) {
  const condValid = evaluateCondition(condition, evalState);

  if (condValid) {
    /* bit 0x02 flags the condition as responsible for the reset */
    condition.isTrue |= 0x02;

    /* set cannot be valid if we've hit a reset condition */
    evalState.isTrue = evalState.isPrimed = 0;

    /* let caller know to reset all hit counts */
    evalState.wasReset = 1;

    evalState.stopProcessing = 1;
  }
}

function evaluateTrigger(condition, evalState) {
  const condValid = evaluateCondition(condition, evalState);
  evalState.isTrue &= condValid;
}

function evaluateMeasured(condition, evalState) {
  if (condition.requiredHits === 0) {
    evaluateStandard(condition, evalState);

    /* Measured without a hit target measures the left operand */
    evalState.measuredValue = evaluateOperand(condition.operand1, evalState);
    evalState.measuredFromHits = 0;
  } else {
    /* largely mimicks evaluateCondition, but captures the total hits */
    let condValid = evaluateConditionNoAddHits(condition, evalState);
    const totalHits = evaluateTotalHits(condition, evalState);

    condValid = totalHits >= condition.requiredHits ? 1 : 0;
    evalState.isTrue &= condValid;
    evalState.isPrimed &= condValid;

    evalState.measuredValue = typedValue(U32, totalHits);
    evalState.measuredFromHits = 1;

    evalState.resetNext = 0;
  }
}

function evaluateMeasuredIf(condition, evalState) {
  const condValid = evaluateCondition(condition, evalState);

  evalState.isTrue &= condValid;
  evalState.isPrimed &= condValid;
  evalState.canMeasure &= condValid;
}

function evaluateAddHits(condition, evalState) {
  evaluateConditionNoAddHits(condition, evalState);

  evalState.addHits += condition.currentHits;

  /* a ResetNextIf applied to this AddHits shouldn't affect later conditions */
  evalState.resetNext = 0;
}

function evaluateSubHits(condition, evalState) {
  evaluateConditionNoAddHits(condition, evalState);

  evalState.addHits -= condition.currentHits;

  evalState.resetNext = 0;
}

function evaluateResetNextIf(condition, evalState) {
  evalState.resetNext = evaluateConditionNoAddHits(condition, evalState);
}

function evaluateAndNext(condition, evalState) {
  evalState.andNext = evaluateConditionNoAddHits(condition, evalState);
}

function evaluateOrNext(condition, evalState) {
  evalState.orNext = evaluateConditionNoAddHits(condition, evalState);
}

/** Mirrors rc_test_condset_internal. */
function testCondsetInternal(conditions, evalState, canShortCircuit) {
  for (const condition of conditions) {
    switch (condition.type) {
      case 'standard': evaluateStandard(condition, evalState); break;
      case 'pauseif': evaluatePauseIf(condition, evalState); break;
      case 'resetif': evaluateResetIf(condition, evalState); break;
      case 'trigger': evaluateTrigger(condition, evalState); break;
      case 'measured': evaluateMeasured(condition, evalState); break;
      case 'measuredif': evaluateMeasuredIf(condition, evalState); break;
      case 'addsource':
      case 'subsource':
      case 'addaddress':
      case 'remember':
        /* handled by modified memrefs */
        break;
      case 'addhits': evaluateAddHits(condition, evalState); break;
      case 'subhits': evaluateSubHits(condition, evalState); break;
      case 'resetnextif': evaluateResetNextIf(condition, evalState); break;
      case 'andnext': evaluateAndNext(condition, evalState); break;
      case 'ornext': evaluateOrNext(condition, evalState); break;
      default:
        evalState.stopProcessing = 1;
        evalState.isTrue = evalState.isPrimed = 0;
        break;
    }

    if (evalState.stopProcessing && canShortCircuit)
      break;
  }
}

/** Mirrors rc_test_condset. Returns 0/1. */
export function testCondset(self, evalState) {
  /* reset the processing state; do not reset the result state */
  evalState.measuredValue = typedValue(NONE, 0);
  evalState.addHits = 0;
  evalState.isTrue = 1;
  evalState.isPrimed = 1;
  evalState.isPaused = 0;
  evalState.canMeasure = 1;
  evalState.measuredFromHits = 0;
  evalState.andNext = 1;
  evalState.orNext = 0;
  evalState.resetNext = 0;
  evalState.stopProcessing = 0;

  if (self.pauseConditions.length) {
    /* if any pause condition is true, stop processing this group */
    testCondsetInternal(self.pauseConditions, evalState, true);

    self.isPaused = !!evalState.isPaused;
    if (self.isPaused) {
      /* condset is paused; stop processing immediately */
      return 0;
    }
  }

  if (self.resetConditions.length) {
    testCondsetInternal(self.resetConditions, evalState, evalState.canShortCircuit);
  }

  if (self.hittargetConditions.length) {
    /* hit target conditions must be processed every frame,
     * unless their hit counts are going to be reset anyway */
    if (!evalState.wasReset)
      testCondsetInternal(self.hittargetConditions, evalState, false);
  }

  if (self.measuredConditions.length) {
    /* reset hit counts before processing so the MeasuredIf logic and
     * Measured value are correct (a ResetIf in a later alt group may not
     * have been processed yet - accepted edge case, see condset.c) */
    if (evalState.wasReset) {
      for (const condition of self.measuredConditions)
        condition.currentHits = 0;
    }

    /* the measured value must be calculated every frame */
    testCondsetInternal(self.measuredConditions, evalState, false);

    if (evalState.measuredValue.type !== NONE) {
      /* if a MeasuredIf was false, or the measured value is a hit count and
       * a ResetIf is true, zero out the measured value */
      if (!evalState.canMeasure ||
          (evalState.measuredFromHits && evalState.wasReset)) {
        evalState.measuredValue = typedValue(U32, 0);
      }
    }
  }

  if (self.otherConditions.length) {
    /* remaining conditions only need evaluating if the rest is true, or if
     * we can't short circuit (and there wasn't a reset) */
    if (evalState.isTrue)
      testCondsetInternal(self.otherConditions, evalState, evalState.canShortCircuit);
    else if (!evalState.canShortCircuit && !evalState.wasReset)
      testCondsetInternal(self.otherConditions, evalState, evalState.canShortCircuit);
  }

  return evalState.isTrue;
}

/** Mirrors rc_reset_condset. */
export function resetCondset(self) {
  for (const condition of self.conditions)
    condition.currentHits = 0;
}
