/**
 * Port of rcheevos' operand handling (src/rcheevos/operand.c).
 *
 * Operand types:
 *   'address'  - current value at an address ("0xH1234")
 *   'delta'    - value the memref had last frame ("d0xH1234")
 *   'prior'    - last *differing* value of the memref ("p0xH1234")
 *   'bcd'      - BCD-decoded current value ("b0xH1234")
 *   'inverted' - bit-inverted current value ("~0xH1234")
 *   'const'    - unsigned 32-bit constant ("42", "h2A", "v-10")
 *   'fp'       - float constant ("f1.5")
 *   'recall'   - value stored by the last Remember condition ("{recall}")
 *   'func'     - unimplemented upstream, always 0
 */

import {
  parseMemref, memrefSharedSize, memrefMask, transformMemrefValue,
  getMemrefValue, ParseError, OP_INDIRECT_READ, readStrtoul,
  SIZE_32, SIZE_FLOAT, SIZE_LOW, SIZE_HIGH, SIZE_8, SIZE_16, SIZE_16_BE,
  SIZE_24, SIZE_24_BE, SIZE_32_BE, SIZE_VARIABLE, memsizeIsFloat,
  MEMREF_MODIFIED,
} from './memref.js';
import { U32, F32, typedValue } from './typed-value.js';

export function operandSetConst(operand, value) {
  operand.size = SIZE_32;
  operand.type = 'const';
  operand.memrefAccessType = null;
  operand.num = value >>> 0;
  operand.dbl = undefined;
  operand.memref = undefined;
  return operand;
}

export function operandSetFloatConst(operand, value) {
  operand.size = SIZE_FLOAT;
  operand.type = 'fp';
  operand.memrefAccessType = null;
  operand.dbl = value;
  operand.num = undefined;
  operand.memref = undefined;
  return operand;
}

export function constOperand(value) {
  return operandSetConst({ isCombining: false }, value);
}

export function operandTypeIsMemref(type) {
  switch (type) {
    case 'const':
    case 'fp':
    case 'func':
    case 'recall':
      return false;
    default:
      return true;
  }
}

export function operandIsMemref(operand) {
  return operandTypeIsMemref(operand.type);
}

export function operandTypeIsTransform(type) {
  return type === 'bcd' || type === 'inverted';
}

export function operatorIsModifying(oper) {
  switch (oper) {
    case 'and':
    case 'xor':
    case 'div':
    case 'mult':
    case 'mod':
    case 'add':
    case 'sub':
    case 'none': /* NONE operator implies "* 1" */
      return true;
    default:
      return false;
  }
}

export function operandIsFloatMemref(operand) {
  if (!operandIsMemref(operand)) return false;

  if (operand.memref.kind === MEMREF_MODIFIED &&
      operand.memref.modifierType !== OP_INDIRECT_READ) {
    return memsizeIsFloat(operand.memref.size);
  }

  return memsizeIsFloat(operand.size);
}

export function operandIsFloat(operand) {
  if (operand.type === 'fp') return true;
  if (operand.type === 'recall') return memsizeIsFloat(operand.size);
  return operandIsFloatMemref(operand);
}

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

function isDigit(ch) { return ch >= '0' && ch <= '9'; }
function isAlpha(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}
function isAlnum(ch) { return isDigit(ch) || isAlpha(ch); }

/** Mirrors rc_parse_operand_memory ('d'/'p'/'b'/'~' prefixes + memref). */
function parseOperandMemory(operand, cursor, parse) {
  const s = cursor.s;

  switch (s[cursor.i]) {
    case 'd': case 'D': operand.type = 'delta'; cursor.i++; break;
    case 'p': case 'P': operand.type = 'prior'; cursor.i++; break;
    case 'b': case 'B': operand.type = 'bcd'; cursor.i++; break;
    case '~': operand.type = 'inverted'; cursor.i++; break;
    default: operand.type = 'address'; break;
  }

  operand.memrefAccessType = operand.type;

  const { size, address } = parseMemref(cursor);
  operand.size = size;

  let memrefSize = memrefSharedSize(size);
  if (memrefSize !== size && operand.type === 'prior') {
    /* if the shared size uses a different mask, bits outside our mask would
     * pollute the prior value - use a dedicated record instead */
    if (memrefMask(memrefSize) !== memrefMask(size))
      memrefSize = size;
  }

  if (parse.indirectParent) {
    operand.memref = parse.memrefs.allocModifiedMemref(
      memrefSize, parse.indirectParent, OP_INDIRECT_READ, constOperand(address));
  } else {
    operand.memref = parse.memrefs.allocMemref(address, memrefSize);
  }
}

