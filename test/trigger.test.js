/**
 * Trigger state machine and group logic tests, ported from rcheevos'
 * test/rcheevos/test_trigger.c (the JS engine is additionally verified
 * against the compiled C library by tools/difftest/fuzz.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrigger } from '../src/index.js';

function makeMemory(bytes) {
  const ram = Uint8Array.from(bytes);
  const peek = (address, numBytes) => {
    let value = 0;
    for (let i = numBytes - 1; i >= 0; i--) {
      const a = (address + i) >>> 0;
      value = value * 256 + (a < ram.length ? ram[a] : 0);
    }
    return value >>> 0;
  };
  return { ram, peek };
}

test('alt groups: core AND at least one alt', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0001=16S0xH0002=52S0xL0004=6');

  /* core not true, both alts are */
  assert.equal(trigger.test(peek), false);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [0, 1, 1]);

  /* core and both alts true */
  ram[1] = 16;
  assert.equal(trigger.test(peek), true);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [1, 2, 2]);

  /* core and first alt true */
  ram[4] = 0;
  assert.equal(trigger.test(peek), true);

  /* core true, but neither alt */
  ram[2] = 0;
  assert.equal(trigger.test(peek), false);

  /* core and second alt true */
  ram[4] = 6;
  assert.equal(trigger.test(peek), true);
});

test('empty core is implicitly true', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('S0xH0002=2S0xL0004=4');

  assert.equal(trigger.test(peek), false);
  ram[2] = 2;
  assert.equal(trigger.test(peek), true);
});

test('empty alt is implicitly true', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0002=2SS0xL0004=4');

  assert.equal(trigger.test(peek), false);
  ram[2] = 2;
  assert.equal(trigger.test(peek), true);
});

test('ResetIf in alt group resets everything', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0001=18(1)_R:0xH0000=1S0xH0002=52(1)S0xL0004=6(1)_R:0xH0000=2');

  /* all conditions true, no resets */
  assert.equal(trigger.test(peek), true);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [1, 1, 1]);

  /* reset in core group resets everything */
  trigger.state = 'active';
  ram[0] = 1;
  assert.equal(trigger.test(peek), false);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [0, 0, 0]);

  /* all conditions true again */
  ram[0] = 0;
  assert.equal(trigger.test(peek), true);

  /* reset in alt group resets everything */
  trigger.state = 'active';
  ram[0] = 2;
  assert.equal(trigger.test(peek), false);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [0, 0, 0]);
});

test('PauseIf only pauses its own group', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0001=18_P:0xH0000=1S0xH0002=52S0xL0004=6_P:0xH0000=2');

  assert.equal(trigger.test(peek), true);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [1, 1, 1]);

  /* pause in core group only pauses core group */
  ram[0] = 1;
  assert.equal(trigger.test(peek), false);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [1, 2, 2]);

  /* unpaused */
  ram[0] = 0;
  assert.equal(trigger.test(peek), true);

  /* pause in alt group only pauses alt group */
  ram[0] = 2;
  assert.equal(trigger.test(peek), true);
  assert.deepEqual([trigger.getHitCount(0, 0), trigger.getHitCount(1, 0), trigger.getHitCount(2, 0)], [3, 4, 3]);
});

test('paused group protects hit counts from ResetIf in same group', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0000=0.1._0xH0003=2SP:0xH0001=18_R:0xH0002=52');

  /* capture hitcount */
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 0), 1);

  /* prevent future hit counts */
  ram[0] = 1;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 0), 1);

  /* unpause alt group, hit count should be reset */
  ram[1] = 16;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 0), 0);

  /* repause alt group, capture hitcount */
  ram[0] = 0;
  ram[1] = 18;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 0), 1);

  /* trigger condition true, but alt group paused: considered false */
  ram[3] = 2;
  assert.equal(trigger.test(peek), false);

  /* alt group unpaused, so reset prevents trigger */
  ram[1] = 16;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 0), 0);

  /* unpaused and not resetting: trigger */
  ram[2] = 30;
  assert.equal(trigger.test(peek), true);
});

