/**
 * Port of rcheevos' rc_typed_value_t and its arithmetic (src/rcheevos/value.c).
 *
 * Values flowing through the engine are tagged unions of:
 *   'u32'  - unsigned 32-bit integer
 *   'i32'  - signed 32-bit integer
 *   'f32'  - 32-bit IEEE 754 float
 *   'none' - no value
 *
 * All arithmetic reproduces C semantics: wrapping 32-bit integer math and
 * single-precision float math (via Math.fround).
 */

export const U32 = 'u32';
export const I32 = 'i32';
export const F32 = 'f32';
export const NONE = 'none';

const FLT_EPSILON = 1.1920928955078125e-7;

export function typedValue(type, value) {
  return { type, value };
}

/** In-place conversion, mirrors rc_typed_value_convert. */
export function convert(tv, newType) {
  if (tv.type === newType) return tv;

  switch (newType) {
    case U32:
      switch (tv.type) {
        case I32: tv.value = tv.value >>> 0; break;
        case F32: tv.value = Math.trunc(tv.value) >>> 0; break;
        default: tv.value = 0; break;
      }
      break;

    case I32:
      switch (tv.type) {
        case U32: tv.value = tv.value | 0; break;
        case F32: tv.value = Math.trunc(tv.value) | 0; break;
        default: tv.value = 0; break;
      }
      break;

    case F32:
      switch (tv.type) {
        case U32:
        case I32: tv.value = Math.fround(tv.value); break;
        default: tv.value = 0.0; break;
      }
      break;

    default:
      break;
  }

  tv.type = newType;
  return tv;
}

function convertInto(source, newType) {
  return convert({ type: source.type, value: source.value }, newType);
}

/** Mirrors rc_typed_value_negate. */
export function negate(tv) {
  switch (tv.type) {
    case U32:
      convert(tv, I32);
      /* fallthrough */
    case I32:
      tv.value = (-tv.value) | 0;
      break;
    case F32:
      tv.value = -tv.value;
      break;
    default:
      break;
  }
}

/** Mirrors rc_typed_value_add (in-place on `tv`). */
export function add(tv, amount) {
  if (amount.type !== tv.type && tv.type !== NONE) {
    if (amount.type === F32) convert(tv, F32);
    else amount = convertInto(amount, tv.type);
  }

  switch (tv.type) {
    case U32: tv.value = (tv.value + amount.value) >>> 0; break;
    case I32: tv.value = (tv.value + amount.value) | 0; break;
    case F32: tv.value = Math.fround(tv.value + amount.value); break;
    case NONE:
      tv.type = amount.type;
      tv.value = amount.value;
      break;
    default: break;
  }
}

/** Mirrors rc_typed_value_multiply. */
export function multiply(tv, amount) {
  switch (tv.type) {
    case U32:
      switch (amount.type) {
        case U32:
        case I32:
          /* C unsigned multiplication: truncating, two's complement */
          tv.value = Math.imul(tv.value, amount.value) >>> 0;
          break;
        case F32:
          convert(tv, F32);
          tv.value = Math.fround(tv.value * amount.value);
          break;
        default:
          tv.type = NONE;
          break;
      }
      break;

    case I32:
      switch (amount.type) {
        case I32:
        case U32:
          tv.value = Math.imul(tv.value, amount.value) | 0;
          break;
        case F32:
          convert(tv, F32);
          tv.value = Math.fround(tv.value * amount.value);
          break;
        default:
          tv.type = NONE;
          break;
      }
      break;

    case F32:
      if (amount.type === NONE) {
        tv.type = NONE;
      } else {
        const amt = convertInto(amount, F32);
        tv.value = Math.fround(tv.value * amt.value);
      }
      break;

    default:
      tv.type = NONE;
      break;
  }
}

