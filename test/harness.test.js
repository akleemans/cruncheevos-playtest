/**
 * End-to-end tests: run real cruncheevos achievements (from
 * cruncheevos-scripts-main) against synthetic frame recordings and check
 * that they pop on exactly the expected frame.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TriggerRunner, runTrigger, bytesFromValues, achievementToTriggerDefinition,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, '..', 'cruncheevos-scripts-main');

/* Monster Force addresses (see cruncheevos-scripts-main/monster-force.js) */
const gameState = 0x0770;
const currentLevel = 0x34dd;
const maxLevelUnlocked = 0x34df;
const invincibilityCheat = 0x3598;
const atoms = 0x35a4;
const rankingBase = 0x35b8;

const GameStateEnum = { LevelSelect: 0x0c, InGame: 0x0f, LevelEnd: 0x11 };

/** One frame of watched memory, as a sparse byte map. */
function frame(overrides = {}) {
  return bytesFromValues({
    [gameState]: GameStateEnum.InGame,
    [currentLevel]: 0,
    [maxLevelUnlocked]: 0,
    [rankingBase]: 0,
    [atoms]: { value: 0, size: 4 },
    ...overrides,
  });
}

async function loadAchievement(title) {
  const module = await import(join(scriptsDir, 'monster-force.js'));
  const achievement = Object.values(module.default.achievements)
    .find((a) => a.title === title);
  assert.ok(achievement, `achievement "${title}" not found`);
  return achievement;
}

const hasScripts = existsSync(join(scriptsDir, 'monster-force.js')) &&
                   existsSync(join(scriptsDir, 'node_modules'));

test('cruncheevos Achievement converts to a trigger definition string', { skip: !hasScripts }, async () => {
  const achievement = await loadAchievement('Welcome to Monsterland');
  const definition = achievementToTriggerDefinition(achievement);
  assert.equal(definition,
    'd0xH35b8=0_0xH35b8>0_0xH34dd=0_0xH770=17_0xH34df=0_P:0xH3598=3.1._' +
    'A:0xH360c&65_N:0=65_P:0xH360d=255.1.SR:0xH770=12');
});

test('progression achievement pops exactly when the level is finished', { skip: !hasScripts }, async () => {
  const achievement = await loadAchievement('Welcome to Monsterland');

  const frames = [];
  /* frames 0..9: playing Cemetery 1 */
  for (let i = 0; i < 10; i++) frames.push(frame());
  /* frame 10: level end screen, ranking gets written */
  for (let i = 0; i < 5; i++) {
    frames.push(frame({
      [gameState]: GameStateEnum.LevelEnd,
      [rankingBase]: 2,
      [maxLevelUnlocked]: 0,
    }));
  }

  const { triggeredFrame } = runTrigger(achievement, frames);
  assert.equal(triggeredFrame, 10);
});

test('achievement does not pop when the invincibility cheat was used', { skip: !hasScripts }, async () => {
  const achievement = await loadAchievement('Welcome to Monsterland');

  const frames = [];
  for (let i = 0; i < 5; i++) frames.push(frame());
  /* cheat turned on mid-level, then off again */
  frames.push(frame({ [invincibilityCheat]: 3 }));
  for (let i = 0; i < 4; i++) frames.push(frame());
  /* level finished - PauseIf hit count keeps the core group paused */
  for (let i = 0; i < 5; i++) {
    frames.push(frame({
      [gameState]: GameStateEnum.LevelEnd,
      [rankingBase]: 2,
    }));
  }

  const { triggeredFrame } = runTrigger(achievement, frames);
  assert.equal(triggeredFrame, null);

  /* ...but going back to the level select resets the pause hit, and a
   * clean second run pops */
  const frames2 = [
    ...frames,
    frame({ [gameState]: GameStateEnum.LevelSelect }),
    ...Array.from({ length: 5 }, () => frame()),
    frame({ [gameState]: GameStateEnum.LevelEnd, [rankingBase]: 2 }),
  ];
  const result2 = runTrigger(achievement, frames2);
  assert.equal(result2.triggeredFrame, frames2.length - 1);
});

test('timed challenge: 800 atoms within the first 5 seconds', { skip: !hasScripts }, async () => {
  const achievement = await loadAchievement('Diagonal Thinking');
  /* NOTE: compose raw watch values first and expand to bytes once - mixing
   * an already-expanded byte map with multi-byte entries for the same
   * address would leave stale bytes behind */
  const cemetery2 = (atomCount) => bytesFromValues({
    [gameState]: GameStateEnum.InGame,
    [currentLevel]: 1,
    [atoms]: { value: atomCount, size: 4 },
  });

  /* atoms cross 800 on frame 50: should pop exactly there */
  const runner = new TriggerRunner(achievement);
  for (let i = 0; i < 60; i++) runner.tick(cemetery2(i * 16)); /* 800 at frame 50 */
  assert.equal(runner.triggeredFrame, 50);

  /* atoms cross 800 only after 300 in-game frames: the PauseIf hit target
   * locks the group, no pop */
  const verySlow = [];
  for (let i = 0; i < 500; i++) verySlow.push(cemetery2(i * 2)); /* 800 at frame 400 */
  const slowResult = runTrigger(achievement, verySlow);
  assert.equal(slowResult.triggeredFrame, null);
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
