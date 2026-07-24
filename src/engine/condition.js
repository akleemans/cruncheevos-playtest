/**
 * Port of rcheevos' condition handling (src/rcheevos/condition.c).
 *
 * Condition types (flags):
 *   'standard'    -      plain comparison
 *   'pauseif'     - P:   pause the group while true
 *   'resetif'     - R:   reset all hit counts while true
 *   'measuredif'  - Q:   gate for Measured
 *   'trigger'     - T:   only affects priming/challenge indicator
 *   'measured'    - M:   progress measurement (G: measured as percent)
 *   'addsource'   - A:   add left operand into the next condition
 *   'subsource'   - B:   subtract left operand from the next condition
 *   'addaddress'  - I:   indirect addressing for the next condition
 *   'remember'    - K:   store value for later {recall}
 *   'addhits'     - C:   add this condition's hits to the next hit target
 *   'subhits'     - D:   subtract this condition's hits from the next hit target
 *   'resetnextif' - Z:   reset the next condition's hits while true
 *   'andnext'     - N:   logically AND with the next condition
 *   'ornext'      - O:   logically OR with the next condition
 */

import {
  parseOperand, operandSetFloatConst, operandIsFloat,
  operatorIsModifying, operandAddSource, evaluateOperand, constOperand,
} from './operand.js';
import {
  ParseError, SIZE_32, SIZE_FLOAT, OP_ADD_ACCUMULATOR, OP_SUB_ACCUMULATOR,
  OP_SUB_PARENT, MEMREF_PLAIN, transformMemrefValue, getModifiedMemrefValue,
  readStrtoul,
} from './memref.js';
import { U32, typedValue, compare as typedCompare, combine as typedCombine } from './typed-value.js';

const FLAG_CHARS = {
  p: 'pauseif', r: 'resetif', a: 'addsource', b: 'subsource',
  c: 'addhits', d: 'subhits', n: 'andnext', o: 'ornext',
  m: 'measured', q: 'measuredif', i: 'addaddress', t: 'trigger',
  k: 'remember', z: 'resetnextif',
};

const COMPARISON_OPS = new Set(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);

function compareValues(v1, v2, oper) {
  switch (oper) {
    case 'eq': return v1 === v2 ? 1 : 0;
    case 'ne': return v1 !== v2 ? 1 : 0;
    case 'lt': return v1 < v2 ? 1 : 0;
    case 'le': return v1 <= v2 ? 1 : 0;
    case 'gt': return v1 > v2 ? 1 : 0;
    case 'ge': return v1 >= v2 ? 1 : 0;
    default: return 1;
  }
}

/**
 * Mirrors rc_condition_determine_comparator. Most of the C fast paths are
 * semantically identical to the general path and map to 'default' here; the
 * observable ones are:
 *  - comparing a memref against a Delta of the *same* memref: if the value
 *    did not change this frame, =/>=/<= are true (and !=/</> false) without
 *    comparing the (possibly differently-transformed) sides
 *  - constant-vs-constant comparisons collapse to a fixed result
 */
export function determineComparator(condition) {
  if (!COMPARISON_OPS.has(condition.oper)) {
    /* not a comparison; legacy behavior is to evaluate true */
    return 'alwaysTrue';
  }

  const o1 = condition.operand1;
  const o2 = condition.operand2;

  if ((o1.type === 'address' || o1.type === 'delta') &&
      o1.memref.kind === MEMREF_PLAIN && !operandIsFloat(o1)) {
    if ((o2.type === 'address' || o2.type === 'delta') &&
        o2.memref.kind === MEMREF_PLAIN && !operandIsFloat(o2)) {
      const isSameMemref = o1.memref === o2.memref;
      const needsTranslate = (o1.size !== o1.memref.size) || (o2.size !== o2.memref.size);

      if (o1.type === 'address' && o2.type === 'address') {
        if (isSameMemref && !needsTranslate) {
          /* comparing a memref to itself evaluates to a constant */
          return compareValues(0, 0, condition.oper) ? 'alwaysTrue' : 'alwaysFalse';
        }
      } else if (isSameMemref && o1.type !== o2.type) {
        /* delta comparison optimized to change detection */
        return o1.type === 'address' ? 'memrefToDelta' : 'deltaToMemref';
      }
    }
  }

  if (o1.type === 'const' && o2.type === 'const') {
    return compareValues(o1.num, o2.num, condition.oper) ? 'alwaysTrue' : 'alwaysFalse';
  }

  return 'default';
}

