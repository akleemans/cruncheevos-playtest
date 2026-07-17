# How RetroAchievements achievements work

This is a condensed guide to the achievement *trigger* model implemented by
[rcheevos](https://github.com/RetroAchievements/rcheevos) (the library
emulators embed) and ported to JavaScript in this repo. The authoritative
reference is the [RA developer docs](https://docs.retroachievements.org/developer-docs/achievement-development-overview.html)
and the rcheevos source itself.

## The big picture

An achievement is a **trigger**: one **core group** plus zero or more **alt
groups**. Every group is a list of **conditions**. Once per emulated frame,
the runtime evaluates the whole trigger against the game's memory:

> The trigger fires when the **core group is true** and — if any alt groups
> exist — **at least one alt group is also true**.

A group is true when all of its conditions are true (subject to the flag
logic below). There is no "OR" between conditions inside a group other than
`OrNext`; alt groups are the coarse-grained OR.

Evaluation is *stateful*: conditions accumulate **hit counts** across frames,
and memory reads remember their previous values (**Delta**/**Prior**). That's
what allows "did X happen after Y", "held for 5 seconds", "value increased",
etc. — all with only a per-frame snapshot of memory.

### Trigger states

The runtime keeps a state per achievement (mirrored by this port as strings):

| state | meaning |
|---|---|
| `waiting` | Initial state. The trigger may not fire until it has been false for at least one frame — protects against popping instantly on load when the condition is already true. |
| `active` | Normal state, may fire. |
| `paused` | Every group that could satisfy the trigger is paused by a `PauseIf`. |
| `primed` | Everything except `Trigger`-flagged conditions is true (used for the on-screen "challenge indicator"). |
| `reset` | Transient result: a `ResetIf` (or `ResetNextIf`) cleared some hit counts this frame. |
| `triggered` | The achievement popped. Permanent; further evaluation returns `inactive`. |
| `inactive` / `disabled` | Not being processed (memory reads still update while `inactive`). |

## Condition anatomy

Serialized, a condition looks like `P:0xH3598=3.1.` or `d0xH35b8=0`:

```
[flag:] operand1 [operator operand2] [(hits)]
```

- **flag** — changes the condition's role (table below). No flag = a plain
  comparison that must be true.
- **operand** — a memory read, a constant, or a derived value.
- **operator** — comparisons `=` `!=` `<` `<=` `>` `>=`, or *modifying*
  operators `*` `/` `+` `-` `&` `^` `%` (only meaningful on combining flags
  like `AddSource`).
- **hits** — `(N)` (or legacy `.N.`): a **hit target**, see below.

Groups are serialized with `_` between conditions and `S` between groups:
`<core>S<alt1>S<alt2>`. This is exactly what cruncheevos'
`condition.toString()` produces.

### Memory operands

A memory operand is a size prefix + address, optionally preceded by an
access modifier:

| prefix | size |
|---|---|
| `0xH` | 8-bit |
| `0x ` / `0x` | 16-bit (little-endian) |
| `0xW` | 24-bit |
| `0xX` | 32-bit |
| `0xL` / `0xU` | low / high nibble |
| `0xM` … `0xT` | single bits 0–7 |
| `0xK` | bitcount of the byte |
| `0xI` / `0xJ` / `0xG` | 16/24/32-bit big-endian |
| `fF` `fB` `fH` `fI` `fM` `fL` | float, float BE, double32, double32 BE, MBF32, MBF32 LE |

Access modifiers:

| modifier | meaning |
|---|---|
| *(none)* | `Mem` — the value this frame |
| `d` | `Delta` — the value the previous frame |
| `p` | `Prior` — the last *different* value (survives frames without change) |
| `b` | BCD-decoded value |
| `~` | bit-inverted value |

Constants: decimal (`42`), hex (`h2A`), signed (`v-10`), float (`f1.5`),
and `{recall}` (see `Remember`).

Important detail: all reads of the same address+size share one internal
record (a *memref*), updated once per frame. `Delta`/`Prior` are properties
of that shared record. A quirk that falls out of this: comparing a memref
with a Delta *of the same address* is implemented as pure change-detection
(`=`/`<=`/`>=` are true whenever the value didn't change this frame).

### Hit counts

Every condition counts how many frames it has been true (its **hit count**).
With a hit target `(N)`, the condition becomes true — and *stays* true — once
it has been true N times (not necessarily consecutively). Once the target is
reached the count stops increasing. Hit counts only ever go back to zero via
`ResetIf`/`ResetNextIf` (or a `PauseIf` without a target, which clears its
own count when false).

`(1)` is the common "this happened at some point" latch, e.g. in a multi-step
chain.

## Condition flags

Links go to the RA docs, which have worked examples.

**Combining flags** (they modify the *next* condition; chains read top-down):

| flag | name | effect |
|---|---|---|
| `A:` | [AddSource](https://docs.retroachievements.org/developer-docs/flags/addsource.html) | Adds its (possibly `*`/`&`/…-modified) left operand into the next condition's left operand. |
| `B:` | [SubSource](https://docs.retroachievements.org/developer-docs/flags/subsource.html) | Same, but subtracts. |
| `I:` | [AddAddress](https://docs.retroachievements.org/developer-docs/flags/addaddress.html) | Pointer indirection: adds its value to the *address* used by the next condition (both operands). |
| `C:` | [AddHits](https://docs.retroachievements.org/developer-docs/flags/addhits-subhits.html) | Adds its own hit count into the next condition's hit-target check. |
| `D:` | [SubHits](https://docs.retroachievements.org/developer-docs/flags/addhits-subhits.html) | Subtracts its hit count from the next condition's hit-target check. |
| `N:` | [AndNext](https://docs.retroachievements.org/developer-docs/flags/andnext-ornext.html) | The next condition only counts as true if this one is also true. |
| `O:` | [OrNext](https://docs.retroachievements.org/developer-docs/flags/andnext-ornext.html) | The next condition counts as true if either is true. |
| `Z:` | [ResetNextIf](https://docs.retroachievements.org/developer-docs/flags/resetnextif.html) | While true, keeps the *next* condition's hit count at zero (scoped ResetIf). |
| `K:` | [Remember](https://docs.retroachievements.org/developer-docs/flags/remember.html) | Stores its computed value; later operands can read it back with `{recall}`. |

**Behavior flags:**

| flag | name | effect |
|---|---|---|
| `R:` | [ResetIf](https://docs.retroachievements.org/developer-docs/flags/resetif.html) | While true, resets **all hit counts in the whole trigger** (all groups) and prevents it from firing. |
| `P:` | [PauseIf](https://docs.retroachievements.org/developer-docs/flags/pauseif.html) | While true, freezes **its own group**: no hit counting, no resets from this group, group counts as false. With a hit target, the pause *latches* — once hit, the group stays paused until those hits are reset from another group. |
| `T:` | [Trigger](https://docs.retroachievements.org/developer-docs/flags/trigger.html) | The condition must still be true to fire, but while everything *else* is true the achievement is "primed" (challenge indicator). |
| `M:` | [Measured](https://docs.retroachievements.org/developer-docs/flags/measured.html) | Publishes progress (value or hit count) toward a target, e.g. "743/1000" under the badge. `G:` is the same but displayed as a percentage. |
| `Q:` | [MeasuredIf](https://docs.retroachievements.org/developer-docs/flags/measured.html#using-measured-if-with-measured) | Progress is only shown/updated while this condition is true. |

## Evaluation order and subtleties

These are the details that make or break real achievements — the port
reproduces them exactly:

1. **Pauses run first.** Within a group, `PauseIf` conditions (with their
   combining chains) are evaluated before everything else. If any is true,
   the *whole group* is skipped this frame: nothing tallies, and crucially a
   `ResetIf` **in the same group** is ignored. This is why the Monster Force
   scripts put `levelSelectReset` in a separate alt group — a reset must not
   live in a group that might be paused.
2. **Then resets.** `ResetIf` conditions are evaluated next; if any fires,
   all hit counts in *every* group are cleared (pause-latched groups keep
   being paused only if their pause hits survive — they don't, a reset clears
   them too). A reset also forces the trigger false this frame.
3. Then conditions with hit targets, then `Measured`/`MeasuredIf`, then the
   rest. (You don't normally need to know this, but it explains some edge
   cases with `{recall}` across pause boundaries.)
4. **PauseIf without a hit target** clears its own hit count whenever it is
   false. With a hit target it latches (see table).
5. **Paused groups still count as false** for the "core + at least one alt"
   check; if *all* groups that could complete the trigger are paused, the
   whole trigger reports `paused`.
6. **The waiting state**: when an achievement is (re)activated it starts
   `waiting` and cannot fire until it evaluated false at least once.
7. **Measured across groups**: with multiple `Measured` conditions (same
   target, different groups), the largest current value wins. A paused group
   keeps its last published value.

## From cruncheevos to the wire format

The cruncheevos arrays map 1:1 onto condition fields:

```js
//  flag       lvalue                 cmp   rvalue           hits
['PauseIf',   'Mem', '8bit', 0x3598, '=', 'Value', '', 3,    1]
// serializes to:  P:0xH3598=3.1.
```

`achievement.conditions` (array of groups) joined with `_` and `S` is the
exact string rcheevos parses — and what `parseTrigger()` in this repo
accepts. The harness helper `achievementToTriggerDefinition()` does this for
you.

## Testing achievements with cruncheevos-playtest

```js
import { runTrigger } from 'cruncheevos-playtest';
import set from './my-game/my-game.js';

const achievement = Object.values(set.achievements)
  .find(a => a.title === 'Welcome to Monsterland');

// frames: one memory snapshot per emulated frame (sparse byte maps here)
const { triggeredFrame, states } = runTrigger(achievement, frames);
```

That's the low-level path; in practice you'll record Test Scenarios in
BizHawk and use `runAchievement()` from the testing helpers —
see the package README for the full workflow.
