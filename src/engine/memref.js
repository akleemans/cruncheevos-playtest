/**
 * Port of rcheevos' memory reference handling (src/rcheevos/memref.c).
 *
 * A "memref" is a shared record of one memory read (address + size) holding
 * the current value, the last differing value (prior) and whether it changed
 * this frame. All conditions referencing the same address+size share one
 * memref, so Delta/Prior behave consistently.
 *
 * A "modified memref" is a derived value computed from other operands - the
 * develop-branch rcheevos compiles AddSource/SubSource/AddAddress/Remember
 * chains and modifying operators (`*`, `/`, `&`, ...) into these at parse
 * time. They are re-computed once per frame (in creation order, which
 * guarantees parents are updated before dependents) and track their own
 * value/prior/changed, so Delta of a combined value works.
 */

import { U32, F32, typedValue, add as tvAdd, negate as tvNegate, convert as tvConvert, combine as tvCombine } from './typed-value.js';
import { evaluateOperand, operandIsMemref } from './operand.js';

/* ------------------------------------------------------------------ */
/* Sizes                                                              */
/* ------------------------------------------------------------------ */

export const SIZE_8 = '8bit';
export const SIZE_16 = '16bit';
export const SIZE_24 = '24bit';
export const SIZE_32 = '32bit';
export const SIZE_LOW = 'low4';
export const SIZE_HIGH = 'high4';
export const SIZE_BIT0 = 'bit0';
export const SIZE_BIT1 = 'bit1';
export const SIZE_BIT2 = 'bit2';
export const SIZE_BIT3 = 'bit3';
export const SIZE_BIT4 = 'bit4';
export const SIZE_BIT5 = 'bit5';
export const SIZE_BIT6 = 'bit6';
export const SIZE_BIT7 = 'bit7';
export const SIZE_BITCOUNT = 'bitcount';
export const SIZE_16_BE = '16bitBE';
export const SIZE_24_BE = '24bitBE';
export const SIZE_32_BE = '32bitBE';
export const SIZE_FLOAT = 'float';
export const SIZE_MBF32 = 'mbf32';
export const SIZE_MBF32_LE = 'mbf32LE';
export const SIZE_FLOAT_BE = 'floatBE';
export const SIZE_DOUBLE32 = 'double32';
export const SIZE_DOUBLE32_BE = 'double32BE';
export const SIZE_VARIABLE = 'variable';

const MASKS = {
  [SIZE_8]: 0x000000ff,
  [SIZE_16]: 0x0000ffff,
  [SIZE_24]: 0x00ffffff,
  [SIZE_32]: 0xffffffff,
  [SIZE_LOW]: 0x0000000f,
  [SIZE_HIGH]: 0x000000f0,
  [SIZE_BIT0]: 0x00000001,
  [SIZE_BIT1]: 0x00000002,
  [SIZE_BIT2]: 0x00000004,
  [SIZE_BIT3]: 0x00000008,
  [SIZE_BIT4]: 0x00000010,
  [SIZE_BIT5]: 0x00000020,
  [SIZE_BIT6]: 0x00000040,
  [SIZE_BIT7]: 0x00000080,
  [SIZE_BITCOUNT]: 0x000000ff,
  [SIZE_16_BE]: 0x0000ffff,
  [SIZE_24_BE]: 0x00ffffff,
  [SIZE_32_BE]: 0xffffffff,
  [SIZE_FLOAT]: 0xffffffff,
  [SIZE_MBF32]: 0xffffffff,
  [SIZE_MBF32_LE]: 0xffffffff,
  [SIZE_FLOAT_BE]: 0xffffffff,
  [SIZE_DOUBLE32]: 0xffffffff,
  [SIZE_DOUBLE32_BE]: 0xffffffff,
  [SIZE_VARIABLE]: 0xffffffff,
};

/* All sizes smaller than 1 byte are read as 8 bits; 24-bit as 32-bit;
 * everything else as the little-endian read of the same byte count. */
