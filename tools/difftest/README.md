# Differential testing

Verifies that the JS engine port (`src/engine/`) behaves exactly like the C
[rcheevos](https://github.com/RetroAchievements/rcheevos) library. Both sides
evaluate the same trigger over the same RAM frames, and the per-frame output
(state, measured value, every hit count) is compared verbatim.

Not published with the npm package - repo only.

## Building the C harness

`c-harness` wraps the real C library and speaks a simple stdin/stdout
protocol (see the header of `c-harness.c`). Build it against a rcheevos
checkout (develop branch):

```bash
git clone --branch develop https://github.com/RetroAchievements/rcheevos.git /tmp/rcheevos
cd /tmp/rcheevos
gcc -O2 -o <repo>/tools/difftest/c-harness \
  <repo>/tools/difftest/c-harness.c \
  src/rcheevos/*.c src/rc_util.c src/rc_compat.c src/rhash/md5.c \
  -I include -I src -I src/rcheevos -lm
```

`js-harness.js` is the JS counterpart: same protocol, same output format,
running the port. It is used as a library by the runners below, or standalone
for debugging a single case:

```bash
printf 'B:1_B:0xH0000_0xH0001=10\n2 16\n00120000000000000000000000000000\n07120000000000000000000000000000\n' \
  | node tools/difftest/js-harness.js     # or | ./tools/difftest/c-harness
```

## The test kinds

### fuzz.js - random triggers, random RAM

Generates random trigger definitions (all flags, sizes, operators, hit
targets, alt groups, `{recall}`) and random 16-byte RAM sequences; runs both
sides and diffs every frame. Also checks that parse errors occur on the same
inputs. Deterministic per seed.

```bash
node tools/difftest/fuzz.js              # 1000 cases, default seed
node tools/difftest/fuzz.js 5000 424242  # <iterations> <seed>
```

Note: the generator avoids two shapes that are still undefined behavior in
upstream rcheevos (a SubSource with a float-constant or `{recall}` operand
directly followed by another SubSource) - there is nothing defined to
compare against.

### targeted-subsource.js - fixed regression definitions

A curated list of definitions around the SubSource-chain-starting-with-a-
constant fix (rcheevos #528): constant variants, longer chains,
delta/prior/BCD reads, floats, bound/unbound `{recall}`. Each runs over many
random RAM sequences.

```bash
node tools/difftest/targeted-subsource.js       # 50 rounds per definition
node tools/difftest/targeted-subsource.js 200   # more rounds
```

### corpus - real achievements from RetroAchievements

Two steps. `fetch-corpus.js` downloads raw definitions (achievements,
leaderboards, rich presence) per game via the RA Connect API into
`corpus/` (gitignored). It needs your Web API key plus Connect token and
deliberately drips requests - see the file header for credentials and
options:

```bash
node tools/difftest/fetch-corpus.js login          # prints RA_TOKEN
RA_USER=... RA_TOKEN=... RA_API_KEY=... node tools/difftest/fetch-corpus.js --max-games 1000
```

`corpus-run.js` then diffs every unique achievement definition: parse
outcomes first, then evaluation over generated RAM. Because random bytes
almost never satisfy real comparisons, RAM is "directed": the trigger is
analyzed for referenced addresses, the constants they are compared against
(written back properly sized/encoded), and AddAddress pointer bases (pointed
into the RAM window). A fully random sequence runs as a control.

```bash
node tools/difftest/corpus-run.js                  # everything (~8 min for 66k defs)
node tools/difftest/corpus-run.js --parse-only     # quick parse sweep
node tools/difftest/corpus-run.js --max 500        # subset
```

Mismatches are written to `corpus/mismatches.jsonl`; the summary line also
reports how much of the corpus reached hits/triggered/paused/reset states
(a sanity check that the directed RAM actually exercises the logic).

## When to run what

- After touching `src/engine/`: `npm test`, then `fuzz.js` with a few seeds.
- After syncing with a new rcheevos version: rebuild `c-harness`, run all
  three (and re-fetch the corpus occasionally - newest sets first, the fetch
  is resumable).
