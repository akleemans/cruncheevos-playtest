/**
 * Runner/harness tests: achievement-object conversion, frame formats, the
 * waiting state and per-frame stepping. Deliberately decoupled from any real
 * cruncheevos set - behavior of actual achievements against real recordings
 * is the consumer's scenario-test layer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TriggerRunner, runTrigger, bytesFromValues, achievementToTriggerDefinition,
} from '../src/index.js';

/* minimal stand-in with the cruncheevos Achievement shape: an array of
 * condition groups whose entries stringify to the raw condition syntax */
const fakeAchievement = (groups) => ({
  conditions: groups.map((g) => g.map((text) => ({ toString: () => text }))),
});

test('cruncheevos Achievement shape converts to a trigger definition string', () => {
  const achievement = fakeAchievement([
    ['d0xH35b8=0', '0xH35b8>0', 'P:0xH3598=3.1.'],
    ['R:0xH770=12'],
  ]);
  assert.equal(achievementToTriggerDefinition(achievement),
    'd0xH35b8=0_0xH35b8>0_P:0xH3598=3.1.SR:0xH770=12');

  /* raw strings pass through untouched */
  assert.equal(achievementToTriggerDefinition('0xH0001=1'), '0xH0001=1');
});

test('achievement pops on the exact frame its conditions become true', () => {
  const achievement = fakeAchievement([
    ['d0xH0010=0', '0xH0010>0', '0xH0000=17'],
  ]);

  const frames = [];
  for (let i = 0; i < 10; i++) frames.push(bytesFromValues({ 0x00: 0x0f, 0x10: 0 }));
  for (let i = 0; i < 5; i++) frames.push(bytesFromValues({ 0x00: 0x11, 0x10: 2 }));

  const { triggeredFrame } = runTrigger(achievement, frames);
  assert.equal(triggeredFrame, 10);
});

test('latched PauseIf locks a group until a ResetIf alt clears it', () => {
  const definition = '0xH0010=2_P:0xH0020=3.1.SR:0xH0000=12';
  const frame = (over = {}) => bytesFromValues({ 0x00: 0x0f, 0x10: 0, 0x20: 2, ...over });

  const frames = [];
  for (let i = 0; i < 5; i++) frames.push(frame());
  frames.push(frame({ 0x20: 3 }));                 /* cheat on: pause latches */
  for (let i = 0; i < 4; i++) frames.push(frame()); /* cheat off again */
  for (let i = 0; i < 5; i++) frames.push(frame({ 0x10: 2 })); /* would-be pop */

  assert.equal(runTrigger(definition, frames).triggeredFrame, null);

  /* the ResetIf alt (back at the menu) clears the pause hit; clean run pops */
  const frames2 = [
    ...frames,
    frame({ 0x00: 0x0c }),
    ...Array.from({ length: 5 }, () => frame()),
    frame({ 0x10: 2 }),
  ];
  assert.equal(runTrigger(definition, frames2).triggeredFrame, frames2.length - 1);
});

test('AddHits time window locks after the frame budget is exceeded', () => {
  /* pop when 0x10 reaches 100+ within the first 30 frames of 0x00=15 */
  const definition =
    'N:0xH0001=1_C:0xH0000=15_P:0=1.30._d0x 0010<100_T:0x 0010>=100_0xH0001=1_0xH0000=15';
  const frame = (v) => bytesFromValues({ 0x00: 15, 0x01: 1, 0x10: { value: v, size: 2 } });

  /* crosses 100 on frame 20: pops there */
  const fast = [];
  for (let i = 0; i < 25; i++) fast.push(frame(i * 5));
  assert.equal(runTrigger(definition, fast).triggeredFrame, 20);

  /* crosses 100 only on frame 50: the PauseIf hit target locked at 30 */
  const slow = [];
  for (let i = 0; i < 60; i++) slow.push(frame(i * 2));
  assert.equal(runTrigger(definition, slow).triggeredFrame, null);
});

test('waiting state: no pop when conditions are already true on frame 0', () => {
  /* plain trigger, true from the very first frame */
  const result = runTrigger('0xH0000=0', [{}, {}, {}]);
  assert.equal(result.triggeredFrame, null);
  assert.deepEqual(result.states, ['waiting', 'waiting', 'waiting']);

  /* becomes false once, then true: pops */
  const result2 = runTrigger('0xH0000=5', [{}, { 0: 5 }]);
  assert.equal(result2.triggeredFrame, 1);
});

test('bytesFromValues expands multi-byte watch values little-endian', () => {
  const bytes = bytesFromValues({
    0x100: { value: 0x12345678, size: 4 },
    0x200: { value: 0xabcd, size: 2 },
    0x300: 7,
  });
  assert.equal(bytes[0x100], 0x78);
  assert.equal(bytes[0x101], 0x56);
  assert.equal(bytes[0x102], 0x34);
  assert.equal(bytes[0x103], 0x12);
  assert.equal(bytes[0x200], 0xcd);
  assert.equal(bytes[0x201], 0xab);
  assert.equal(bytes[0x300], 7);
});

test('TriggerRunner reports states per frame and measured progress', () => {
  const runner = new TriggerRunner('M:0xH0000=1(3)');
  assert.equal(runner.measuredTarget, 3);

  runner.tick({ 0: 0 }); /* waiting -> active */
  runner.tick({ 0: 1 });
  runner.tick({ 0: 1 });
  assert.equal(runner.measuredValue, 2);
  assert.equal(runner.tick({ 0: 1 }), 'triggered');
  assert.equal(runner.triggeredFrame, 3);
});