test('PauseIf with hit count stays paused; ResetIf in paused group ignored', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0001=18_P:0xH0002=52.1._R:0xH0003=1SR:0xH0003=2');

  /* pauseif true, non-pauseif conditions ignored */
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 1), 1);

  /* pause condition no longer true, but hitcount keeps it paused */
  ram[2] = 0;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 1), 1);

  /* resetif in paused group is ignored */
  ram[3] = 1;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 1), 1);

  /* resetif in alt group is honored, resets the pauseif hit count */
  ram[3] = 2;
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 1), 0);

  /* resetif no longer active, pause not active, trigger fires */
  ram[3] = 3;
  assert.equal(trigger.test(peek), true);
});

test('Measured: hit count progress', () => {
  const { peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('M:0xH0002=52(3)');
  assert.equal(trigger.measuredAsPercent, false);
  assert.equal(trigger.measuredTarget, 3);

  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.measuredValue, 1);
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.measuredValue, 2);
  assert.equal(trigger.test(peek), true);
  assert.equal(trigger.measuredValue, 3);
});

test('Measured: value comparison and percent flag', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0x00, 0x00]);
  const trigger = parseTrigger('G:0x 0003>=1000');
  assert.equal(trigger.measuredAsPercent, true);
  assert.equal(trigger.measuredTarget, 1000);

  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.measuredValue, 0);

  ram[3] = 0xe8; ram[4] = 0x03; /* 1000 */
  assert.equal(trigger.test(peek), true);
  assert.equal(trigger.measuredValue, 1000);
});

test('evaluate: inactive is permanent, updates memrefs, ignores resets', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0001=18_0xH0002<=52_R:0xL0004=4');
  trigger.state = 'inactive';

  assert.equal(trigger.evaluate(peek), 'inactive');
  assert.equal(trigger.evaluate(peek), 'inactive');
  ram[2] = 24;
  assert.equal(trigger.evaluate(peek), 'inactive');
  ram[1] = 1;
  assert.equal(trigger.evaluate(peek), 'inactive');

  /* hits should not be tallied when inactive */
  assert.equal(trigger.getHitCount(0, 0), 0);
  assert.equal(trigger.getHitCount(0, 1), 0);

  /* memrefs should be updated while inactive */
  const memref = trigger.requirement.conditions[1].operand1.memref;
  assert.equal(memref.value, 24);
  assert.equal(memref.changed, false);
  assert.equal(memref.prior, 52);
});

test('evaluate: waiting until trigger is false once', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x18, 0xab, 0x09]);
  const trigger = parseTrigger('0xH0001=18_0xH0002<=52_R:0xL0004=4');
  assert.equal(trigger.state, 'waiting');

  /* trigger is ready to fire, but won't as long as it's waiting */
  assert.equal(trigger.evaluate(peek), 'waiting');
  assert.equal(trigger.evaluate(peek), 'waiting');
  ram[2] = 16;
  assert.equal(trigger.evaluate(peek), 'waiting');
  assert.equal(trigger.hasHits, false);

  /* ResetIf makes the trigger state false, so the trigger becomes active */
  ram[4] = 4;
  assert.equal(trigger.evaluate(peek), 'active');

  /* back to waiting */
  trigger.state = 'waiting';
  ram[4] = 9;
  assert.equal(trigger.evaluate(peek), 'waiting');
  assert.equal(trigger.hasHits, false);

  /* trigger no longer true, proceed to active state */
  ram[1] = 5;
  assert.equal(trigger.evaluate(peek), 'active');
  assert.equal(trigger.hasHits, true);
  assert.equal(trigger.getHitCount(0, 0), 0);
  assert.equal(trigger.getHitCount(0, 1), 1);
});