const SHARED_SIZES = {
  [SIZE_8]: SIZE_8,
  [SIZE_16]: SIZE_16,
  [SIZE_24]: SIZE_32,
  [SIZE_32]: SIZE_32,
  [SIZE_LOW]: SIZE_8,
  [SIZE_HIGH]: SIZE_8,
  [SIZE_BIT0]: SIZE_8,
  [SIZE_BIT1]: SIZE_8,
  [SIZE_BIT2]: SIZE_8,
  [SIZE_BIT3]: SIZE_8,
  [SIZE_BIT4]: SIZE_8,
  [SIZE_BIT5]: SIZE_8,
  [SIZE_BIT6]: SIZE_8,
  [SIZE_BIT7]: SIZE_8,
  [SIZE_BITCOUNT]: SIZE_8,
  [SIZE_16_BE]: SIZE_16,
  [SIZE_24_BE]: SIZE_32,
  [SIZE_32_BE]: SIZE_32,
  [SIZE_FLOAT]: SIZE_32,
  [SIZE_MBF32]: SIZE_32,
  [SIZE_MBF32_LE]: SIZE_32,
  [SIZE_FLOAT_BE]: SIZE_32,
  [SIZE_DOUBLE32]: SIZE_32,
  [SIZE_DOUBLE32_BE]: SIZE_32,
  [SIZE_VARIABLE]: SIZE_32,
};

export function memrefMask(size) {
  return MASKS[size] ?? 0xffffffff;
}

export function memrefSharedSize(size) {
  return SHARED_SIZES[size] ?? size;
}

