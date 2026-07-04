import {AchievementSet, define as $} from '@cruncheevos/core';
const set = new AchievementSet({gameId: 5260, title: 'Monster Force'});

// Addresses and helpers

const GameStateEnum = {
  LevelSelect: 0x0c,
  InGame: 0x0f,
  LevelEnd: 0x11,
  ShopOptions: 0x12,
  SaveGameOption: 0x13,
};

const LevelEnum = {
  Cemetery1: 0x00,
  Cemetery2: 0x01,
  CemeteryTrial: 0x02,
  CemeteryShadow: 0x03,
  Village1: 0x04,
  Village2: 0x05,
  VillageTrial: 0x06,
  VillageShadow: 0x07,
  Garden1: 0x08,
  Garden2: 0x09,
  GardenTrial: 0x0a,
  GardenShadow: 0x0b,
  Atlantis1: 0x0c,
  Atlantis2: 0x0d,
  AtlantisTrial: 0x0e,
  AtlantisShadow: 0x0f,
  Temple1: 0x10,
  Temple2: 0x11,
  TempleTrial: 0x12,
  TempleShadow: 0x13,
  Desert1: 0x14,
  Desert2: 0x15,
  DesertTrial: 0x16,
  DesertShadow: 0x17,
  Clouds1: 0x18,
  Clouds2: 0x19,
  CloudsTrial: 0x1a,
  CloudsShadow: 0x1b,
  Factory1: 0x1c,
  Factory2: 0x1d,
  FactoryTrial: 0x1e,
  FactoryShadow: 0x1f,
  Castle1: 0x20,
  Castle2: 0x21,
  Castle3: 0x22,
  Castle4: 0x23,
  CastleSergeantSmash: 0x24,
};

const gameState = 0x0770;
const currentLevel = 0x34dd;
const maxLevelUnlocked = 0x34df;

const cemetery1Ranking = 0x35b8;
const invincibilityCheat = 0x3598;

const atomsInCurrentLevel = 0x35a4;
const levelTime = 0x359c;
const characterActive = 0x0878;

/* ========= PROGRESSION ========= */

const progression = (levelId) => {
  return [
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', levelId],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', levelId+1],
    ['', 'Mem', '8bit', currentLevel, '=', 'Value', '', levelId+1],
    // Cheat protection - progression can not be unlocked with Mina or Drew, as they are only unlocked after beating the game
    ['', 'Mem', '8bit', characterActive, '<=', 'Value', '', 2],
    // Save protection - must just have finished the level and reached level end / save screen
    ['', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.SaveGameOption],
  ];
};

const invincibilityCheatProtection = () => {
  return [
    // Pause if the invincibility cheat was ever turned on. Needs levelSelectReset in alt.
    ['PauseIf', 'Mem', '8bit', invincibilityCheat, '=', 'Value', '', 3, 1],
  ];
};

const buttonsPressed = 0x360c;
const shoulderButtonsPressed = 0x360d;

const skipLevelCheatProtection = () => {
  return [
    // 0x41 = A + Up pressed. Other buttons can be pressed too (and the cheat will still work),
    // so we have to apply a bitmask. Needs levelSelectReset in alt.
    ['AddSource', 'Mem', '8bit', buttonsPressed, '&', 'Value', '', 0x41],
    ['AndNext', 'Value', '', 0, '=', 'Value', '', 0x41],
    ['PauseIf', 'Mem', '8bit', shoulderButtonsPressed, '=', 'Value', '', 0xff, 1],
  ];
};

const levelSelectReset = () => {
  return [['ResetIf', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.LevelSelect]];
};


