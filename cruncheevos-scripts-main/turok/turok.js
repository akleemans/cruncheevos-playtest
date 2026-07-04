import {AchievementSet, define as $} from '@cruncheevos/core';
const set = new AchievementSet({gameId: 13955, title: 'Turok: Battle of the Bionosaurs'});

const lifeforceCount = 0xde80;
const currentLives = 0xc0fa;
const gameState = 0xc2d3;
const currentRoomId = 0xdf96;
const nrOfKeysCollected = 0xc0fb;
const maxLevelUnlocked = 0xdf59;
const activeWeaponSelection = 0xfffc;
const pauseActive = 0xc1f4;

const bossHealth = 0xdcaf;
const tRexState = 0xc0fe;
const campaignerState = 0xc0ff;

const cheatProtection = () => {
  return [
    ['', 'Mem', '8bit', 0xc0e2, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', 0xc0e3, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', 0xc0e4, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', 0xc0e5, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', 0xc0e6, '=', 'Value', '', 0],
  ];
};

/* ========= PROGRESSION ========= */

set.addAchievement({
  id: 593733,
  badge: '677267',
  title: 'Welcome, Warrior',
  description: 'Finish the Hub Ruins',
  points: 5,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 1],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594027,
  badge: '677174',
  title: 'Into the Jungle',
  description: 'Finish the Jungle',
  points: 5,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594690,
  badge: '677169',
  title: 'The Invention of Parkour',
  description: 'Finish the Ancient City',
  points: 5,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 3],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594695,
  badge: '677398',
  title: 'Swimming Upwards',
  description: 'Finish the Ruins',
  points: 5,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 4],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594701,
  badge: '677403',
  title: 'Swinging Knives',
  description: 'Finish the Catacombs',
  points: 10,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 4],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 5],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594707,
  badge: '677408',
  title: 'Hoppin\' in the Treetops',
  description: 'Finish the Treetop Village',
  points: 10,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 5],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 6],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595315,
  badge: '677413',
  title: 'Lost in the Lands',
  description: 'Finish the Lost Land',
  points: 10,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 6],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 7],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595506,
  badge: '677418',
  title: 'Fallen Tyrant',
  description: 'Beat T-Rex in the Final Confrontation',
  points: 5,
  type: 'progression',
  conditions: $(
    ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 60],
    ['', 'Delta', '8bit', tRexState, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', tRexState, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595501,
  badge: '677419',
  title: 'Son of Stone',
  description: 'Finish the Final Confrontation',
  points: 10,
  type: 'win_condition',
  conditions: $(
    ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 62],
    ['', 'Delta', '8bit', campaignerState, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', campaignerState, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});


/* ========= PROGRESSION - HARD ========= */

set.addAchievement({
  id: 593736,
  badge: '677268',
  title: 'Enhanced Portal Activation',
  description: 'Finish the Hub Ruins on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594028,
  badge: '677175',
  title: 'Hunter\'s Peril',
  description: 'Finish the Jungle on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594693,
  badge: '677170',
  title: 'Blessing of the Ancients',
  description: 'Finish the Ancient City on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594698,
  badge: '677399',
  title: 'Trial of the Ruins',
  description: 'Finish the Ruins on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 4],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594704,
  badge: '677404',
  title: 'Leap of Faith',
  description: 'Finish the Catacombs on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 4],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 5],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594710,
  badge: '677409',
  title: 'Canopy Conqueror',
  description: 'Finish the Treetop Village on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 5],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 6],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595318,
  badge: '677414',
  title: 'Interdimensional Sewer',
  description: 'Finish the Lost Land on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 6],
    ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 7],
    ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595505,
  badge: '677420',
  title: 'I Am Turok!!!',
  description: 'Finish the Final Confrontation on Hard difficulty',
  points: 10,
  conditions: $(
    ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 62],
    ['', 'Delta', '8bit', campaignerState, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', campaignerState, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', 0xdee4, '>=', 'Value', '', 1],
    ...cheatProtection(),
  ),
});


/* ========= WEAPON COLLECTION ========= */

