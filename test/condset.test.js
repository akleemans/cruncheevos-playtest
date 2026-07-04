/**
 * Condition/operand behavior tests: flags, sizes, chains, hit logic.
 * Semantics mirror rcheevos' test_condset.c / test_operand.c; the engine is
 * additionally verified against the compiled C library by the fuzzer.
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

/* ------------------------------------------------------------------ */
/* operand sizes                                                      */
/* ------------------------------------------------------------------ */

test('operand sizes', () => {
  const { peek } = makeMemory([0x8a, 0x12, 0x34, 0xab, 0x56]);

  const cases = [
    ['0xH0000=138', true],       /* 8-bit */
    ['0x 0001=13330', true],     /* 16-bit (0x1234 LE) */
    ['0x0001=13330', true],      /* legacy 16-bit */
    ['0xW0001=11219986', true],  /* 24-bit (0xab3412) */
    ['0xX0001=1454060562', true],/* 32-bit (0x56ab3412) */
    ['0xL0000=10', true],        /* low nibble of 0x8a */
    ['0xU0000=8', true],         /* high nibble */
    ['0xM0000=0', true],         /* bit 0 */
    ['0xT0000=1', true],         /* bit 7 */
    ['0xK0000=3', true],         /* bitcount of 0x8a */
    ['0xI0001=4660', true],      /* 16-bit BE (0x1234) */
    ['0xJ0001=1193131', true],   /* 24-bit BE (0x1234ab) */
    ['0xG0001=305441622', true], /* 32-bit BE (0x1234ab56) */
  ];

  for (const [def, expected] of cases) {
    const trigger = parseTrigger(def);
    assert.equal(trigger.test(peek), expected, def);
  }
});

test('BCD and inverted operands', () => {
  const { peek } = makeMemory([0x86, 0x12, 0x34, 0xab, 0x56]);

  assert.equal(parseTrigger('b0xH0000=86').test(peek), true);   /* BCD decode of 0x86 */
  assert.equal(parseTrigger('b0x 0001=3412').test(peek), true); /* BCD of 0x3412 */
  assert.equal(parseTrigger('~0xH0000=121').test(peek), true);  /* 0x86 ^ 0xff */
  assert.equal(parseTrigger('~0xL0000=9').test(peek), true);    /* low nibble 6 ^ 0xf */
});

test('float memory reads', () => {
  /* 1.0f little-endian = 00 00 80 3f */
  const { peek } = makeMemory([0x00, 0x00, 0x80, 0x3f]);
  assert.equal(parseTrigger('fF0000=f1.0').test(peek), true);
  assert.equal(parseTrigger('fF0000>f0.5').test(peek), true);
  assert.equal(parseTrigger('fF0000<f1.5').test(peek), true);
});

/* ------------------------------------------------------------------ */
/* delta / prior                                                      */
/* ------------------------------------------------------------------ */

test('delta: value from previous frame', () => {
  const { ram, peek } = makeMemory([0x00, 0x00]);
  const trigger = parseTrigger('d0xH0000<0xH0000');
  trigger.state = 'active';

  assert.equal(trigger.evaluate(peek), 'active'); /* 0 < 0: false */
  ram[0] = 1;
  assert.equal(trigger.evaluate(peek), 'triggered'); /* delta 0 < current 1 */
});

test('prior: last differing value', () => {
  const { ram, peek } = makeMemory([5]);
  const trigger = parseTrigger('p0xH0000=5_0xH0000=7');
  trigger.state = 'active';

  trigger.evaluate(peek); /* value 5, prior 0 */
  ram[0] = 6;
  trigger.evaluate(peek); /* value 6, prior 5 */
  ram[0] = 7;
  assert.equal(trigger.evaluate(peek), 'active'); /* prior is 6 now */
  ram[0] = 7; /* unchanged: prior stays 6 */
  assert.equal(trigger.evaluate(peek), 'active');

  /* make prior 5 again */
  ram[0] = 5;
  trigger.evaluate(peek); /* value 5, prior 7 */
  ram[0] = 7;
  assert.equal(trigger.evaluate(peek), 'triggered'); /* value 7, prior 5 */
});

