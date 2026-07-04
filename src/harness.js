/**
 * Test harness helpers: run a trigger against recorded memory, frame by
 * frame, and find out exactly when it pops.
 *
 * Not part of rcheevos itself - this is the glue for testing achievement
 * definitions (e.g. from @cruncheevos/core) against memory recordings
 * (e.g. captured with a BizHawk Lua script).
 */

import { parseTrigger } from './trigger.js';

/**
 * Build the rcheevos trigger string for a cruncheevos Achievement (or
 * anything with a `conditions` array of groups of stringifiable conditions).
 */
export function achievementToTriggerDefinition(achievement) {
  if (typeof achievement === 'string') return achievement;

  const groups = achievement.conditions;
  if (!Array.isArray(groups))
    throw new TypeError('expected a trigger string or a cruncheevos Achievement');

  return groups.map((group) => group.map((c) => c.toString()).join('_')).join('S');
}

/**
 * Build a peek function from a memory source. Supported sources:
 *  - a function (address, numBytes) => value : used as-is
 *  - a Uint8Array / number[]                 : full memory dump
 *  - a Map or plain object of address -> byte value (sparse bytes;
 *    unrecorded addresses read as 0)
 *
 * Multi-byte reads are composed little-endian, like emulators expose them.
 */
export function createPeek(source) {
  if (typeof source === 'function') return source;

  let readByte;
  if (source instanceof Uint8Array || Array.isArray(source)) {
    readByte = (addr) => (addr < source.length ? source[addr] & 0xff : 0);
  } else if (source instanceof Map) {
    readByte = (addr) => (source.get(addr) ?? 0) & 0xff;
  } else if (source && typeof source === 'object') {
    readByte = (addr) => (source[addr] ?? 0) & 0xff;
  } else {
    throw new TypeError('unsupported memory source');
  }

  return (address, numBytes) => {
    let value = 0;
    for (let i = numBytes - 1; i >= 0; i--)
      value = value * 256 + readByte((address + i) >>> 0); /* wrap like uint32_t */
    return value >>> 0;
  };
}

/**
 * Expand a sparse map of multi-byte values into a byte map. Input entries:
 *   { [address]: value }                      - assumed 1 byte
 *   { [address]: { value, size } }            - size in bytes (1, 2 or 4)
 * Useful when a recording stores e.g. 32-bit watch values.
 */
export function bytesFromValues(values) {
  const bytes = {};
  for (const [addrKey, entry] of Object.entries(values)) {
    const address = Number(addrKey);
    const value = typeof entry === 'object' ? entry.value : entry;
    const size = typeof entry === 'object' ? (entry.size ?? 1) : 1;
    for (let i = 0; i < size; i++)
      bytes[address + i] = Math.floor(value / Math.pow(256, i)) & 0xff;
  }
  return bytes;
}

/**
 * Drives one trigger across successive memory frames, mimicking how an
 * emulator runs an active achievement: the trigger starts in the 'waiting'
 * state, so it cannot pop while its conditions are already true on the
 * very first frame (the "unearned achievement you'd instantly earn on
 * load" protection).
 */
export class TriggerRunner {
  /**
   * @param definition trigger string or cruncheevos Achievement
   */
  constructor(definition) {
    this.definition = achievementToTriggerDefinition(definition);
    this.trigger = parseTrigger(this.definition);
    this.frame = -1;
    this.triggeredFrame = null;
    /** @type {string[]} state returned for each frame */
    this.states = [];
  }

  /**
   * Advance one frame. Returns the trigger state for this frame
   * ('waiting', 'active', 'paused', 'primed', 'reset', 'triggered', ...).
   */
  tick(memory) {
    const peek = createPeek(memory);
    this.frame++;
    const state = this.trigger.evaluate(peek);
    this.states.push(state);
    if (state === 'triggered' && this.triggeredFrame === null)
      this.triggeredFrame = this.frame;
    return state;
  }

  get measuredValue() {
    return this.trigger.measuredValue;
  }

  get measuredTarget() {
    return this.trigger.measuredTarget;
  }

  reset() {
    this.trigger.reset();
    this.frame = -1;
    this.triggeredFrame = null;
    this.states = [];
  }
}

/**
 * Run a trigger over a full recording.
 *
 * @param definition trigger string or cruncheevos Achievement
 * @param frames     iterable of memory sources (one per frame)
 * @returns {{ triggeredFrame: number|null, states: string[] }}
 *          triggeredFrame is the 0-based index of the frame the achievement
 *          popped on, or null if it never popped.
 */
export function runTrigger(definition, frames) {
  const runner = new TriggerRunner(definition);
  for (const frame of frames) {
    if (runner.tick(frame) === 'triggered') break;
  }
  return { triggeredFrame: runner.triggeredFrame, states: runner.states };
}
