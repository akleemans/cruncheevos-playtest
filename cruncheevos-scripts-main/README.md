cruncheevos-scripts
===================

My [cruncheevos](https://github.com/suXinjke/cruncheevos) scripts for [RetroAchievements](https://retroachievements.org/).

Sets:

* [The Rugrats Movie](https://retroachievements.org/game/2563): rugrats.js
* [Turok: Battle of the Bionosaurs](https://retroachievements.org/game/13955): turok.js
* [Monster Force](https://retroachievements.org/game/5260): monster-force.js

## Setup

1. Install dependencies: `npm install`
2. Create `.env` file with `RACACHE=C:\path\to\RALibretro`

## Usage

See [@cruncheevos/cli](https://github.com/suXinjke/cruncheevos/tree/master/packages/cli) for details.

* Import set: `npx cruncheevos generate 5260 monster-force.js` (possibly with `--include-unofficial`)
* Diff set: `npx cruncheevos diff monster-force.js`
* Save to local: `npx cruncheevos save monster-force.js`
* Lint: `npx eslint monster-force.js --fix`