/** Mirrors rc_typed_value_divide. Division by zero yields type NONE. */
export function divide(tv, amount) {
  switch (amount.type) {
    case U32:
    case I32:
      if (amount.value === 0) { tv.type = NONE; return; }

      switch (tv.type) {
        case U32:
          if (amount.type === U32) tv.value = Math.floor(tv.value / amount.value) >>> 0;
          else tv.value = Math.trunc(tv.value / (amount.value >>> 0)) >>> 0;
          return;
        case I32:
          if (amount.type === I32) tv.value = Math.trunc(tv.value / amount.value) | 0;
          else tv.value = Math.trunc(tv.value / (amount.value | 0)) | 0;
          return;
        case F32:
          amount = convertInto(amount, F32);
          break;
        default:
          tv.type = NONE;
          return;
      }
      break;

    case F32:
      break;

    default:
      tv.type = NONE;
      return;
  }

  if (amount.value === 0.0) { tv.type = NONE; return; }

  convert(tv, F32);
  tv.value = Math.fround(tv.value / amount.value);
}

/** Mirrors rc_typed_value_modulus. Modulus by zero yields type NONE. */
export function modulus(tv, amount) {
  switch (amount.type) {
    case U32:
    case I32:
      if (amount.value === 0) { tv.type = NONE; return; }

      switch (tv.type) {
        case U32:
          tv.value = (tv.value % (amount.type === U32 ? amount.value : amount.value >>> 0)) >>> 0;
          return;
        case I32:
          /* JS % is truncated like C99 */
          tv.value = (tv.value % (amount.type === I32 ? amount.value : amount.value | 0)) | 0;
          return;
        case F32:
          amount = convertInto(amount, F32);
          break;
        default:
          tv.type = NONE;
          return;
      }
      break;

    case F32:
      break;

    default:
      tv.type = NONE;
      return;
  }

  if (amount.value === 0.0) { tv.type = NONE; return; }

  convert(tv, F32);
  tv.value = Math.fround(tv.value % amount.value); /* fmodf */
}

/** Mirrors rc_typed_value_combine. `amount` may be mutated (as in C). */
export function combine(tv, amount, oper) {
  switch (oper) {
    case 'mult': multiply(tv, amount); break;
    case 'div': divide(tv, amount); break;
    case 'and':
      convert(tv, U32); convert(amount, U32);
      tv.value = (tv.value & amount.value) >>> 0;
      break;
    case 'xor':
      convert(tv, U32); convert(amount, U32);
      tv.value = (tv.value ^ amount.value) >>> 0;
      break;
    case 'mod': modulus(tv, amount); break;
    case 'add': add(tv, amount); break;
    case 'sub':
      negate(amount);
      add(tv, amount);
      break;
    default:
      break;
  }
}

/* Mirrors rc_typed_value_compare_floats: approximate equality within
 * FLT_EPSILON relative to the smaller magnitude. */
function compareFloats(f1, f2, oper) {
  if (f1 !== f2) {
    const abs1 = f1 < 0 ? -f1 : f1;
    const abs2 = f2 < 0 ? -f2 : f2;
    const threshold = Math.fround((abs1 < abs2 ? abs1 : abs2) * FLT_EPSILON);
    const diff = Math.fround(f1 - f2);
    const absDiff = diff < 0 ? -diff : diff;

    if (absDiff <= threshold) {
      /* approximately equal */
    } else if (diff > threshold) {
      return (oper === 'ne' || oper === 'gt' || oper === 'ge') ? 1 : 0;
    } else {
      return (oper === 'ne' || oper === 'lt' || oper === 'le') ? 1 : 0;
    }
  }

  return (oper === 'eq' || oper === 'ge' || oper === 'le') ? 1 : 0;
}

function compareNumbers(v1, v2, oper) {
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

/** Mirrors rc_typed_value_compare. Returns 0/1. */
export function compare(value1, value2, oper) {
  if (value2.type !== value1.type) {
    /* if either side is a float, compare as floats;
     * otherwise assume the signed-ness of the left side */
    if (value2.type === F32) value1 = convertInto(value1, F32);
    else value2 = convertInto(value2, value1.type);
  }

  switch (value1.type) {
    case U32:
    case I32:
      return compareNumbers(value1.value, value2.value, oper);
    case F32:
      return compareFloats(value1.value, value2.value, oper);
    default:
      return 1;
  }
}