/** Mirrors rc_parse_operand_variable ("{recall}"). */
function parseOperandVariable(operand, cursor, parse) {
  const s = cursor.s;
  let i = cursor.i;
  const start = i;

  while (i < s.length && s[i] !== '}') {
    const ch = s[i];
    const isFirst = i === start;
    const valid = isAlpha(ch) || ch === '_' || (!isFirst && isDigit(ch));
    if (!valid || i - start >= 15) throw new ParseError('RC_INVALID_VARIABLE_NAME', cursor);
    i++;
  }

  const name = s.slice(start, i);
  if (name.length === 0 || s[i] !== '}') throw new ParseError('RC_INVALID_VARIABLE_NAME', cursor);
  i++;

  if (name !== 'recall') throw new ParseError('RC_UNKNOWN_VARIABLE_NAME', cursor);

  if (!parse.remember) {
    operand.memref = null;
    operand.size = SIZE_32;
    operand.memrefAccessType = 'address';
  } else {
    Object.assign(operand, parse.remember);
    operand.isCombining = false;
    operand.memrefAccessType = operand.type;
  }
  operand.type = 'recall';

  cursor.i = i;
}

function parseOperandFuncCall(operand, cursor) {
  const s = cursor.s;
  let i = cursor.i;

  if (s[i] !== '@') throw new ParseError('RC_INVALID_FUNC_OPERAND', cursor);
  i++;
  if (!isAlpha(s[i] ?? '')) throw new ParseError('RC_INVALID_FUNC_OPERAND', cursor);
  while (i < s.length && (isAlnum(s[i]) || s[i] === '_')) i++;

  operand.type = 'func';
  operand.size = SIZE_32;
  operand.memrefAccessType = 'address';
  cursor.i = i;
}

function readUnsignedDigits(cursor, radix) {
  const s = cursor.s;
  let i = cursor.i;
  const start = i;
  const isValid = radix === 16 ? (ch) => /[0-9a-fA-F]/.test(ch) : isDigit;
  while (i < s.length && isValid(s[i])) i++;
  if (i === start) return null;
  cursor.i = i;
  return parseInt(s.slice(start, i), radix);
}