test('same-memref delta comparison acts as change detection', () => {
  /* 8-bit and bit0 views of the same address share one memref; comparing
   * across them with delta is change detection (upstream fast path) */
  const { ram, peek } = makeMemory([5]);
  const trigger = parseTrigger('0xH0000<=d0xM0000');
  trigger.state = 'active';

  /* first frame: memref changes from initial 0 to 5,
   * so this compares 8bit(5) <= bit0(prior 0) = 0: false */
  assert.equal(trigger.evaluate(peek), 'active');

  /* value unchanged: <= is true by definition, without comparing
   * the differently-sized views */
  assert.equal(trigger.evaluate(peek), 'triggered');

  const trigger2 = parseTrigger('0xH0000<=d0xM0000');
  trigger2.state = 'active';
  trigger2.evaluate(peek);
  ram[0] = 6; /* changed: compares 8bit(6) <= bit0(prior 5)=1: false */
  assert.equal(trigger2.evaluate(peek), 'active');
});

/* ------------------------------------------------------------------ */
/* hit counts and combining flags                                     */
/* ------------------------------------------------------------------ */

test('hit target: condition true only when target reached', () => {
  const { peek } = makeMemory([1]);
  const trigger = parseTrigger('0xH0000=1(3)');

  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.test(peek), true);
  assert.equal(trigger.getHitCount(0, 0), 3);
  /* saturates at target */
  assert.equal(trigger.test(peek), true);
  assert.equal(trigger.getHitCount(0, 0), 3);
});

test('AndNext chains conditions', () => {
  const { ram, peek } = makeMemory([0, 0]);
  const trigger = parseTrigger('N:0xH0000=1_0xH0001=1');

  assert.equal(trigger.test(peek), false);
  ram[0] = 1;
  assert.equal(trigger.test(peek), false);
  ram[1] = 1;
  assert.equal(trigger.test(peek), true);
  ram[0] = 0;
  assert.equal(trigger.test(peek), false);
});

test('OrNext chains conditions', () => {
  const { ram, peek } = makeMemory([0, 0]);
  const trigger = parseTrigger('O:0xH0000=1_0xH0001=1');

  assert.equal(trigger.test(peek), false);
  ram[0] = 1;
  assert.equal(trigger.test(peek), true);
  ram[0] = 0; ram[1] = 1;
  assert.equal(trigger.test(peek), true);
});

test('AddHits: hits from multiple conditions count toward one target', () => {
  const { ram, peek } = makeMemory([1, 0]);
  const trigger = parseTrigger('C:0xH0000=1_0xH0001=1(3)');

  assert.equal(trigger.test(peek), false); /* AddHits 1 + cond 0 = 1 */
  ram[1] = 1;
  assert.equal(trigger.test(peek), true); /* AddHits 2 + cond 1 = 3 */
  assert.equal(trigger.getHitCount(0, 0), 2);
  assert.equal(trigger.getHitCount(0, 1), 1);
});

test('SubHits: subtracted hits', () => {
  const { ram, peek } = makeMemory([1, 1]);
  const trigger = parseTrigger('D:0xH0000=1_0xH0001=1(2)');

  /* total = cond hits - subtracted hits */
  assert.equal(trigger.test(peek), false); /* 1 - 1 = 0 */
  ram[0] = 0;
  assert.equal(trigger.test(peek), false); /* 2 - 1 = 1 */
  /* NOTE: once a condition's own hit target is met it stops tallying, so
   * the total stays at 2 - 1 = 1 and the trigger can never fire (verified
   * against the C implementation) */
  assert.equal(trigger.test(peek), false);
  assert.equal(trigger.getHitCount(0, 0), 1);
  assert.equal(trigger.getHitCount(0, 1), 2);
});

test('ResetNextIf resets only the next condition', () => {
  const { ram, peek } = makeMemory([0, 1, 1]);
  const trigger = parseTrigger('Z:0xH0000=1_0xH0001=1(10)_0xH0002=1(10)');

  trigger.test(peek);
  trigger.test(peek);
  assert.equal(trigger.getHitCount(0, 1), 2);
  assert.equal(trigger.getHitCount(0, 2), 2);

  ram[0] = 1; /* ResetNextIf true: resets condition 1 only */
  trigger.test(peek);
  assert.equal(trigger.getHitCount(0, 1), 0);
  assert.equal(trigger.getHitCount(0, 2), 3);
});

/* ------------------------------------------------------------------ */
/* AddSource / SubSource / AddAddress                                 */
/* ------------------------------------------------------------------ */