/* Mirrors rc_test_condition_compare_memref_to_delta(_transformed) and the
 * delta_to_memref variants. */
function compareMemrefToDelta(condition, deltaOnLeft) {
  const memref = condition.operand1.memref;

  if (memref.changed) {
    const v1 = transformMemrefValue(
      typedValue(U32, deltaOnLeft ? memref.prior : memref.value), condition.operand1.size);
    const v2 = transformMemrefValue(
      typedValue(U32, deltaOnLeft ? memref.value : memref.prior), condition.operand2.size);
    return compareValues(v1.value, v2.value, condition.oper);
  }

  /* value did not change: equal by definition */
  switch (condition.oper) {
    case 'eq':
    case 'ge':
    case 'le':
      return 1;
    default:
      return 0;
  }
}

/** Mirrors rc_parse_operator. Returns operator name or 'none'. */
function parseOperator(cursor) {
  const s = cursor.s;
  const ch = s[cursor.i];

  switch (ch) {
    case '=':
      cursor.i++;
      if (s[cursor.i] === '=') cursor.i++;
      return 'eq';

    case '!':
      if (s[cursor.i + 1] === '=') { cursor.i += 2; return 'ne'; }
      throw new ParseError('RC_INVALID_OPERATOR', cursor);

    case '<':
      if (s[cursor.i + 1] === '=') { cursor.i += 2; return 'le'; }
      cursor.i++;
      return 'lt';

    case '>':
      if (s[cursor.i + 1] === '=') { cursor.i += 2; return 'ge'; }
      cursor.i++;
      return 'gt';

    case '*': cursor.i++; return 'mult';
    case '/': cursor.i++; return 'div';
    case '&': cursor.i++; return 'and';
    case '^': cursor.i++; return 'xor';
    case '%': cursor.i++; return 'mod';
    case '+': cursor.i++; return 'add';
    case '-': cursor.i++; return 'sub';

    case undefined: /* end of string */
    case '_': /* next condition */
    case 'S': /* next condset */
    case ')': /* end of macro */
    case '$': /* maximum of values */
      return 'none';

    default:
      throw new ParseError('RC_INVALID_OPERATOR', cursor);
  }
}

/**
 * Mirrors rc_condition_convert_to_operand: collapse "operand1 oper operand2"
 * into a single operand backed by a modified memref (or just operand1 if
 * there is no operator).
 */
export function conditionConvertToOperand(condition, parse) {
  if (condition.oper === 'none') {
    return { ...condition.operand1 };
  }

  const newSize = (operandIsFloat(condition.operand1) || operandIsFloat(condition.operand2))
    ? SIZE_FLOAT : SIZE_32;

  const memref = parse.memrefs.allocModifiedMemref(
    newSize, condition.operand1, condition.oper, condition.operand2);

  return {
    memref,
    /* not actually an address, just a non-delta memref read */
    type: 'address',
    memrefAccessType: 'address',
    size: newSize,
    isCombining: false,
  };
}