export function memsizeIsFloat(size) {
  switch (size) {
    case SIZE_FLOAT:
    case SIZE_FLOAT_BE:
    case SIZE_DOUBLE32:
    case SIZE_DOUBLE32_BE:
    case SIZE_MBF32:
    case SIZE_MBF32_LE:
      return true;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Parsing "0xH1234" style memory references                          */
/* ------------------------------------------------------------------ */

export class ParseError extends Error {
  constructor(code, cursor) {
    super(cursor ? `${code} at offset ${cursor.i} in "${cursor.s}"` : code);
    this.code = code;
  }
}

const SIZE_CHARS = {
  h: SIZE_8, H: SIZE_8,
  ' ': SIZE_16,
  x: SIZE_32, X: SIZE_32,
  m: SIZE_BIT0, M: SIZE_BIT0,
  n: SIZE_BIT1, N: SIZE_BIT1,
  o: SIZE_BIT2, O: SIZE_BIT2,
  p: SIZE_BIT3, P: SIZE_BIT3,
  q: SIZE_BIT4, Q: SIZE_BIT4,
  r: SIZE_BIT5, R: SIZE_BIT5,
  s: SIZE_BIT6, S: SIZE_BIT6,
  t: SIZE_BIT7, T: SIZE_BIT7,
  l: SIZE_LOW, L: SIZE_LOW,
  u: SIZE_HIGH, U: SIZE_HIGH,
  k: SIZE_BITCOUNT, K: SIZE_BITCOUNT,
  w: SIZE_24, W: SIZE_24,
  g: SIZE_32_BE, G: SIZE_32_BE,
  i: SIZE_16_BE, I: SIZE_16_BE,
  j: SIZE_24_BE, J: SIZE_24_BE,
};

const FLOAT_SIZE_CHARS = {
  f: SIZE_FLOAT, F: SIZE_FLOAT,
  b: SIZE_FLOAT_BE, B: SIZE_FLOAT_BE,
  h: SIZE_DOUBLE32, H: SIZE_DOUBLE32,
  i: SIZE_DOUBLE32_BE, I: SIZE_DOUBLE32_BE,
  m: SIZE_MBF32, M: SIZE_MBF32,
  l: SIZE_MBF32_LE, L: SIZE_MBF32_LE,
};

function isHexDigit(ch) {
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

const STRTOUL_WHITESPACE = new Set([' ', '\t', '\n', '\v', '\f', '\r']);
const ULONG_MAX = (1n << 64n) - 1n;

/**
 * Mirrors C's strtoul(s + cursor.i, &end, radix), which rcheevos uses for
 * addresses, constants and hit targets: optional whitespace, optional sign
 * (negative wraps like a 64-bit unsigned long, saturating at ULONG_MAX on
 * overflow), and for base 16 an optional "0x"/"0X" prefix. Live sets rely
 * on the prefix tolerance (e.g. "0xH0x8000001e").
 *
 * Returns the value as a BigInt in [0, 2^64-1] and advances the cursor,
 * or returns null (cursor untouched) if no digits were consumed.
 */
export function readStrtoul(cursor, radix) {
  const s = cursor.s;
  let i = cursor.i;

  while (i < s.length && STRTOUL_WHITESPACE.has(s[i])) i++;

  let negative = false;
  if (s[i] === '+' || s[i] === '-') {
    negative = s[i] === '-';
    i++;
  }

  const digitOk = radix === 16 ? isHexDigit : (ch) => ch >= '0' && ch <= '9';
  if (radix === 16 && s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X') &&
      digitOk(s[i + 2] ?? '')) {
    i += 2;
  }

  const start = i;
  const base = BigInt(radix);
  let value = 0n;
  let overflow = false;
  for (; i < s.length && digitOk(s[i]); i++) {
    if (!overflow) {
      value = value * base + BigInt(parseInt(s[i], radix));
      if (value > ULONG_MAX) overflow = true;
    }
  }
  if (i === start) return null;

  cursor.i = i;
  if (overflow) return ULONG_MAX;
  if (negative && value !== 0n) return (1n << 64n) - value;
  return value;
}

/** Mirrors rc_parse_memref. Returns {size, address}, advances cursor. */
export function parseMemref(cursor) {
  const s = cursor.s;
  let i = cursor.i;
  let size;

  if (s[i] === '0') {
    if (s[i + 1] !== 'x' && s[i + 1] !== 'X') throw new ParseError('RC_INVALID_MEMORY_OPERAND', cursor);
    i += 2;

    const ch = s[i];
    /* size chars and hex digits are disjoint sets, so check size chars first */
    if (ch !== undefined && SIZE_CHARS[ch] !== undefined) {
      size = SIZE_CHARS[ch];
      i++;
    } else if (ch !== undefined && isHexDigit(ch)) {
      /* user mistyped an extra 0x: 0x0xabcd */
      if (ch === '0' && s[i + 1] === 'x') throw new ParseError('RC_INVALID_MEMORY_OPERAND', cursor);
      size = SIZE_16; /* legacy: no size prefix means 16-bit */
    } else {
      throw new ParseError('RC_INVALID_MEMORY_OPERAND', cursor);
    }
  } else if (s[i] === 'f' || s[i] === 'F') {
    i++;
    size = FLOAT_SIZE_CHARS[s[i]];
    if (size === undefined) throw new ParseError('RC_INVALID_FP_OPERAND', cursor);
    i++;
  } else {
    throw new ParseError('RC_INVALID_MEMORY_OPERAND', cursor);
  }

  cursor.i = i;
  const value = readStrtoul(cursor, 16);
  if (value === null) throw new ParseError('RC_INVALID_MEMORY_OPERAND', cursor);

  const address = value > 0xffffffffn ? 0xffffffff : Number(value);
  return { size, address: address >>> 0 };
}

/* ------------------------------------------------------------------ */
/* Float decoding (rc_build_float and friends)                        */
/* ------------------------------------------------------------------ */

const floatView = new DataView(new ArrayBuffer(4));

export function f32ToBits(f) {
  floatView.setFloat32(0, f, true);
  return floatView.getUint32(0, true);
}

export function bitsToF32(bits) {
  floatView.setUint32(0, bits >>> 0, true);
  return floatView.getFloat32(0, true);
}

/** Mirrors rc_build_float. */
function buildFloat(mantissaBits, exponent, sign) {
  const impliedBit = 1 << 23;
  let dbl = (mantissaBits | impliedBit) / impliedBit;

  if (exponent > 127) {
    dbl = mantissaBits === 0 ? Infinity : NaN;
  } else if (exponent > 0) {
    dbl *= Math.pow(2, exponent);
  } else if (exponent < 0) {
    if (exponent === -127) {
      /* denormalized */
      dbl = mantissaBits / impliedBit;
      exponent = 126;
    } else {
      exponent = -exponent;
    }
    dbl /= Math.pow(2, exponent);
  }

  return Math.fround(sign ? -dbl : dbl);
}

function transformFloat(u32) {
  const mantissa = u32 & 0x7fffff;
  const exponent = ((u32 >>> 23) & 0xff) - 127;
  const sign = u32 & 0x80000000;
  return buildFloat(mantissa, exponent, sign);
}

function transformFloatBE(u32) {
  const mantissa = ((u32 & 0xff000000) >>> 24) |
                   ((u32 & 0x00ff0000) >>> 8) |
                   ((u32 & 0x00007f00) << 8);
  const exponent = (((u32 & 0x0000007f) << 1) | ((u32 & 0x00008000) >>> 15)) - 127;
  const sign = u32 & 0x00000080;
  return buildFloat(mantissa, exponent, sign);
}

function transformDouble32(u32) {
  const mantissa = (u32 & 0x000fffff) << 3;
  const exponent = ((u32 >>> 20) & 0x7ff) - 1023;
  const sign = u32 & 0x80000000;
  return buildFloat(mantissa, exponent, sign);
}

function transformDouble32BE(u32) {
  const mantissa = (((u32 & 0xff000000) >>> 24) |
                    ((u32 & 0x00ff0000) >>> 8) |
                    ((u32 & 0x00000f00) << 8)) << 3;
  const exponent = (((u32 & 0x0000007f) << 4) | ((u32 & 0x0000f000) >>> 12)) - 1023;
  const sign = u32 & 0x00000080;
  return buildFloat(mantissa, exponent, sign);
}

function transformMBF32(u32) {
  const mantissa = ((u32 & 0xff000000) >>> 24) |
                   ((u32 & 0x00ff0000) >>> 8) |
                   ((u32 & 0x00007f00) << 8);
  const exponent = (u32 & 0xff) - 129;
  const sign = u32 & 0x00008000;

  if (mantissa === 0 && exponent === -129) return sign ? -0.0 : 0.0;
  return buildFloat(mantissa, exponent, sign);
}

function transformMBF32LE(u32) {
  const mantissa = u32 & 0x007fffff;
  const exponent = (u32 >>> 24) - 129;
  const sign = u32 & 0x00800000;

  if (mantissa === 0 && exponent === -129) return sign ? -0.0 : 0.0;
  return buildFloat(mantissa, exponent, sign);
}

const BITS_SET = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Mirrors rc_transform_memref_value: convert a raw (shared-size) read to the
 * operand's requested size - masking, bit extraction, byte swapping or float
 * decoding. Operates in place on a typed value.
 */
export function transformMemrefValue(tv, size) {
  if (tv.type !== U32) {
    /* value already decoded (float-typed modified memref); in C this relies
     * on union punning which round-trips losslessly, so it's a no-op here */
    return tv;
  }

  const v = tv.value >>> 0;
  switch (size) {
    case SIZE_8: tv.value = v & 0x000000ff; break;
    case SIZE_16: tv.value = v & 0x0000ffff; break;
    case SIZE_24: tv.value = v & 0x00ffffff; break;
    case SIZE_32: break;
    case SIZE_BIT0: tv.value = (v >>> 0) & 1; break;
    case SIZE_BIT1: tv.value = (v >>> 1) & 1; break;
    case SIZE_BIT2: tv.value = (v >>> 2) & 1; break;
    case SIZE_BIT3: tv.value = (v >>> 3) & 1; break;
    case SIZE_BIT4: tv.value = (v >>> 4) & 1; break;
    case SIZE_BIT5: tv.value = (v >>> 5) & 1; break;
    case SIZE_BIT6: tv.value = (v >>> 6) & 1; break;
    case SIZE_BIT7: tv.value = (v >>> 7) & 1; break;
    case SIZE_LOW: tv.value = v & 0x0f; break;
    case SIZE_HIGH: tv.value = (v >>> 4) & 0x0f; break;
    case SIZE_BITCOUNT:
      tv.value = BITS_SET[v & 0x0f] + BITS_SET[(v >>> 4) & 0x0f];
      break;
    case SIZE_16_BE:
      tv.value = ((v & 0xff00) >>> 8) | ((v & 0x00ff) << 8);
      break;
    case SIZE_24_BE:
      tv.value = ((v & 0xff0000) >>> 16) | (v & 0x00ff00) | ((v & 0x0000ff) << 16);
      break;
    case SIZE_32_BE:
      tv.value = (((v & 0xff000000) >>> 24) | ((v & 0x00ff0000) >>> 8) |
                  ((v & 0x0000ff00) << 8) | ((v & 0x000000ff) << 24)) >>> 0;
      break;
    case SIZE_FLOAT: tv.value = transformFloat(v); tv.type = F32; break;
    case SIZE_FLOAT_BE: tv.value = transformFloatBE(v); tv.type = F32; break;
    case SIZE_DOUBLE32: tv.value = transformDouble32(v); tv.type = F32; break;
    case SIZE_DOUBLE32_BE: tv.value = transformDouble32BE(v); tv.type = F32; break;
    case SIZE_MBF32: tv.value = transformMBF32(v); tv.type = F32; break;
    case SIZE_MBF32_LE: tv.value = transformMBF32LE(v); tv.type = F32; break;
    default: break;
  }
  return tv;
}

/* ------------------------------------------------------------------ */
/* Reading memory                                                     */
/* ------------------------------------------------------------------ */

const SIZE_BYTES = { [SIZE_8]: 1, [SIZE_16]: 2, [SIZE_32]: 4 };

/**
 * Mirrors rc_peek_value: read a value of the given size using the peek
 * callback `peek(address, numBytes) -> number` (little-endian reads).
 */
export function peekValue(address, size, peek) {
  if (!peek) return 0;

  const bytes = SIZE_BYTES[size];
  if (bytes !== undefined) return peek(address, bytes) >>> 0;

  const sharedSize = memrefSharedSize(size);
  const value = peekValue(address, sharedSize, peek);
  return (value & memrefMask(size)) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Memref records                                                     */
/* ------------------------------------------------------------------ */

export const MEMREF_PLAIN = 'memref';
export const MEMREF_MODIFIED = 'modified';

/* internal-use operator names for modified memrefs */
export const OP_SUB_PARENT = 'subParent';
export const OP_ADD_ACCUMULATOR = 'addAccumulator';
export const OP_SUB_ACCUMULATOR = 'subAccumulator';
export const OP_INDIRECT_READ = 'indirectRead';

/** Mirrors rc_update_memref_value: track prior + changed. */
export function updateMemrefValue(memref, newValue) {
  newValue = newValue >>> 0;
  if (memref.value === newValue) {
    memref.changed = false;
  } else {
    memref.prior = memref.value;
    memref.value = newValue;
    memref.changed = true;
  }
}

/**
 * Mirrors rc_get_memref_value. `accessType` is an operand type; 'delta'
 * yields the value from the previous frame, 'prior' the last differing
 * value, anything else the current value.
 *
 * The stored value is a raw u32 bit pattern; float-typed memrefs
 * reinterpret it as an IEEE 754 float (union punning in C).
 */
export function getMemrefValue(memref, accessType) {
  let raw;
  if (accessType === 'delta') raw = memref.changed ? memref.prior : memref.value;
  else if (accessType === 'prior') raw = memref.prior;
  else raw = memref.value;

  if (memref.type === F32) return typedValue(F32, bitsToF32(raw));
  return typedValue(U32, raw >>> 0);
}

/** Mirrors rc_get_modified_memref_value. Returns the raw u32 bit pattern. */
export function getModifiedMemrefValue(memref, peek) {
  const value = evaluateOperand(memref.parent, null);
  const modifier = evaluateOperand(memref.modifier, null);

  switch (memref.modifierType) {
    case OP_INDIRECT_READ:
      tvAdd(value, modifier);
      tvConvert(value, U32);
      /* the raw read already matches the stored bit pattern for the
       * memref's value type (union punning in C) */
      return peekValue(value.value, memref.size, peek);

    case OP_SUB_PARENT:
      /* sub parent is "-parent + modifier" */
      tvNegate(value);
      tvAdd(value, modifier);
      break;

    case OP_SUB_ACCUMULATOR:
      tvNegate(modifier);
      /* fallthrough to add accumulator */
    case OP_ADD_ACCUMULATOR:
      /* force the modifier to the accumulator's type instead of promoting
       * both to the less restrictive type (see memref.c for rationale) */
      tvConvert(modifier, value.type);
      tvAdd(value, modifier);
      break;

    default:
      tvCombine(value, modifier, memref.modifierType);
      break;
  }

  tvConvert(value, memref.type);
  return memref.type === F32 ? f32ToBits(value.value) : value.value >>> 0;
}

/** Mirrors rc_operands_are_equal (used to de-duplicate modified memrefs). */
export function operandsAreEqual(left, right) {
  if (left === right) return true;
  if (left.type !== right.type) return false;

  switch (left.type) {
    case 'const': return left.num === right.num;
    case 'fp': return left.dbl === right.dbl;
    case 'recall': return left.memref === right.memref;
    default: break;
  }

  if (left.size !== right.size || left.memref.kind !== right.memref.kind)
    return false;

  if (left.memref.kind === MEMREF_MODIFIED) {
    return left.memref.modifierType === right.memref.modifierType &&
           left.memref.depth === right.memref.depth &&
           operandsAreEqual(left.memref.modifier, right.memref.modifier) &&
           operandsAreEqual(left.memref.parent, right.memref.parent);
  }

  return left.memref.address === right.memref.address &&
         left.memref.size === right.memref.size;
}

/**
 * Registry of all memrefs used by a trigger. Mirrors rc_memrefs_t.
 */
export class Memrefs {
  constructor() {
    /** @type {Array} plain memrefs in creation order */
    this.memrefs = [];
    this._byKey = new Map();
    /** @type {Array} modified memrefs in creation order */
    this.modifiedMemrefs = [];
  }

  /** Mirrors rc_alloc_memref: shared per address+size. */
  allocMemref(address, size) {
    const key = `${address}:${size}`;
    let memref = this._byKey.get(key);
    if (memref) return memref;

    memref = {
      kind: MEMREF_PLAIN,
      address,
      size,
      type: U32,
      value: 0,
      prior: 0,
      changed: false,
    };
    this._byKey.set(key, memref);
    this.memrefs.push(memref);
    return memref;
  }

  /** Mirrors rc_alloc_modified_memref: de-duplicated on full equality. */
  allocModifiedMemref(size, parent, modifierType, modifier) {
    for (const existing of this.modifiedMemrefs) {
      if (existing.size === size &&
          existing.modifierType === modifierType &&
          operandsAreEqual(existing.parent, parent) &&
          operandsAreEqual(existing.modifier, modifier)) {
        return existing;
      }
    }

    const memref = {
      kind: MEMREF_MODIFIED,
      address: operandIsMemref(modifier) ? modifier.memref.address : (modifier.num ?? 0),
      size,
      type: memsizeIsFloat(size) ? F32 : U32,
      value: 0,
      prior: 0,
      changed: false,
      parent: { ...parent },
      modifier: { ...modifier },
      modifierType,
      depth: 0,
    };

    if (operandIsMemref(parent) && parent.memref.kind === MEMREF_MODIFIED)
      memref.depth = parent.memref.depth + 1;

    this.modifiedMemrefs.push(memref);
    return memref;
  }

  /** Mirrors rc_update_memref_values: refresh all values for this frame. */
  update(peek) {
    for (const memref of this.memrefs)
      updateMemrefValue(memref, peekValue(memref.address, memref.size, peek));

    for (const memref of this.modifiedMemrefs)
      updateMemrefValue(memref, getModifiedMemrefValue(memref, peek));
  }

  /** Reset all tracked values (used when priming a fresh recording run). */
  resetValues() {
    for (const memref of [...this.memrefs, ...this.modifiedMemrefs]) {
      memref.value = 0;
      memref.prior = 0;
      memref.changed = false;
    }
  }
}