/** Mirrors rc_parse_operand. Returns a new operand, advances cursor. */
export function parseOperand(cursor, parse) {
  const s = cursor.s;
  const operand = { isCombining: false };
  let allowDecimal = false;

  const ch = s[cursor.i];
  switch (ch) {
    case 'h': case 'H': { /* hex constant */
      if (s[cursor.i + 2] === 'x' || s[cursor.i + 2] === 'X') {
        /* H0x1234 is a typo - either H1234 or 0xH1234 was probably meant */
        throw new ParseError('RC_INVALID_CONST_OPERAND', cursor);
      }
      cursor.i++;
      const value = readStrtoul(cursor, 16);
      if (value === null) throw new ParseError('RC_INVALID_CONST_OPERAND', cursor);
      operandSetConst(operand, value > 0xffffffffn ? 0xffffffff : Number(value));
      break;
    }

    case 'f': case 'F': /* floating point constant or float memref */
      if (isAlpha(s[cursor.i + 1] ?? '')) {
        parseOperandMemory(operand, cursor, parse);
        break;
      }
      allowDecimal = true;
      /* fallthrough */
    case 'v': case 'V':
    case '+': case '-': {
      if (ch === 'f' || ch === 'F' || ch === 'v' || ch === 'V') cursor.i++;

      let negative = false;
      if (s[cursor.i] === '-') { negative = true; cursor.i++; }
      else if (s[cursor.i] === '+') cursor.i++;

      let value = readStrtoul(cursor, 10);

      if (s[cursor.i] === '.' && allowDecimal) {
        cursor.i++;
        const fracStart = cursor.i;
        const fraction = readUnsignedDigits(cursor, 10);
        if (fraction === null) throw new ParseError('RC_INVALID_FP_OPERAND', cursor);
        const fracDigits = Math.min(cursor.i - fracStart, 9);
        const fracValue = parseInt(s.slice(fracStart, fracStart + fracDigits), 10);
        const shift = Math.pow(10, fracDigits);

        /* the integer part is an unsigned long; the negative branch reads
         * it back through a signed cast like C does */
        const intPart = value ?? 0n;
        const signedPart = Number(intPart >= (1n << 63n) ? intPart - (1n << 64n) : intPart);

        let dbl;
        if (fracValue !== 0) {
          const dblFraction = fracValue / shift;
          dbl = negative ? -signedPart - dblFraction : Number(intPart) + dblFraction;
        } else {
          dbl = negative ? -signedPart : Number(intPart);
        }
        operandSetFloatConst(operand, dbl);
      } else {
        if (value === null) {
          throw new ParseError(allowDecimal ? 'RC_INVALID_FP_OPERAND' : 'RC_INVALID_CONST_OPERAND', cursor);
        }
        if (value > 0x7fffffffn) value = 0x7fffffffn;
        const num = Number(value);
        operandSetConst(operand, negative ? (-num >>> 0) : num);
      }
      break;
    }

    case '{': /* variable */
      cursor.i++;
      parseOperandVariable(operand, cursor, parse);
      break;

    case '0':
      if (s[cursor.i + 1] === 'x' || s[cursor.i + 1] === 'X') {
        parseOperandMemory(operand, cursor, parse);
        break;
      }
      /* fallthrough - plain decimal constant */
    case '1': case '2': case '3': case '4':
    case '5': case '6': case '7': case '8': case '9': {
      const value = readStrtoul(cursor, 10);
      if (value === null) throw new ParseError('RC_INVALID_CONST_OPERAND', cursor);
      operandSetConst(operand, value > 0xffffffffn ? 0xffffffff : Number(value));
      break;
    }

    case '@':
      parseOperandFuncCall(operand, cursor);
      break;

    default:
      parseOperandMemory(operand, cursor, parse);
      break;
  }

  return operand;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                         */
/* ------------------------------------------------------------------ */

/** Mirrors rc_transform_operand_value (BCD decode / bit inversion). */
function transformOperandValue(value, operand) {
  switch (operand.type) {
    case 'bcd':
      switch (operand.size) {
        case SIZE_8:
          return ((value >>> 4) & 0x0f) * 10 + (value & 0x0f);
        case SIZE_16:
        case SIZE_16_BE:
          return ((value >>> 12) & 0x0f) * 1000 + ((value >>> 8) & 0x0f) * 100 +
                 ((value >>> 4) & 0x0f) * 10 + (value & 0x0f);
        case SIZE_24:
        case SIZE_24_BE:
          return ((value >>> 20) & 0x0f) * 100000 + ((value >>> 16) & 0x0f) * 10000 +
                 ((value >>> 12) & 0x0f) * 1000 + ((value >>> 8) & 0x0f) * 100 +
                 ((value >>> 4) & 0x0f) * 10 + (value & 0x0f);
        case SIZE_32:
        case SIZE_32_BE:
        case SIZE_VARIABLE:
          return ((value >>> 28) & 0x0f) * 10000000 + ((value >>> 24) & 0x0f) * 1000000 +
                 ((value >>> 20) & 0x0f) * 100000 + ((value >>> 16) & 0x0f) * 10000 +
                 ((value >>> 12) & 0x0f) * 1000 + ((value >>> 8) & 0x0f) * 100 +
                 ((value >>> 4) & 0x0f) * 10 + (value & 0x0f);
        default:
          return value;
      }

    case 'inverted':
      switch (operand.size) {
        case SIZE_LOW:
        case SIZE_HIGH:
          return (value ^ 0x0f) >>> 0;
        case SIZE_8:
          return (value ^ 0xff) >>> 0;
        case SIZE_16:
        case SIZE_16_BE:
          return (value ^ 0xffff) >>> 0;
        case SIZE_24:
        case SIZE_24_BE:
          return (value ^ 0xffffff) >>> 0;
        case SIZE_32:
        case SIZE_32_BE:
        case SIZE_VARIABLE:
          return (value ^ 0xffffffff) >>> 0;
        default:
          return (value ^ 0x01) >>> 0;
      }

    default:
      return value;
  }
}

/**
 * Mirrors rc_operand_addsource: fold this operand into the running
 * AddSource/SubSource accumulator, replacing it with a modified memref.
 */
export function operandAddSource(operand, parse, newSize) {
  let modifiedMemref;

  if ((operand.type === 'delta' || operand.type === 'prior') &&
      operand.type === parse.addsourceParent.type) {
    /* adding prev(x) and prev(y) == prev(x + y); keep the outer delta/prior */
    const modifier = { ...operand, type: 'address' };
    parse.addsourceParent.type = 'address';

    modifiedMemref = parse.memrefs.allocModifiedMemref(
      newSize, parse.addsourceParent, parse.addsourceOper, modifier);
  } else {
    modifiedMemref = parse.memrefs.allocModifiedMemref(
      newSize, parse.addsourceParent, parse.addsourceOper, operand);

    operand.type = operand.memrefAccessType = 'address';
  }

  operand.memref = modifiedMemref;
  /* result of an AddSource operation is always a 32-bit integer */
  operand.size = SIZE_32;
}

/** Mirrors rc_evaluate_operand. Returns a typed value. */
export function evaluateOperand(operand, evalState) {
  let result;

  switch (operand.type) {
    case 'const':
      return typedValue(U32, operand.num >>> 0);

    case 'fp':
      return typedValue(F32, Math.fround(operand.dbl));

    case 'func':
      /* this feature was never actualized upstream */
      return typedValue(U32, 0);

    case 'recall':
      if (!operandTypeIsMemref(operand.memrefAccessType)) {
        /* remembered value was a constant */
        const recall = { ...operand, type: operand.memrefAccessType };
        return evaluateOperand(recall, evalState);
      }
      if (!operand.memref) return typedValue(U32, 0);
      result = getMemrefValue(operand.memref, operand.memrefAccessType);
      break;

    default:
      result = getMemrefValue(operand.memref, operand.type);
      break;
  }

  /* convert the raw read to the requested size/format */
  transformMemrefValue(result, operand.size);

  /* apply BCD decoding / bit inversion */
  if (result.type === U32)
    result.value = transformOperandValue(result.value, operand) >>> 0;

  return result;
}
