import {AchievementSet, define as $} from '@cruncheevos/core';

const set = new AchievementSet({gameId: 2563, title: 'The Rugrats Movie'});

const stageCompletion = 0xc0bd;
const levelId = 0xde09;
const subLevelId = 0xc259;
const specialItemNeeded = 0xc218;
const difficulty = 0xde02;
const itemsNeeded = 0xc217;
const itemsCollected = 0xc276;


/* ========= PROGRESSION ========= */

const levelFinished = (level) => {
  return [
    ['', 'Delta', '8bit', stageCompletion, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', stageCompletion, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', levelId, '=', 'Value', '', level],
  ];
};


set.addAchievement({
  id: 567982,
  badge: '645630',
  title: 'Baby Steps',
  description: 'Finish the House level',
  points: 5,
  type: 'progression',
  conditions: $(
    ...levelFinished(0),
    ['', 'Mem', '8bit', subLevelId, '=', 'Value', '', 3],
  ),
});

set.addAchievement({
  id: 567205,
  badge: '644474',
  title: 'The Key to Escape',
  description: 'Pick up the Key in the Hospital',
  points: 3,
  type: 'progression',
  conditions: $(
    ['', 'Delta', '8bit', specialItemNeeded, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', specialItemNeeded, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', levelId, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', subLevelId, '!=', 'Value', '', 8],
    ['', 'Mem', '8bit', subLevelId, '=', 'Mem', '8bit', 0xc21f],
  ),
});

set.addAchievement({
  id: 567316,
  badge: '644535',
  title: 'Into My Arms, Brother!',
  description: 'Pick up Dil in the Hospital',
  points: 1,
  type: 'progression',
  conditions: $(
    ['', 'Delta', '8bit', specialItemNeeded, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', specialItemNeeded, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', levelId, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', subLevelId, '=', 'Value', '', 8],
  ),
});

set.addAchievement({
  id: 567986,
  badge: '645634',
  title: 'Baby Store',
  description: 'Finish the Hospital level',
  points: 10,
  type: 'progression',
  conditions: $(
    ...levelFinished(1),
    // Needed because other sublevels also trigger stageCompletion.
    // Only after finishing the last room (id=8), the whole level is completed.
    ['', 'Mem', '8bit', subLevelId, '=', 'Value', '', 8],
  ),
});

set.addAchievement({
  id: 567204,
  badge: '644473',
  title: 'You Got Sponsatility Now',
  description: 'Pick up the clock at the Train Crash Site',
  points: 2,
  type: 'progression',
  conditions: $(
    ['', 'Delta', '8bit', specialItemNeeded, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', specialItemNeeded, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', levelId, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567988,
  badge: '645636',
  title: 'Monkey Circus',
  description: 'Finish the Train Crash level',
  points: 10,
  type: 'progression',
  conditions: $(
    ...levelFinished(2),
  ),
});

set.addAchievement({
  id: 567990,
  badge: '645638',
  title: 'It Looks Kinda Like the Park',
  description: 'Finish the Light Woods level',
  points: 5,
  type: 'progression',
  conditions: $(
    ...levelFinished(3),
  ),
});

const babyPosition = 0xc898;

set.addAchievement({
  id: 567317,
  badge: '644537',
  title: 'All He Does Is Cry and Poop',
  description: 'Pick up Dil in the Dark Woods',
  points: 2,
  type: 'progression',
  conditions: $(
    ['', 'Delta', '8bit', specialItemNeeded, '=', 'Value', '', 2],
    ['', 'Mem', '8bit', specialItemNeeded, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', levelId, '=', 'Value', '', 4],
    // After collecting Dil (the baby), the sprite literally moves up into the top bar.
    // This seems to be the only way to distinguish it from riding the minecart, which also triggers specialItemNeeded.
    ['', 'Mem', '8bit', babyPosition, '=', 'Value', '', 142],
  ),
});

set.addAchievement({
  id: 567992,
  badge: '645640',
  title: 'Sleep and Dream the Night Away',
  description: 'Finish the Dark Woods level',
  points: 10,
  type: 'progression',
  conditions: $(
    ...levelFinished(4),
  ),
});

set.addAchievement({
  id: 567994,
  badge: '645642',
  title: 'Aqua Reptar',
  description: 'Finish the Reptar Ride level',
  points: 5,
  type: 'progression',
  conditions: $(
    ...levelFinished(5),
  ),
});

set.addAchievement({
  id: 567984,
  badge: '645632',
  title: 'Okey-Dokey Jones',
  description: 'Finish the Ancient Ruins level',
  points: 25,
  type: 'win_condition',
  conditions: $(
    ...levelFinished(6),
  ),
});

/* ========= PROGRESSION - HARD ========= */

set.addAchievement({
  id: 567983,
  badge: '645631',
  title: 'Hang on to Your Diapies, Babies',
  description: 'Finish the House level on Hard difficulty',
  points: 10,
  conditions: $(
    ...levelFinished(0),
    ['', 'Mem', '8bit', subLevelId, '=', 'Value', '', 3],
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567987,
  badge: '645635',
  title: 'All Natural Zen Experience',
  description: 'Finish the Hospital level on Hard difficulty',
  points: 10,
  conditions: $(
    ...levelFinished(1),
    ['', 'Mem', '8bit', subLevelId, '=', 'Value', '', 8],
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567989,
  badge: '645637',
  title: 'Real Monkey Business',
  description: 'Finish the Train Crash level on Hard difficulty',
  points: 10,
  conditions: $(
    ...levelFinished(2),
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567991,
  badge: '645639',
  title: 'More Fun than Picking Noses',
  description: 'Finish the Light Woods level on Hard difficulty',
  points: 10,
  conditions: $(
    ...levelFinished(3),
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567993,
  badge: '645641',
  title: 'Actual Danger',
  description: 'Finish the Dark Woods level on Hard difficulty',
  points: 10,
  conditions: $(
    ...levelFinished(4),
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567995,
  badge: '645643',
  title: 'The Ultimate in Toddler Transportation',
  description: 'Finish the Reptar Ride level on Hard difficulty',
  points: 1,
  conditions: $(
    ...levelFinished(5),
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

set.addAchievement({
  id: 567996,
  badge: '645644',
  title: 'This Place Gives Me the Juicebumps',
  description: 'Finish the Ancient Ruins level on Hard difficulty',
  points: 25,
  conditions: $(
    ...levelFinished(6),
    ['', 'Mem', '8bit', difficulty, '=', 'Value', '', 2],
  ),
});

/* ========= CHALLENGES ========= */

set.addAchievement({
  id: 567203,
  badge: '644472',
  title: 'Overachiever',
  description: 'Collect 20 more items than needed in any level',
  points: 5,
  conditions: $(
    ['SubSource', 'Delta', '8bit', itemsNeeded],
    ['', 'Delta', '8bit', itemsCollected, '<', 'Value', '', 20],
    ['SubSource', 'Mem', '8bit', itemsNeeded],
    ['', 'Mem', '8bit', itemsCollected, '=', 'Value', '', 20],
    ['', 'Mem', '8bit', itemsCollected, '>=', 'Value', '', 20],
    ['', 'Mem', '8bit', levelId, '<', 'Value', '', 7],
  ),
});

const cellarMachineActivated = 0xc27c;

set.addAchievement({
  id: 567202,
  badge: '644471',
  title: 'Mysterious Machine',
  description: 'Activate a machine in the cellar',
  points: 1,
  conditions: $(
    ['', 'Delta', '8bit', cellarMachineActivated, '=', 'Value', '', 0],
    ['', 'Mem', '8bit', cellarMachineActivated, '=', 'Value', '', 1],
    ['', 'Mem', '8bit', levelId, '=', 'Value', '', 0],
  ),
});

set.addAchievement({
  id: 567985,
  badge: '645633',
  title: 'The Bestest',
  description: 'Beat Tommy\'s high score of 124,000 and reach the top of the high score board',
  points: 10,
  conditions: $(
    ['', 'Mem', 'Lower4', 0xde29, '<', 'Value', '', 15],
    ['AddSource', 'Mem', 'Lower4', 0xde2e],
    ['AddSource', 'Mem', 'Lower4', 0xde2d, '*', 'Value', '', 10],
    ['AddSource', 'Mem', 'Lower4', 0xde2c, '*', 'Value', '', 100],
    ['AddSource', 'Mem', 'Lower4', 0xde2b, '*', 'Value', '', 1000],
    ['AddSource', 'Mem', 'Lower4', 0xde2a, '*', 'Value', '', 10000],
    ['AddSource', 'Mem', 'Lower4', 0xde29, '*', 'Value', '', 0x186a0],
    ['', 'Value', '', 0, '>', 'Value', '', 0x1e460],
    ['AddSource', 'Delta', 'Lower4', 0xde2e],
    ['AddSource', 'Delta', 'Lower4', 0xde2d, '*', 'Value', '', 10],
    ['AddSource', 'Delta', 'Lower4', 0xde2c, '*', 'Value', '', 100],
    ['AddSource', 'Delta', 'Lower4', 0xde2b, '*', 'Value', '', 1000],
    ['AddSource', 'Delta', 'Lower4', 0xde2a, '*', 'Value', '', 10000],
    ['AddSource', 'Delta', 'Lower4', 0xde29, '*', 'Value', '', 0x186a0],
    ['', 'Value', '', 0, '=', 'Value', '', 0x1e460],
  ),
});

set.addAchievement(
  {
    id: 567997,
    badge: '645645',
    title: 'Minimalist',
    description: 'Finish the Reptar Ride level with only 1 item collected',
    points: 5,
    conditions: $(
      ['', 'Delta', '8bit', stageCompletion, '=', 'Value', '', 0],
      ['Trigger', 'Mem', '8bit', stageCompletion, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', levelId, '=', 'Value', '', 5],
      ['', 'Mem', '8bit', itemsCollected, '<=', 'Value', '', 1],
    ),
  },
);


/* ========= LEADERBOARDS ========= */

set.addLeaderboard({
  id: 148967,
  title: 'High Score',
  description: 'Score the most points',
  lowerIsBetter: false,
  type: 'SCORE',
  conditions: {
    start: $(
      ['', 'Delta', '8bit', stageCompletion, '=', 'Value', '', 0],
      ['', 'Mem', '8bit', stageCompletion, '=', 'Value', '', 1],
      ['', 'Mem', '8bit', levelId, '=', 'Value', '', 6],
    ),
    cancel: '0=1',
    submit: '0=0',
    value: $(
      ['AddSource', 'Mem', 'Lower4', 0xd500],
      ['AddSource', 'Mem', 'Lower4', 0xd4ff, '*', 'Value', '', 10],
      ['AddSource', 'Mem', 'Lower4', 0xd4fe, '*', 'Value', '', 100],
      ['AddSource', 'Mem', 'Lower4', 0xd4fd, '*', 'Value', '', 1000],
      ['AddSource', 'Mem', 'Lower4', 0xd4fc, '*', 'Value', '', 10000],
      ['AddSource', 'Mem', 'Lower4', 0xd4fb, '*', 'Value', '', 0x186a0],
      ['Measured', 'Mem', '8bit', itemsCollected, '*', 'Value', '', 500],
    ),
  },
});

export default set;

/* ========= RICH PRESENCE ========= */

/*
Lookup:Level
0=Exploring the House
1=In the Hospital
2=At the Train Crash
3=In the Light Woods
4=In the Dark Woods
5=At Reptar Ride
6=In the Ancient Ruins

Lookup:Difficulty
0=Easy
1=Medium
2=Hard

Display:
?0xH00de09=hff?In the Menu
?0xH00de09<=6?@Level(0xHde09) on @Difficulty(0xH00de02) • @Number(0xHc276)/@Number(0xHc217) items • Score @Score(A:0xL00d500_A:0xL00d4ff*10_A:0xL00d4fe*100_A:0xL00d4fd*1000_A:0xL00d4fc*10000_A:0xL00d4fb*100000_M:0)
Playing the game our forefathers played, and our five-fathers and our six-fathers and I'm not stoppin' now.
*/