test('AddSource sums operands', () => {
  const { ram, peek } = makeMemory([2, 3, 0]);
  const trigger = parseTrigger('A:0xH0000_A:0xH0001_0xH0002=10');

  assert.equal(trigger.test(peek), false); /* 2+3+0 = 5 */
  ram[2] = 5;
  assert.equal(trigger.test(peek), true); /* 2+3+5 = 10 */
});

test('AddSource with multiplier', () => {
  const { ram, peek } = makeMemory([2, 0]);
  const trigger = parseTrigger('A:0xH0000*3_0xH0001=10');

  assert.equal(trigger.test(peek), false); /* 6+0 */
  ram[1] = 4;
  assert.equal(trigger.test(peek), true); /* 6+4 */
});

test('SubSource subtracts operands', () => {
  const { ram, peek } = makeMemory([2, 12]);
  const trigger = parseTrigger('B:0xH0000_0xH0001=10');

  assert.equal(trigger.test(peek), true); /* -2+12 = 10 */
  ram[1] = 11;
  assert.equal(trigger.test(peek), false);
});

test('AddSource result wraps like uint32', () => {
  const { peek } = makeMemory([0xff, 0xff, 0xff, 0xff, 2]);
  /* 0xffffffff + 3 wraps to 2 */
  const trigger = parseTrigger('A:0xX0000_3=0xH0004');
  assert.equal(trigger.test(peek), true);
});

test('delta of an AddSource chain', () => {
  const { ram, peek } = makeMemory([1, 2, 0]);
  /* delta(byte(0) + byte(1)) < byte(0) + byte(1) */
  const trigger = parseTrigger('A:d0xH0000_d0xH0001<0xH0002');
  trigger.state = 'active';

  ram[2] = 200;
  assert.equal(trigger.evaluate(peek), 'triggered'); /* delta sum 0 < 200 */
});

test('AddAddress: indirect read', () => {
  const { ram, peek } = makeMemory([2, 0, 99, 0]);
  /* read byte at [byte(0) + 1] => byte(3)... byte(0)=2, +1 => addr 3 */
  const trigger = parseTrigger('I:0xH0000_0xH0001=99');

  assert.equal(trigger.test(peek), false); /* ram[2+1]=0 */
  ram[3] = 99;
  assert.equal(trigger.test(peek), true);

  /* pointer moves */
  ram[0] = 1;
  assert.equal(trigger.test(peek), true); /* ram[1+1]=99 */
  ram[2] = 0;
  assert.equal(trigger.test(peek), false);
});

test('AddAddress applies to both operands of the next condition', () => {
  const { ram, peek } = makeMemory([1, 5, 6, 0]);
  /* [ptr+1] > [ptr+2] with ptr = byte(0) */
  const trigger = parseTrigger('I:0xH0000_0xH0001>0xH0002');

  assert.equal(trigger.test(peek), true); /* ram[2]=6 > ram[3]=0 */
  ram[3] = 7;
  assert.equal(trigger.test(peek), false); /* 6 > 7 */
  ram[2] = 8;
  assert.equal(trigger.test(peek), true); /* 8 > 7 */
});

/* ------------------------------------------------------------------ */
/* Remember / Recall                                                  */
/* ------------------------------------------------------------------ */

test('Remember/Recall', () => {
  const { ram, peek } = makeMemory([10, 0]);
  /* remember byte(0) * 2, compare recall == 20 */
  const trigger = parseTrigger('K:0xH0000*2_{recall}=20');

  assert.equal(trigger.test(peek), true);
  ram[0] = 11;
  assert.equal(trigger.test(peek), false);
});

/* ------------------------------------------------------------------ */
/* Measured variants                                                  */
/* ------------------------------------------------------------------ */

test('Measured with MeasuredIf gate', () => {
  const { ram, peek } = makeMemory([3, 0]);
  const trigger = parseTrigger('M:0xH0000>=10_Q:0xH0001=1');
  trigger.state = 'active';

  trigger.evaluate(peek);
  assert.equal(trigger.measuredValue, 0); /* gated off */

  ram[1] = 1;
  trigger.evaluate(peek);
  assert.equal(trigger.measuredValue, 3);
});

test('Measured value tracks max across alt groups', () => {
  const { peek } = makeMemory([3, 7]);
  const trigger = parseTrigger('0xH0000=0SM:0xH0000>=10SM:0xH0001>=10');
  trigger.state = 'active';

  trigger.evaluate(peek);
  assert.equal(trigger.measuredValue, 7);
});
