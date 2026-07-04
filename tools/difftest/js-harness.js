/**
 * JS side of the differential test: same input/output contract as
 * c-harness.c, but runs the rcheevos-js port. Exported as a function so the
 * fuzzer can run it in-process.
 */

import { parseTrigger } from '../../src/engine/trigger.js';

export function runCase(definition, frames /* array of Uint8Array */) {
  const lines = [];

  let trigger;
  try {
    trigger = parseTrigger(definition);
  } catch (e) {
    return [`PARSE_ERROR ${e.code ?? e.message}`];
  }

  for (const ram of frames) {
    const peek = (address, numBytes) => {
      let value = 0;
      for (let i = numBytes - 1; i >= 0; i--) {
        const a = (address + i) >>> 0; /* wrap like uint32_t arithmetic */
        value = value * 256 + (a < ram.length ? ram[a] : 0);
      }
      return value >>> 0;
    };

    const result = trigger.evaluate(peek);

    const groups = [];
    if (trigger.requirement)
      groups.push(trigger.requirement.conditions.map((c) => `${c.currentHits},`).join(''));
    for (const alt of trigger.alternatives)
      groups.push(alt.conditions.map((c) => `${c.currentHits},`).join(''));

    lines.push(
      `${result} ${trigger.state} ${trigger.measuredValue >>> 0} ${trigger.hasHits ? 1 : 0} | ` +
      groups.join(' / '));
  }

  return lines;
}

/* CLI mode: same stdin protocol as the C harness */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const input = readFileSync(0, 'utf8').split('\n');
  const definition = input[0];
  const [frameCount, ramSize] = input[1].split(' ').map(Number);
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const hex = input[2 + f];
    const ram = new Uint8Array(ramSize);
    for (let i = 0; i < ramSize; i++)
      ram[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    frames.push(ram);
  }
  console.log(runCase(definition, frames).join('\n'));
}