/** Mirrors rc_parse_condition_internal. Returns a condition, advances cursor. */
export function parseCondition(cursor, parse) {
  const s = cursor.s;
  const condition = {
    currentHits: 0,
    isTrue: false,
    optimizedComparator: 'default',
  };
  let canModify = false;

  if (s[cursor.i] !== undefined && s[cursor.i + 1] === ':') {
    const flag = s[cursor.i].toLowerCase();
    const type = FLAG_CHARS[flag];

    if (flag === 'g') {
      parse.measuredAsPercent = true;
      condition.type = 'measured';
    } else if (type !== undefined) {
      condition.type = type;
      canModify = (type === 'addsource' || type === 'subsource' ||
                   type === 'addaddress' || type === 'remember');
    } else {
      throw new ParseError('RC_INVALID_CONDITION_TYPE', cursor);
    }

    cursor.i += 2;
  } else {
    condition.type = 'standard';
  }

  condition.operand1 = parseOperand(cursor, parse);
  condition.oper = parseOperator(cursor);

  if (condition.oper === 'none') {
    /* non-modifying statements must have a second operand */
    if (!canModify && condition.type !== 'measured' && !parse.ignoreNonParseErrors) {
      throw new ParseError('RC_INVALID_OPERATOR', cursor);
    }

    /* provide dummy operand of '1' and no required hits */
    condition.operand2 = constOperand(1);
    condition.requiredHits = 0;
    return condition;
  }

  if (canModify && !operatorIsModifying(condition.oper)) {
    /* comparison operators are not valid on modifying statements */
    switch (condition.type) {
      case 'addsource':
      case 'subsource':
      case 'addaddress':
        /* legacy achievements: ignore the comparison */
        condition.oper = 'none';
        break;

      default:
        if (!parse.ignoreNonParseErrors)
          throw new ParseError('RC_INVALID_OPERATOR', cursor);
        break;
    }
  }

  condition.operand2 = parseOperand(cursor, parse);

  if (condition.oper === 'none') {
    /* if operator is none, explicitly clear out the right side */
    condition.operand2 = constOperand(0);
  }

  /* hit target: "(10)" or legacy ".10." (strtoul semantics, truncated to
   * unsigned like C's cast) */
  condition.requiredHits = 0;
  const hitOpen = s[cursor.i];
  if (hitOpen === '(' || hitOpen === '.') {
    const close = hitOpen === '(' ? ')' : '.';
    cursor.i++;
    const value = readStrtoul(cursor, 10);
    if (value === null || s[cursor.i] !== close)
      throw new ParseError('RC_INVALID_REQUIRED_HITS', cursor);

    if (condition.oper !== 'none') {
      condition.requiredHits = Number(value & 0xffffffffn);
      parse.hasRequiredHits = true;
    }
    cursor.i++;
  }

  condition.optimizedComparator = determineComparator(condition);

  return condition;
}

/**
 * Mirrors rc_condition_update_parse_state: after a condition is parsed,
 * fold AddSource/SubSource/AddAddress/Remember chains into modified memrefs
 * carried in the parse state, and attach pending accumulators to this
 * condition's left operand.
 */