set.addAchievement({
  id: 593735,
  badge: '677263',
  title: 'Finally Some Firepower',
  description: 'Collect the Pistol and Shotgun in the Hub Ruins without dying',
  points: 5,
  conditions: {
    core: $(
      ...cheatProtection(),
    ),
    alt1: $(
      // Any Shotgun already collected in level
      ['OrNext', 'Mem', 'Bit5', 0xdc69, '=', 'Value', '', 1],
      ['', 'Mem', 'Bit7', 0xdc74, '=', 'Value', '', 1],
      // Pistol collected in roomId 0x00
      ['', 'Delta', 'Bit2', 0xdc66, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit2', 0xdc66, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x00],
    ),
    alt2: $(
      // Any Shotgun already collected in level
      ['OrNext', 'Mem', 'Bit5', 0xdc69, '=', 'Value', '', 1],
      ['', 'Mem', 'Bit7', 0xdc74, '=', 'Value', '', 1],
      // Pistol collected in roomId 0x03
      ['', 'Delta', 'Bit2', 0xdc79, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit2', 0xdc79, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x03],
    ),
    alt3: $(
      // Any Pistol already collected in level
      ['OrNext', 'Mem', 'Bit2', 0xdc66, '=', 'Value', '', 1],
      ['', 'Mem', 'Bit2', 0xdc79, '=', 'Value', '', 1],
      // Shotgun collected in roomId 0x00
      ['', 'Delta', 'Bit5', 0xdc69, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit5', 0xdc69, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x00],
    ),
    alt4: $(
      // Any Pistol already collected in level
      ['OrNext', 'Mem', 'Bit2', 0xdc66, '=', 'Value', '', 1],
      ['', 'Mem', 'Bit2', 0xdc79, '=', 'Value', '', 1],
      // Shotgun collected in roomId 0x02
      ['', 'Delta', 'Bit7', 0xdc74, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit7', 0xdc74, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x02],
    ),
  },
});

set.addAchievement({
  id: 594030,
  badge: '677171',
  title: 'Now We\'re Talking',
  description: 'Collect the Assault Rifle and Automatic Shotgun in the Jungle without dying',
  points: 5,
  conditions: {
    core: $(
      ...cheatProtection(),
    ),
    alt1: $(
      // Assault Rifle already collected in level
      ['', 'Mem', 'Bit2', 0xdc9c, '=', 'Value', '', 1],
      // Automatic Shotgun collected in roomId 0x04
      ['', 'Delta', 'Bit0', 0xdc68, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit0', 0xdc68, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x04],
    ),
    alt2: $(
      // Automatic Shotgun already collected in level
      ['', 'Mem', 'Bit0', 0xdc68, '=', 'Value', '', 1],
      // Assault Rifle collected in roomId 0x0d
      ['', 'Delta', 'Bit2', 0xdc9c, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit2', 0xdc9c, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x0d],
    ),
  },
});

set.addAchievement({
  id: 594692,
  badge: '677166',
  title: 'Mini Guns, Maxi Effect',
  description: 'Collect the Pulse Rifle and the Minigun in the Ancient City without dying',
  points: 5,
  conditions: {
    core: $(
      ...cheatProtection(),
    ),
    alt1: $(
      // Pulse Rifle already collected in level
      ['', 'Mem', 'Bit3', 0xdc6d, '=', 'Value', '', 1],
      // Minigun collected in roomId 0x15
      ['', 'Delta', 'Bit4', 0xdc84, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit4', 0xdc84, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x15],
    ),
    alt2: $(
      // Minigun already collected in level
      ['', 'Mem', 'Bit4', 0xdc84, '=', 'Value', '', 1],
      // Pulse Rifle collected in roomId 0x11
      ['', 'Delta', 'Bit3', 0xdc6d, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit3', 0xdc6d, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x11],
    ),
  },
});

set.addAchievement({
  id: 594697,
  badge: '677394',
  title: 'Anti-Matter Plasma Beams and Grenades',
  description: 'Collect the Grenade Launcher and Alien Weapon in the Ruins without dying',
  points: 5,
  conditions: {
    core: $(
      ...cheatProtection(),
    ),
    alt1: $(
      // Any Grenade Launcher already collected in level
      ['OrNext', 'Mem', 'Bit2', 0xdc66, '=', 'Value', '', 1],
      ['', 'Mem', 'Bit2', 0xdc96, '=', 'Value', '', 1],
      // Alien Weapon collected in roomId 0x17
      ['', 'Delta', 'Bit2', 0xdc6a, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit2', 0xdc6a, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x17],
    ),
    alt2: $(
      // Alien Weapon already collected in level
      ['', 'Mem', 'Bit2', 0xdc6a, '=', 'Value', '', 1],
      // Grenade Launcher collected in roomId 0x17
      ['', 'Delta', 'Bit2', 0xdc66, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit2', 0xdc66, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x17],
    ),
    alt3: $(
      // Alien Weapon already collected in level
      ['', 'Mem', 'Bit2', 0xdc6a, '=', 'Value', '', 1],
      // Grenade Launcher collected in roomId 0x1f
      ['', 'Delta', 'Bit2', 0xdc96, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit2', 0xdc96, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x1f],
    ),
  },
});

set.addAchievement({
  id: 594703,
  badge: '677400',
  title: 'Four Is Better than One',
  description: 'Collect the Quad Rocket Launcher in the Catacombs without dying',
  points: 2,
  conditions: {
    core: $(
      ...cheatProtection(),
    ),
    alt1: $(
      ['', 'Delta', 'Bit5', 0xdc79, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit5', 0xdc79, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 36],
    ),
    alt2: $(
      ['', 'Delta', 'Bit3', 0xdc66, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit3', 0xdc66, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 33],
    ),
  },
});

set.addAchievement({
  id: 594709,
  badge: '677405',
  title: 'Fusion Kitchen',
  description: 'Collect the Particle Accelerator and Fusion Cannon in the Treetops without dying',
  points: 5,
  conditions: {
    core: $(
      ...cheatProtection(),
    ),
    alt1: $(
      // Particle Accelerator already collected in level
      ['', 'Mem', 'Bit1', 0xdca2, '=', 'Value', '', 1],
      // Fusion Cannon collected in roomId 0x2a
      ['', 'Delta', 'Bit6', 0xdc72, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit6', 0xdc72, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x2a],
    ),
    alt2: $(
      // Fusion Cannon already collected in level
      ['', 'Mem', 'Bit6', 0xdc72, '=', 'Value', '', 1],
      // Particle Accelerator collected in roomId 0x32
      ['', 'Delta', 'Bit1', 0xdca2, '=', 'Value', '', 0],
      ['', 'Mem', 'Bit1', 0xdca2, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x32],
    ),
  },
});

set.addAchievement({
  id: 595317,
  badge: '677410',
  title: 'Well Prepared',
  description: 'Collect all seven weapons in the Lost Land without dying',
  points: 5,
  conditions: $(
    ['AndNext', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 52],
    ['MeasuredIf', 'Mem', '8bit', currentRoomId, '<=', 'Value', '', 57],
    ['AddSource', 'Delta', 'Bit5', 0xdc66],
    ['AddSource', 'Delta', 'Bit0', 0xdc6a],
    ['AddSource', 'Delta', 'Bit7', 0xdc6e],
    ['AddSource', 'Delta', 'Bit2', 0xdc78],
    ['AddSource', 'Delta', 'Bit1', 0xdc7e],
    ['AddSource', 'Delta', 'Bit2', 0xdc84],
    ['', 'Delta', 'Bit0', 0xdc85, '<', 'Value', '', 7],
    ['AddSource', 'Mem', 'Bit5', 0xdc66],
    ['AddSource', 'Mem', 'Bit0', 0xdc6a],
    ['AddSource', 'Mem', 'Bit7', 0xdc6e],
    ['AddSource', 'Mem', 'Bit2', 0xdc78],
    ['AddSource', 'Mem', 'Bit1', 0xdc7e],
    ['AddSource', 'Mem', 'Bit2', 0xdc84],
    ['Measured', 'Mem', 'Bit0', 0xdc85, '=', 'Value', '', 7],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595504,
  badge: '677416',
  title: 'Apparatus of Ultimate Destruction',
  description: 'Assemble the Chronoscepter',
  points: 5,
  type: 'missable',
  conditions: $(
    ['', 'Delta', '8bit', 0xc1bb, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', 0xc1bb, '=', 'Value', '', 1],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 595503,
  badge: '677417',
  title: 'Armed to the Teeth',
  description: 'Unlock all 14 weapons',
  points: 10,
  type: 'missable',
  conditions: $(
    ['AddSource', 'Delta', '8bit', 0xc1b0],
    ['AddSource', 'Delta', '8bit', 0xc1b1],
    ['AddSource', 'Delta', '8bit', 0xc1b2],
    ['AddSource', 'Delta', '8bit', 0xc1b3],
    ['AddSource', 'Delta', '8bit', 0xc1b4],
    ['AddSource', 'Delta', '8bit', 0xc1b5],
    ['AddSource', 'Delta', '8bit', 0xc1b6],
    ['AddSource', 'Delta', '8bit', 0xc1b7],
    ['AddSource', 'Delta', '8bit', 0xc1b8],
    ['AddSource', 'Delta', '8bit', 0xc1b9],
    ['AddSource', 'Delta', '8bit', 0xc1ba],
    ['', 'Delta', '8bit', 0xc1bb, '<', 'Value', '', 12],
    ['AddSource', 'Mem', '8bit', 0xc1b0],
    ['AddSource', 'Mem', '8bit', 0xc1b1],
    ['AddSource', 'Mem', '8bit', 0xc1b2],
    ['AddSource', 'Mem', '8bit', 0xc1b3],
    ['AddSource', 'Mem', '8bit', 0xc1b4],
    ['AddSource', 'Mem', '8bit', 0xc1b5],
    ['AddSource', 'Mem', '8bit', 0xc1b6],
    ['AddSource', 'Mem', '8bit', 0xc1b7],
    ['AddSource', 'Mem', '8bit', 0xc1b8],
    ['AddSource', 'Mem', '8bit', 0xc1b9],
    ['AddSource', 'Mem', '8bit', 0xc1ba],
    ['', 'Mem', '8bit', 0xc1bb, '=', 'Value', '', 12],
    ...cheatProtection(),
  ),
});

/* ========= OTHER COLLECTION ========= */

set.addAchievement({
  id: 593732,
  badge: '677271',
  title: 'Source of Life',
  description: 'Get a life by collecting 100 lifeforce tokens',
  points: 2,
  conditions: $(
    ['', 'Mem', '8bit', gameState, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', currentLives, '>', 'Delta', '8bit', currentLives],
    ['', 'Mem', '8bit', currentLives, '!=', 'Value', '', 0xff],
    ['', 'Mem', '8bit', lifeforceCount, '<', 'Delta', '8bit', lifeforceCount],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 602355,
  badge: '683121',
  title: 'Old Grounds, New Secrets',
  description: 'Collect the three Chronoscepter pieces in the Hub Ruins, Jungle and Ancient City',
  points: 5,
  conditions: {
    core: $(
      ['AddSource', 'Delta', 'Bit3', 0xdf45],
      ['AddSource', 'Delta', 'Bit3', 0xdf46],
      ['', 'Delta', 'Bit3', 0xdf47, '<', 'Value', '', 3],
      ['AddSource', 'Mem', 'Bit3', 0xdf45],
      ['AddSource', 'Mem', 'Bit3', 0xdf46],
      ['', 'Mem', 'Bit3', 0xdf47, '=', 'Value', '', 3],
      ['OrNext', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 1],
      ['OrNext', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 14],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 19],
      ...cheatProtection(),
    ),
  },
});

set.addAchievement({
  id: 602356,
  badge: '683122',
  title: 'Guarded by Mantis',
  description: 'Collect the two Chronoscepter pieces in the Ruins and Catacombs',
  points: 5,
  conditions: {
    core: $(
      ['AddSource', 'Delta', 'Bit3', 0xdf48],
      ['', 'Delta', 'Bit3', 0xdf49, '<', 'Value', '', 2],
      ['AddSource', 'Mem', 'Bit3', 0xdf48],
      ['', 'Mem', 'Bit3', 0xdf49, '=', 'Value', '', 2],
      ['OrNext', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 26],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 34],
      ...cheatProtection(),
    ),
  },
});

set.addAchievement({
  id: 602357,
  badge: '683123',
  title: 'Assembly Required',
  description: 'Collect the three Chronoscepter pieces in the Treetops, Lost Land and Final Confrontation',
  points: 5,
  conditions: {
    core: $(
      ['AddSource', 'Delta', 'Bit3', 0xdf4a],
      ['AddSource', 'Delta', 'Bit3', 0xdf4b],
      ['', 'Delta', 'Bit3', 0xdf4c, '<', 'Value', '', 3],
      ['AddSource', 'Mem', 'Bit3', 0xdf4a],
      ['AddSource', 'Mem', 'Bit3', 0xdf4b],
      ['', 'Mem', 'Bit3', 0xdf4c, '=', 'Value', '', 3],
      ['OrNext', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 42],
      ['OrNext', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 54],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 60],
      ...cheatProtection(),
    ),
  },
});

set.addAchievement({
  id: 594700,
  badge: '677396',
  title: 'Master Blaster',
  description: 'Aquire 99 rocket Grenade Launcher ammo',
  points: 3,
  conditions: $(
    ['', 'Delta', '8bit', 0xc1a8, '<', 'Value', '', 99],
    ['', 'Mem', '8bit', 0xc1a8, '=', 'Value', '', 99],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594699,
  badge: '677397',
  title: 'Triangulist',
  description: 'Collect all 30 Lifeforce tokens in the Ruins',
  points: 5,
  conditions: $(
    ['AndNext', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 23],
    ['MeasuredIf', 'Mem', '8bit', currentRoomId, '<=', 'Value', '', 32],
    ['AddSource', 'Delta', 'Bit0', 0xdc66],
    ['AddSource', 'Delta', 'Bit3', 0xdc66],
    ['AddSource', 'Delta', 'Bit0', 0xdc68],
    ['AddSource', 'Delta', 'Bit7', 0xdc67],
    ['AddSource', 'Delta', 'Bit1', 0xdc68],
    ['AddSource', 'Delta', 'Bit3', 0xdc6a],
    ['AddSource', 'Delta', 'Bit4', 0xdc6a],
    ['AddSource', 'Delta', 'Bit2', 0xdc6c],
    ['AddSource', 'Delta', 'Bit0', 0xdc7e],
    ['AddSource', 'Delta', 'Bit1', 0xdc7e],
    ['AddSource', 'Delta', 'Bit2', 0xdc7e],
    ['AddSource', 'Delta', 'Bit3', 0xdc7e],
    ['AddSource', 'Delta', 'Bit4', 0xdc78],
    ['AddSource', 'Delta', 'Bit7', 0xdc78],
    ['AddSource', 'Delta', 'Bit3', 0xdc90],
    ['AddSource', 'Delta', 'Bit4', 0xdc91],
    ['AddSource', 'Delta', 'Bit7', 0xdc92],
    ['AddSource', 'Delta', 'Bit3', 0xdc93],
    ['AddSource', 'Delta', 'Bit4', 0xdc93],
    ['AddSource', 'Delta', 'Bit0', 0xdc97],
    ['AddSource', 'Delta', 'Bit1', 0xdc97],
    ['AddSource', 'Delta', 'Bit2', 0xdc97],
    ['AddSource', 'Delta', 'Bit3', 0xdc97],
    ['AddSource', 'Delta', 'Bit4', 0xdc97],
    ['AddSource', 'Delta', 'Bit5', 0xdc97],
    ['AddSource', 'Delta', 'Bit0', 0xdc96],
    ['AddSource', 'Delta', 'Bit1', 0xdc96],
    ['AddSource', 'Delta', 'Bit3', 0xdc96],
    ['AddSource', 'Delta', 'Bit4', 0xdc96],
    ['', 'Delta', 'Bit7', 0xdc96, '<', 'Value', '', 30],
    ['AddSource', 'Mem', 'Bit0', 0xdc66],
    ['AddSource', 'Mem', 'Bit3', 0xdc66],
    ['AddSource', 'Mem', 'Bit0', 0xdc68],
    ['AddSource', 'Mem', 'Bit7', 0xdc67],
    ['AddSource', 'Mem', 'Bit1', 0xdc68],
    ['AddSource', 'Mem', 'Bit3', 0xdc6a],
    ['AddSource', 'Mem', 'Bit4', 0xdc6a],
    ['AddSource', 'Mem', 'Bit2', 0xdc6c],
    ['AddSource', 'Mem', 'Bit0', 0xdc7e],
    ['AddSource', 'Mem', 'Bit1', 0xdc7e],
    ['AddSource', 'Mem', 'Bit2', 0xdc7e],
    ['AddSource', 'Mem', 'Bit3', 0xdc7e],
    ['AddSource', 'Mem', 'Bit4', 0xdc78],
    ['AddSource', 'Mem', 'Bit7', 0xdc78],
    ['AddSource', 'Mem', 'Bit3', 0xdc90],
    ['AddSource', 'Mem', 'Bit4', 0xdc91],
    ['AddSource', 'Mem', 'Bit7', 0xdc92],
    ['AddSource', 'Mem', 'Bit3', 0xdc93],
    ['AddSource', 'Mem', 'Bit4', 0xdc93],
    ['AddSource', 'Mem', 'Bit0', 0xdc97],
    ['AddSource', 'Mem', 'Bit1', 0xdc97],
    ['AddSource', 'Mem', 'Bit2', 0xdc97],
    ['AddSource', 'Mem', 'Bit3', 0xdc97],
    ['AddSource', 'Mem', 'Bit4', 0xdc97],
    ['AddSource', 'Mem', 'Bit5', 0xdc97],
    ['AddSource', 'Mem', 'Bit0', 0xdc96],
    ['AddSource', 'Mem', 'Bit1', 0xdc96],
    ['AddSource', 'Mem', 'Bit3', 0xdc96],
    ['AddSource', 'Mem', 'Bit4', 0xdc96],
    ['Measured', 'Mem', 'Bit7', 0xdc96, '=', 'Value', '', 30],
    ...cheatProtection(),
  ),
});

/* ========= CHALLENGES ========= */

set.addAchievement({
  id: 593738,
  badge: '677266',
  title: 'Extinction',
  description: 'Defeat all 49 enemies in the Hub Ruins',
  points: 5,
  conditions: $(
    ['MeasuredIf', 'Mem', '8bit', currentRoomId, '<=', 'Value', '', 3],
    ['AddSource', 'Delta', 'Bit5', 0xdc66],
    ['AddSource', 'Delta', 'Bit1', 0xdc67],
    ['AddSource', 'Delta', 'Bit3', 0xdc67],
    ['AddSource', 'Delta', 'Bit1', 0xdc68],
    ['AddSource', 'Delta', 'Bit5', 0xdc68],
    ['AddSource', 'Delta', 'Bit7', 0xdc68],
    ['AddSource', 'Delta', 'Bit3', 0xdc66],
    ['AddSource', 'Delta', 'Bit6', 0xdc66],
    ['AddSource', 'Delta', 'Bit4', 0xdc67],
    ['AddSource', 'Delta', 'Bit2', 0xdc68],
    ['AddSource', 'Delta', 'Bit6', 0xdc68],
    ['AddSource', 'Delta', 'Bit3', 0xdc69],
    ['AddSource', 'Delta', 'Bit4', 0xdc69],
    ['AddSource', 'Delta', 'Bit6', 0xdc69],
    ['AddSource', 'Delta', 'Bit3', 0xdc6a],
    ['AddSource', 'Delta', 'Bit7', 0xdc69],
    ['AddSource', 'Delta', 'Bit1', 0xdc6e],
    ['AddSource', 'Delta', 'Bit6', 0xdc6d],
    ['AddSource', 'Delta', 'Bit7', 0xdc6c],
    ['AddSource', 'Delta', 'Bit6', 0xdc6c],
    ['AddSource', 'Delta', 'Bit2', 0xdc6d],
    ['AddSource', 'Delta', 'Bit2', 0xdc6e],
    ['AddSource', 'Delta', 'Bit0', 0xdc6e],
    ['AddSource', 'Delta', 'Bit4', 0xdc6d],
    ['AddSource', 'Delta', 'Bit3', 0xdc6d],
    ['AddSource', 'Delta', 'Bit0', 0xdc6d],
    ['AddSource', 'Delta', 'Bit0', 0xdc78],
    ['AddSource', 'Delta', 'Bit2', 0xdc78],
    ['AddSource', 'Delta', 'Bit5', 0xdc78],
    ['AddSource', 'Delta', 'Bit7', 0xdc78],
    ['AddSource', 'Delta', 'Bit0', 0xdc79],
    ['AddSource', 'Delta', 'Bit3', 0xdc79],
    ['AddSource', 'Delta', 'Bit6', 0xdc79],
    ['AddSource', 'Delta', 'Bit7', 0xdc79],
    ['AddSource', 'Delta', 'Bit1', 0xdc7a],
    ['AddSource', 'Delta', 'Bit2', 0xdc7a],
    ['AddSource', 'Delta', 'Bit5', 0xdc7a],
    ['AddSource', 'Delta', 'Bit1', 0xdc72],
    ['AddSource', 'Delta', 'Bit2', 0xdc72],
    ['AddSource', 'Delta', 'Bit5', 0xdc72],
    ['AddSource', 'Delta', 'Bit6', 0xdc72],
    ['AddSource', 'Delta', 'Bit1', 0xdc73],
    ['AddSource', 'Delta', 'Bit3', 0xdc73],
    ['AddSource', 'Delta', 'Bit4', 0xdc73],
    ['AddSource', 'Delta', 'Bit6', 0xdc73],
    ['AddSource', 'Delta', 'Bit0', 0xdc74],
    ['AddSource', 'Delta', 'Bit1', 0xdc74],
    ['AddSource', 'Delta', 'Bit2', 0xdc74],
    ['', 'Delta', 'Bit4', 0xdc74, '<', 'Value', '', 49],
    ['AddSource', 'Mem', 'Bit5', 0xdc66],
    ['AddSource', 'Mem', 'Bit1', 0xdc67],
    ['AddSource', 'Mem', 'Bit3', 0xdc67],
    ['AddSource', 'Mem', 'Bit1', 0xdc68],
    ['AddSource', 'Mem', 'Bit5', 0xdc68],
    ['AddSource', 'Mem', 'Bit7', 0xdc68],
    ['AddSource', 'Mem', 'Bit3', 0xdc66],
    ['AddSource', 'Mem', 'Bit6', 0xdc66],
    ['AddSource', 'Mem', 'Bit4', 0xdc67],
    ['AddSource', 'Mem', 'Bit2', 0xdc68],
    ['AddSource', 'Mem', 'Bit6', 0xdc68],
    ['AddSource', 'Mem', 'Bit3', 0xdc69],
    ['AddSource', 'Mem', 'Bit4', 0xdc69],
    ['AddSource', 'Mem', 'Bit6', 0xdc69],
    ['AddSource', 'Mem', 'Bit3', 0xdc6a],
    ['AddSource', 'Mem', 'Bit7', 0xdc69],
    ['AddSource', 'Mem', 'Bit1', 0xdc6e],
    ['AddSource', 'Mem', 'Bit6', 0xdc6d],
    ['AddSource', 'Mem', 'Bit7', 0xdc6c],
    ['AddSource', 'Mem', 'Bit6', 0xdc6c],
    ['AddSource', 'Mem', 'Bit2', 0xdc6d],
    ['AddSource', 'Mem', 'Bit2', 0xdc6e],
    ['AddSource', 'Mem', 'Bit0', 0xdc6e],
    ['AddSource', 'Mem', 'Bit4', 0xdc6d],
    ['AddSource', 'Mem', 'Bit3', 0xdc6d],
    ['AddSource', 'Mem', 'Bit0', 0xdc6d],
    ['AddSource', 'Mem', 'Bit0', 0xdc78],
    ['AddSource', 'Mem', 'Bit2', 0xdc78],
    ['AddSource', 'Mem', 'Bit5', 0xdc78],
    ['AddSource', 'Mem', 'Bit7', 0xdc78],
    ['AddSource', 'Mem', 'Bit0', 0xdc79],
    ['AddSource', 'Mem', 'Bit3', 0xdc79],
    ['AddSource', 'Mem', 'Bit6', 0xdc79],
    ['AddSource', 'Mem', 'Bit7', 0xdc79],
    ['AddSource', 'Mem', 'Bit1', 0xdc7a],
    ['AddSource', 'Mem', 'Bit2', 0xdc7a],
    ['AddSource', 'Mem', 'Bit5', 0xdc7a],
    ['AddSource', 'Mem', 'Bit1', 0xdc72],
    ['AddSource', 'Mem', 'Bit2', 0xdc72],
    ['AddSource', 'Mem', 'Bit5', 0xdc72],
    ['AddSource', 'Mem', 'Bit6', 0xdc72],
    ['AddSource', 'Mem', 'Bit1', 0xdc73],
    ['AddSource', 'Mem', 'Bit3', 0xdc73],
    ['AddSource', 'Mem', 'Bit4', 0xdc73],
    ['AddSource', 'Mem', 'Bit6', 0xdc73],
    ['AddSource', 'Mem', 'Bit0', 0xdc74],
    ['AddSource', 'Mem', 'Bit1', 0xdc74],
    ['AddSource', 'Mem', 'Bit2', 0xdc74],
    ['Measured', 'Mem', 'Bit4', 0xdc74, '=', 'Value', '', 49],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 594031,
  badge: '677173',
  title: 'Finding the Right Key',
  description: 'Collect a key in the Jungle without pressing left',
  points: 5,
  conditions: {
    core: $(
      ['', 'Mem', '8bit', gameState, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 4],
      ['', 'Mem', '8bit', currentRoomId, '<=', 'Value', '', 15],
      ['', 'Delta', '8bit', nrOfKeysCollected, '=', 'Value', '', 0],
      ['Trigger', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 1],
      ['PauseIf', 'Mem', 'Bit5', 0xc2f4, '=', 'Value', '', 1, 1],
      ...cheatProtection(),
    ),
    alt1: $(['ResetIf', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 63]),
  },
});

set.addAchievement({
  id: 594694,
  badge: '677168',
  title: 'Turbo Turok',
  description: 'Finish the Ancient City in less than 4 minutes',
  points: 5,
  conditions: {
    core: $(
      ['PauseIf', 'Mem', '8bit', pauseActive, '=', 'Value', '', 1],
      ['AndNext', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 16],
      ['AddHits', 'Mem', '8bit', currentRoomId, '<=', 'Value', '', 22],
      ['PauseIf', 'Value', '', 0, '=', 'Value', '', 1, 14400],
      ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
      ['Trigger', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 3],
      ...cheatProtection(),
    ),
    alt1: $(
      ['AndNext', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 0],
      ['ResetIf', 'Mem', '8bit', currentRoomId, '<', 'Value', '', 16],
      ['AndNext', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 0],
      ['ResetIf', 'Mem', '8bit', currentRoomId, '>', 'Value', '', 22],
    ),
  },
});

set.addAchievement({
  id: 595590,
  badge: '677269',
  title: 'So Long, Hunter',
  description: 'Beat Longhunter and collect his key without taking damage',
  points: 5,
  conditions: $(
    ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 22],
    ['AndNext', 'Delta', '8bit', bossHealth, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', bossHealth, '=', 'Value', '', 82, 1],
    ['Trigger', 'Mem', '8bit', nrOfKeysCollected, '>', 'Delta', '8bit', nrOfKeysCollected],
    ['ResetIf', 'Mem', '8bit', 0xc0f9, '<', 'Delta', '8bit', 0xc0f9],
    ['ResetIf', 'Mem', '8bit', currentRoomId, '!=', 'Value', '', 22],
  ),
});

set.addAchievement({
  id: 594705,
  badge: '677402',
  title: 'Spirit Protected',
  description: 'Finish the Catacombs with full health without dying after the Mantis fight',
  points: 10,
  conditions: {
    core: $(
      // PauseLock: If Mantis defeated and player dies, lock achievement
      ['AndNext', 'Mem', 'Bit1', 0x00c0fd, '=', 'Value', '', 1],
      ['AddHits', 'Mem', '8bit', currentLives, '<', 'Delta', '8bit', currentLives],
      ['PauseIf', 'Value', '', 0, '=', 'Value', '', 1, 1],
      // Pop condition: 3 keys collected, maxLevelUnlocked goes up
      ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
      ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 4],
      ['Trigger', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 5],
      ...cheatProtection(),
    ),
    alt1: $(
      ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 0],
      ['', 'Mem', '8bit', 0xc0f9, '=', 'Value', '', 9],
    ),
    alt2: $(
      ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', 0xc0f9, '=', 'Value', '', 7],
    ),
    alt3: $(
      ['', 'Mem', '8bit', 0xdee4, '=', 'Value', '', 2],
      ['', 'Mem', '8bit', 0xc0f9, '=', 'Value', '', 5],
    ),
    alt4: $(
      ['ResetIf', 'Mem', '8bit', currentLives, '=', 'Value', '', 0xff],
      ['', 'Value', '', 0x0, '=', 'Value', '', 0x1],
    ),
  },
});

set.addAchievement({
  id: 594711,
  badge: '677407',
  title: 'Knives Out',
  description: 'Finish the Treetrops by only having the knife as active weapon',
  points: 10,
  conditions: {
    core: $(
      ['', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 40],
      ['Trigger', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
      ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 5],
      ['Trigger', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 6],
      ['PauseIf', 'Mem', '8bit', activeWeaponSelection, '!=', 'Value', '', 0, 1],
      ...cheatProtection(),
    ),
    alt1: $(
      ['AndNext', 'Delta', '8bit', currentRoomId, '=', 'Value', '', 63],
      ['ResetIf', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 40],
    ),
  },
});

set.addAchievement({
  id: 595319,
  badge: '677412',
  title: 'Nature Lover',
  description: 'Finish the Lost Land without killing any plants or dinosaurs - killing Attack Robots or Alien Infantry is allowed',
  points: 5,
  conditions: $(
    ['', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 52],
    ['AddSource', 'Mem', 'Bit4', 0xdc66],
    ['AddSource', 'Mem', 'Bit1', 0xdc67],
    ['AddSource', 'Mem', 'Bit4', 0xdc67],
    ['AddSource', 'Mem', 'Bit6', 0xdc67],
    ['AddSource', 'Mem', 'Bit2', 0xdc68],
    ['AddSource', 'Mem', 'Bit5', 0xdc68],
    ['AddSource', 'Mem', 'Bit7', 0xdc68],
    ['AddSource', 'Mem', 'Bit1', 0xdc69],
    ['AddSource', 'Mem', 'Bit7', 0xdc69],
    ['AddSource', 'Mem', 'Bit1', 0xdc6a],
    ['AddSource', 'Mem', 'Bit4', 0xdc86],
    ['AddSource', 'Mem', 'Bit6', 0xdc86],
    ['AddSource', 'Mem', 'Bit3', 0xdc84],
    ['AddSource', 'Mem', 'Bit1', 0xdc6e],
    ['AddSource', 'Mem', 'Bit4', 0xdc6e],
    ['AddSource', 'Mem', 'Bit0', 0xdc6d],
    ['AddSource', 'Mem', 'Bit2', 0xdc6d],
    ['AddSource', 'Mem', 'Bit6', 0xdc6d],
    ['AddSource', 'Mem', 'Bit7', 0xdc6d],
    ['AddSource', 'Mem', 'Bit4', 0xdc6c],
    ['', 'Mem', 'Bit6', 0xdc6c, '=', 'Value', '', 0],
    ['Trigger', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 3],
    ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 6],
    ['Trigger', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 7],
    ...cheatProtection(),
  ),
});

set.addAchievement({
  id: 618283,
  badge: '702297',
  title: 'High Energy Diet',
  description: 'Defeat T-Rex while only having the Pulse Rifle as active weapon',
  points: 5,
  type: 'missable',
  conditions: $(
    ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 0x3c],
    // Require one hit for loading of T-Rex (health from 0 to 240)
    ['AndNext', 'Delta', '8bit', bossHealth, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', bossHealth, '=', 'Value', '', 240, 1],
    // Trigger on T-Rex defeated
    ['Trigger', 'Mem', '8bit', tRexState, '=', 'Value', '', 0x02],
    // Reset if active weapon is not Pulse Rifle or player left room
    ['ResetIf', 'Mem', '8bit', activeWeaponSelection, '!=', 'Value', '', 0x05],
    ['ResetIf', 'Mem', '8bit', currentRoomId, '!=', 'Value', '', 0x3c],
  ),
});

set.addAchievement({
  id: 595507,
  badge: '677421',
  title: 'Doing Things the Hard Way',
  description: 'Beat the Campaigner without using the Chronoscepter',
  points: 5,
  conditions: {
    core: $(
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 62],
      ['', 'Delta', '8bit', campaignerState, '=', 'Value', '', 0],
      ['', 'Mem', '8bit', campaignerState, '=', 'Value', '', 2],
      ...cheatProtection(),
    ),
    alt1: $(
      ['', 'Mem', '8bit', 0xc1bb, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', 0xc1ad, '=', 'Value', '', 3],
    ),
    alt2: $(['', 'Mem', '8bit', 0xc1bb, '=', 'Value', '', 0]),
  },
});

/* ========= LEADERBOARDS ========= */

set.addLeaderboard({
  id: 158907,
  title: 'Ancient Ruins Speedrun',
  description: 'Finish the Ancient Ruins',
  lowerIsBetter: true,
  type: 'FRAMES',
  conditions: {
    start: $(
      ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
      ['', 'Delta', '8bit', currentRoomId, '=', 'Value', '', 63],
      ['', 'Mem', '8bit', currentRoomId, '=', 'Value', '', 16],
      ['', 'Mem', '8bit', nrOfKeysCollected, '=', 'Value', '', 0],
      ...cheatProtection(),
    ),
    cancel: $(
      ['OrNext', 'Mem', '8bit', currentRoomId, '<', 'Value', '', 16],
      ['', 'Mem', '8bit', currentRoomId, '>', 'Value', '', 22],
      ['', 'Mem', '8bit', nrOfKeysCollected, '<', 'Value', '', 3],
    ),
    submit: $(
      ['', 'Delta', '8bit', maxLevelUnlocked, '=', 'Value', '', 2],
      ['', 'Mem', '8bit', maxLevelUnlocked, '=', 'Value', '', 3],
    ),
    value: $(
      ['AndNext', 'Mem', '8bit', currentRoomId, '>=', 'Value', '', 16],
      ['AndNext', 'Mem', '8bit', currentRoomId, '<=', 'Value', '', 22],
      ['Measured', 'Mem', '8bit', pauseActive, '!=', 'Value', '', 1],
    ),
  },
});

export default set;

/* ========= RICH PRESENCE ========= */

/*
Lookup:CurrentRoom
0x00-0x03=In the Hub Ruins
0x04-0x0f=In the Jungle
0x10-0x15=In the Ancient City
0x16=Fighting Longhunter
0x17-0x20=In the Ruins
0x21-0x26=In the Catacombs
0x27=Fighting Mantis
0x28-0x33=In the Treetop Village
0x34-0x39=In the Lost Land
0x3a-0x3b,0x3d=In the Final Confrontation
0x3c=Fighting T-Rex
0x3e=Fighting the Campaigner
0x3f=Moving between portals

Lookup:Difficulty
0x0=Easy
0x1=Medium
0x2=Hard

Lookup:Weapon
0x0=Knife
0x1=Tek Bow
0x2=Pistol
0x3=Shotgun
0x4=Assault Rifle
0x5=Pulse Rifle
0x6=Minigun
0x7=Automatic Shotgun
0x8=Grenade Launcher
0x9=Alien Weapon
0xa=Quad Rocket Launcher
0xb=Particle Accelerator
0xc=Fusion Cannon
0xd=Chronoscepter

Lookup:Cheats
0x0=
0x1-0x5= • Codes used:

Lookup:WeaponsCheat
0x0=
0x1= WPS

Lookup:LivesCheat
0x0=
0x1= LVS

Lookup:EnergyCheat
0x0=
0x1= NRG

Lookup:LevelSelectCheat
0x0=
0x1= LVL

Lookup:BirdCheat
0x0=
0x1= BRD

Display:
?0xH00c2d3!=1?In the Menu
?0xH00c2d3=1?@CurrentRoom(0xH00df96) with @Weapon(0xH00fffc) on @Difficulty(0xH00dee4) • @Number(0xH00c0fb) keys • @Number(0xH00c0fa) lives • @Number(0xH00c0f9) HP@Cheats(A:0xH00c0e2_A:0xH00c0e3_A:0xH00c0e4_A:0xH00c0e5_A:0xH00c0e6_M:0)@WeaponsCheat(0xH00c0e2)@LivesCheat(0xH00c0e3)@EnergyCheat(0xH00c0e4)@LevelSelectCheat(0xH00c0e5)@BirdCheat(0xH00c0e6)
Playing Turok: Battle of the Bionosaurs
*/