test('evaluate: ResetIf that clears hits returns reset without changing state', () => {
  const { ram, peek } = makeMemory([0x00, 0x05, 0x10, 0xab, 0x09]);
  const trigger = parseTrigger('0xH0001=18_0xH0002<=52_R:0xL0004=4');
  trigger.state = 'active';

  assert.equal(trigger.evaluate(peek), 'active');
  assert.equal(trigger.hasHits, true);

  ram[4] = 4;
  assert.equal(trigger.evaluate(peek), 'reset');
  assert.equal(trigger.state, 'active');
  assert.equal(trigger.hasHits, false);

  /* ResetIf with nothing to reset doesn't return reset */
  assert.equal(trigger.evaluate(peek), 'active');
});

test('evaluate: triggered is permanent and stops updating', () => {
  const { ram, peek } = makeMemory([0x00, 0x05, 0x10, 0xab, 0x09]);
  const trigger = parseTrigger('0xH0001=18_0xH0002<=52_R:0xL0004=4');
  trigger.state = 'active';

  ram[1] = 18;
  assert.equal(trigger.evaluate(peek), 'triggered');
  assert.equal(trigger.getHitCount(0, 0), 1);

  /* remains triggered, returns inactive, does not tally */
  assert.equal(trigger.evaluate(peek), 'inactive');
  assert.equal(trigger.state, 'triggered');
  assert.equal(trigger.getHitCount(0, 0), 1);

  ram[1] = 5;
  assert.equal(trigger.evaluate(peek), 'inactive');
  assert.equal(trigger.state, 'triggered');
});

test('evaluate: paused state transitions', () => {
  const { ram, peek } = makeMemory([0x00, 0x12, 0x34, 0xab, 0x56]);
  const trigger = parseTrigger('0xH0001=18_0xH0003=171_P:0xH0002=1SR:0xH0004=4');

  /* unpause, waiting; ready to trigger, stays waiting */
  ram[2] = 2;
  trigger.state = 'waiting';
  assert.equal(trigger.evaluate(peek), 'waiting');

  /* PauseIf makes evaluation false: transition to paused */
  ram[2] = 1;
  assert.equal(trigger.evaluate(peek), 'paused');
  assert.equal(trigger.hasHits, true); /* the PauseIf has a hit */
  assert.equal(trigger.getHitCount(0, 0), 0);

  /* hitcounts update when unpaused */
  ram[2] = 2;
  ram[3] = 99;
  assert.equal(trigger.evaluate(peek), 'active');
  assert.equal(trigger.getHitCount(0, 0), 1);

  /* hitcounts remain while paused */
  ram[2] = 1;
  assert.equal(trigger.evaluate(peek), 'paused');
  assert.equal(trigger.getHitCount(0, 0), 1);

  /* ResetIf while paused notifies but doesn't change state */
  ram[4] = 4;
  assert.equal(trigger.evaluate(peek), 'reset');
  assert.equal(trigger.state, 'paused');
  assert.equal(trigger.getHitCount(0, 0), 0);

  /* ResetIf without hitcounts returns current state */
  assert.equal(trigger.evaluate(peek), 'paused');

  /* trigger while paused is ignored */
  ram[4] = 0;
  ram[3] = 171;
  assert.equal(trigger.evaluate(peek), 'paused');

  /* fires when unpaused */
  ram[2] = 2;
  assert.equal(trigger.evaluate(peek), 'triggered');

  /* triggered ignores pause */
  ram[2] = 1;
  assert.equal(trigger.evaluate(peek), 'inactive');
  assert.equal(trigger.state, 'triggered');
});

test('evaluate: primed when only Trigger conditions are false', () => {
  const { ram, peek } = makeMemory([0x00, 0x01, 0x00, 0x01, 0x00]);
  const trigger = parseTrigger('0xH0000=1_T:0xH0001=1_0xH0002=1_T:0xH0003=1_0xH0004=1');
  trigger.state = 'active';

  /* T conditions true, but nothing else */
  assert.equal(trigger.evaluate(peek), 'active');

  /* one non-trigger condition still false */
  ram[0] = ram[2] = 1;
  assert.equal(trigger.evaluate(peek), 'active');

  /* all non-trigger conditions true, one trigger condition not true */
  ram[1] = 0; ram[4] = 1;
  assert.equal(trigger.evaluate(peek), 'primed');

  /* non-trigger condition false again */
  ram[0] = 0;
  assert.equal(trigger.evaluate(peek), 'active');

  /* all conditions true */
  ram[0] = ram[1] = 1;
  assert.equal(trigger.evaluate(peek), 'triggered');
});