export function conditionUpdateParseState(condition, parse) {
  switch (condition.type) {
    case 'addaddress':
      parse.indirectParent = conditionConvertToOperand(condition, parse);
      break;

    case 'addsource':
      if (!parse.addsourceParent) {
        parse.addsourceParent = conditionConvertToOperand(condition, parse);
      } else {
        /* type determined by parent */
        const newSize = operandIsFloat(parse.addsourceParent) ? SIZE_FLOAT : SIZE_32;
        const condOperand = conditionConvertToOperand(condition, parse);
        operandAddSource(condOperand, parse, newSize);
        parse.addsourceParent = condOperand;
      }

      parse.addsourceOper = OP_ADD_ACCUMULATOR;
      parse.indirectParent = null;
      break;

    case 'subsource':
      if (!parse.addsourceParent) {
        parse.addsourceParent = conditionConvertToOperand(condition, parse);
        parse.addsourceOper = OP_SUB_PARENT;
      } else {
        /* type determined by parent */
        const newSize = operandIsFloat(parse.addsourceParent) ? SIZE_FLOAT : SIZE_32;

        if (parse.addsourceOper === OP_ADD_ACCUMULATOR && !isMemrefOperand(parse.addsourceParent)) {
          /* previous element was a constant - turn it into a memref by adding zero */
          const memref = parse.memrefs.allocModifiedMemref(
            parse.addsourceParent.size, parse.addsourceParent, OP_ADD_ACCUMULATOR, constOperand(0));
          parse.addsourceParent = {
            ...parse.addsourceParent,
            memref,
            type: 'address',
          };
        } else if (parse.addsourceOper === OP_SUB_PARENT) {
          /* previous element was also a SubSource - negate via 0 - parent */
          const zero = operandIsFloat(parse.addsourceParent)
            ? operandSetFloatConst({ isCombining: false }, 0.0)
            : constOperand(0);

          const negate = parse.memrefs.allocModifiedMemref(
            newSize, parse.addsourceParent, OP_SUB_PARENT, zero);
          /* upstream keeps the previous operand's type here, so the next
           * chain step reads the negated accumulator through that access
           * type (delta/prior/bcd/inverted) */
          parse.addsourceParent = {
            ...parse.addsourceParent,
            memref: negate,
            size: zero.size,
          };

          /* an integer-constant parent is folded to its negated value at
           * parse time (rcheevos #528); float-constant and const-bound
           * {recall} parents still read heap-pointer bits upstream (UB),
           * so there is no defined behavior to mirror for those */
          if (parse.addsourceParent.type === 'const')
            parse.addsourceParent.num = getModifiedMemrefValue(negate, null);
        }

        /* subtract the condition from the chain */
        parse.addsourceOper = OP_SUB_ACCUMULATOR;
        const condOperand = conditionConvertToOperand(condition, parse);
        operandAddSource(condOperand, parse, newSize);
        parse.addsourceParent = condOperand;

        /* indicate the next value can be added to the chain */
        parse.addsourceOper = OP_ADD_ACCUMULATOR;
      }

      parse.indirectParent = null;
      break;

    case 'remember':
      if (condition.operand1.type === 'recall' &&
          condition.oper === 'none' &&
          !parse.addsourceParent &&
          !parse.indirectParent) {
        /* remembering {recall} without any modifications is a no-op */
        break;
      }

      condition.operand1 = conditionConvertToOperand(condition, parse);

      if (parse.addsourceParent) {
        /* type determined by leaf */
        operandAddSource(condition.operand1, parse, condition.operand1.size);
        condition.operand1.isCombining = true;
      }

      parse.remember = { ...condition.operand1 };

      parse.addsourceParent = null;
      parse.indirectParent = null;
      break;

    case 'measured':
      /* Measured conditions can have modifiers in values */
      if (parse.isValue && operatorIsModifying(condition.oper) && condition.oper !== 'none') {
        condition.operand1 = conditionConvertToOperand(condition, parse);
      }
      /* fallthrough to default */
    default:
      if (parse.addsourceParent) {
        /* type determined by leaf */
        if (parse.addsourceOper === OP_ADD_ACCUMULATOR)
          parse.addsourceOper = 'add';

        operandAddSource(condition.operand1, parse, condition.operand1.size);
        condition.operand1.isCombining = true;

        condition.optimizedComparator = determineComparator(condition);
      }

      parse.addsourceParent = null;
      parse.indirectParent = null;
      break;
  }
}

function isMemrefOperand(operand) {
  switch (operand.type) {
    case 'const':
    case 'fp':
    case 'func':
    case 'recall':
      return false;
    default:
      return true;
  }
}

/** Mirrors rc_condition_is_combining. */
export function conditionIsCombining(condition) {
  switch (condition.type) {
    case 'standard':
    case 'pauseif':
    case 'resetif':
    case 'measuredif':
    case 'trigger':
    case 'measured':
      return false;
    default:
      return true;
  }
}

/** Mirrors rc_test_condition. */
export function testCondition(condition, evalState) {
  switch (condition.optimizedComparator) {
    case 'memrefToDelta': return compareMemrefToDelta(condition, false);
    case 'deltaToMemref': return compareMemrefToDelta(condition, true);
    case 'alwaysTrue': return 1;
    case 'alwaysFalse': return 0;
    default: {
      const value1 = evaluateOperand(condition.operand1, evalState);
      const value2 = evaluateOperand(condition.operand2, evalState);
      return typedCompare(value1, value2, condition.oper);
    }
  }
}

/** Mirrors rc_evaluate_condition_value (used for Measured in values). */
export function evaluateConditionValue(condition, evalState) {
  const value = evaluateOperand(condition.operand1, evalState);
  const amount = evaluateOperand(condition.operand2, evalState);
  typedCombine(value, amount, condition.oper);
  return value;
}