set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Welcome to Monsterland',
  description: 'Complete the introduction by finishing Cemetery Level 1',
  points: 2,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.Cemetery1),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      // Reset has to be in a separate alt (and PauseIf can't be), because the reset will not trigger if
      // the Pause in the same group has accumulated a hit
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'No Time to Die',
  description: 'Finish the Cemetery Zone',
  points: 5,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.CemeteryShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'It Takes a Village',
  description: 'Finish the Village Zone',
  points: 5,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.VillageShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Green Thumb',
  description: 'Finish the Garden Zone',
  points: 5,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.GardenShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Platonic Tale',
  description: 'Finish Atlantis Zone',
  points: 5,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.AtlantisShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Temple Tantrum',
  description: 'Finish the Temple Zone',
  points: 10,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.TempleShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Rise of the Mummies',
  description: 'Finish the Desert Zone',
  points: 10,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.DesertShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Sky High',
  description: 'Finish the Clouds Zone',
  points: 10,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.CloudsShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Industrial Revolution',
  description: 'Finish the Factory Zone',
  points: 10,
  type: 'progression',
  conditions: {
    core: $(
      ...progression(LevelEnum.FactoryShadow),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

// TODO if this behaves the same - or check Mina unlock?
set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Pumpkin Mash',
  description: 'Finish the Castle Zone by defeating Sergeant Smash and beat the game',
  points: 25,
  type: 'win_condition',
  conditions: {
    core: $(
      ...progression(LevelEnum.CastleSergeantSmash),
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

/* ========= CHALLENGES ========= */

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Walking Through Walls',
  description: 'Find and destroy all 6 pumpkins in the hidden area in Cemetery Level 1',
  points: 2,
  conditions: {
    core: $(
      ['AddSource', 'Delta', '16bit', 0x1820],
      ['AddSource', 'Delta', '16bit', 0x1824],
      ['AddSource', 'Delta', '16bit', 0x1828],
      ['AddSource', 'Delta', '16bit', 0x182c],
      ['AddSource', 'Delta', '16bit', 0x1838],
      ['AddSource', 'Delta', '16bit', 0x183c],
      ['AddSource', 'Delta', '16bit', 0x1840],
      ['', 'Delta', '16bit', 0x1844, '>', 'Value', '', 0],
      ['AddSource', 'Mem', '16bit', 0x1820],
      ['AddSource', 'Mem', '16bit', 0x1824],
      ['AddSource', 'Mem', '16bit', 0x1828],
      ['AddSource', 'Mem', '16bit', 0x182c],
      ['AddSource', 'Mem', '16bit', 0x1838],
      ['AddSource', 'Mem', '16bit', 0x183c],
      ['AddSource', 'Mem', '16bit', 0x1840],
      ['', 'Mem', '16bit', 0x1844, '=', 'Value', '', 0],
      ['', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.InGame],
      ['', 'Mem', '8bit', currentLevel, '=', 'Value', '', LevelEnum.Cemetery1],
      ...invincibilityCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Diagonal Thinking',
  description: 'Get 800 Atoms or more in the first 5 seconds of Cemetery Level 2',
  points: 2,
  conditions: {
    core: $(
      // Lock if more than 5 seconds into Cemetery2
      ['AndNext', 'Mem', '8bit', currentLevel, '=', 'Value', '', LevelEnum.Cemetery2],
      ['AddHits', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.InGame],
      ['PauseIf', 'Value', '', 0, '=', 'Value', '', 1, 300],
      // Atoms >= 800 as Trigger condition
      ['', 'Delta', '32bit', atomsInCurrentLevel, '<', 'Value', '', 800],
      ['Trigger', 'Mem', '32bit', atomsInCurrentLevel, '>=', 'Value', '', 800],
      // TODO check if needed, if missing Trigger shows already on start screen
      ['', 'Mem', '8bit', currentLevel, '=', 'Value', '', LevelEnum.Cemetery2],
      ['', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.InGame],
      ...invincibilityCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'Every Atom Counts',
  description: 'Collect all 100 Atoms in Cemetery Trial',
  points: 5,
  conditions: {
    core: $(
      ['', 'Mem', '8bit', currentLevel, '=', 'Value', '', LevelEnum.CemeteryTrial],
      ['', 'Delta', '8bit', gameState, '=', 'Value', '', GameStateEnum.InGame],
      ['', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.LevelEnd],
      ['', 'Mem', '32bit', atomsInCurrentLevel, '>=', 'Value', '', 100],
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

set.addAchievement({
  // id: TODO,
  // badge: 'TODO',
  title: 'In the Blink of an Eye',
  description: 'Defeat the Cemetery Shadow in less than 10 seconds',
  points: 3,
  conditions: {
    core: $(
      ['', 'Mem', '8bit', currentLevel, '=', 'Value', '', LevelEnum.CemeteryShadow],
      ['', 'Delta', '8bit', gameState, '=', 'Value', '', GameStateEnum.InGame],
      ['Trigger', 'Mem', '8bit', gameState, '=', 'Value', '', GameStateEnum.LevelEnd],
      ['', 'Mem', '16bit', levelTime, '<', 'Value', '', 600],
      ...invincibilityCheatProtection(),
      ...skipLevelCheatProtection(),
    ),
    alt1: $(
      ...levelSelectReset(),
    ),
  },
});

/* ========= LEADERBOARDS ========= */


export default set;

/* ========= RICH PRESENCE ========= */

/*

*/