test('evaluate: primed with Trigger conditions in alts', () => {
  const { ram, peek } = makeMemory([0x01, 0x00, 0x00, 0x00, 0x00]);
  const trigger = parseTrigger('0xH0000=1ST:0xH0001=1_0xH0002=1ST:0xH0003=1_0xH0004=1');
  trigger.state = 'active';

  /* core is true, but neither alt is primed */
  assert.equal(trigger.evaluate(peek), 'active');

  /* both alts primed */
  ram[2] = ram[4] = 1;
  assert.equal(trigger.evaluate(peek), 'primed');

  /* only second alt primed */
  ram[4] = 0;
  assert.equal(trigger.evaluate(peek), 'primed');

  /* neither primed */
  ram[2] = 0;
  assert.equal(trigger.evaluate(peek), 'active');

  /* both primed, then alt 2 true */
  ram[2] = ram[4] = 1;
  assert.equal(trigger.evaluate(peek), 'primed');
  ram[3] = 1;
  assert.equal(trigger.evaluate(peek), 'triggered');
});

test('evaluate: chained ResetNextIf', () => {
  const { ram, peek } = makeMemory([0x00, 0x00, 0x00, 0x00, 0x00]);
  const trigger = parseTrigger('O:0xH0001=1_Z:0xH0002=1_Z:0xH0003=1.2._0xH0004=1.1._T:0xH0000=1');
  trigger.state = 'active';

  assert.equal(trigger.evaluate(peek), 'active');

  /* non-trigger condition is true */
  ram[4] = 1;
  assert.equal(trigger.evaluate(peek), 'primed');
  assert.equal(trigger.getHitCount(0, 3), 1);

  /* second ResetNextIf is true */
  ram[3] = 1;
  assert.equal(trigger.evaluate(peek), 'primed');
  assert.equal(trigger.getHitCount(0, 2), 1);

  /* OrNext resets second ResetNextIf */
  ram[1] = 1;
  assert.equal(trigger.evaluate(peek), 'reset');
  assert.equal(trigger.state, 'primed');
  assert.equal(trigger.getHitCount(0, 0), 1);
  assert.equal(trigger.getHitCount(0, 1), 1);
  assert.equal(trigger.getHitCount(0, 2), 0);
  assert.equal(trigger.getHitCount(0, 3), 1);

  /* OrNext no longer true */
  ram[1] = 0;
  assert.equal(trigger.evaluate(peek), 'primed');
  assert.equal(trigger.getHitCount(0, 2), 1);

  /* second ResetNextIf fires */
  assert.equal(trigger.evaluate(peek), 'reset');
  assert.equal(trigger.state, 'active');
  assert.equal(trigger.getHitCount(0, 2), 2);
  assert.equal(trigger.getHitCount(0, 3), 0);
});

test('delta and prior share one memref per address+size', () => {
  const trigger = parseTrigger('0xH0001=d0xH0001_0xH0001!=p0xH0001');
  assert.equal(trigger.memrefs.memrefs.length, 1);
  assert.equal(trigger.memrefs.memrefs[0].address, 1);
});

test('parse errors are reported', () => {
  assert.throws(() => parseTrigger('0xH0001'), /RC_INVALID_OPERATOR/);
  assert.throws(() => parseTrigger('0xZ0001=1'), /RC_INVALID_MEMORY_OPERAND/);
  assert.throws(() => parseTrigger('M:0xH0001=1(3)_M:0xH0002=1(3)'), /RC_MULTIPLE_MEASURED/);
  assert.throws(() => parseTrigger('H0x1234=1'), /RC_INVALID_CONST_OPERAND/);
});
