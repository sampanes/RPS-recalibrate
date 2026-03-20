# Rock · Paper · Scissors — Ink & Wash Edition

A watercolor-inspired Rock Paper Scissors game with countdown timing and an adaptive AI that learns your patterns.

**[Play it here →](https://sampanes.github.io/RPS-recalibrate/)**

## How to play

- **Desktop:** Hover the arena to start the countdown, then press `1` (Rock), `2` (Paper), or `3` (Scissors) between "3" and "SHOOT!"
- **Mobile:** Tap any of the three move buttons — they also start the round if you're idle

## Features

- Countdown timing with a forgiving input window
- Adaptive AI that tracks your move history after enough rounds
- Animated watercolor background
- Haptic feedback on mobile

## Development

```bash
npm install
npm run dev
```

Built with React, Vite, TypeScript, and Tailwind CSS.

## Simulation

Want to know how the AI performs over hundreds of games without clicking anything?
The simulator runs the game's AI in a tight loop — no browser, no timers, no React —
and spits out a chart you can open in any browser.

```bash
# Run once (no args) to compare every built-in player style against each other.
# Opens: scripts/sim-output.html
npx tsx scripts/simulate.ts
```

**Player styles you can test with `--strategy`:**

| Strategy | What it does |
|---|---|
| `random` | Picks rock/paper/scissors at random every round |
| `perfect` | Waits and watches — if the bot tips its hand early, counters it; random otherwise |
| `fire-at-will` | Throws immediately before seeing any early reveal |
| `always-rock` | Always throws rock (good stress test for the adaptive AI) |
| `cycle` | Rotates R → P → S in a fixed loop |
| `counter-history` | Tracks what the bot throws most often and counters it |

```bash
# Play 1000 games as the "perfect" player (best-case for the human)
npx tsx scripts/simulate.ts --games 1000 --strategy perfect

# Play 1000 games as "fire-at-will" (worst-case — never sees early reveals)
npx tsx scripts/simulate.ts --games 1000 --strategy fire-at-will
```

**Config sweeps** — run the same simulation multiple times with one variable changed,
and get one chart line per value. Useful for tuning feel:

```bash
# How soon should the AI start adapting? Try thresholds of 5, 10, 20, 30, 50 games.
npx tsx scripts/simulate.ts --sweep ADAPTIVE_THRESHOLD 5,10,20,30,50

# How much should the AI randomize to feel beatable? 0 = pure counter, 0.4 = noisy
npx tsx scripts/simulate.ts --sweep ADAPTIVE_NOISE 0,0.1,0.2,0.4,0.6

# How hard should the AI cheat (look at current move)? 1.0 = always wins, 0.5 = half history-based
npx tsx scripts/simulate.ts --sweep ADAPTIVE_WIN_RATE 0.5,0.7,0.9,1.0

# How often does the bot commit to a move before the player picks? 0 = never, 1 = always
npx tsx scripts/simulate.ts --sweep IMBALANCE_PROBABILITY 0,0.2,0.4,0.6,0.8
```

After any run, open `scripts/sim-output.html` in a browser. You'll see a cumulative
win-rate chart (one line per variant) and a summary table. Random chance is ~33% —
anything well above that means the strategy is exploiting the AI.

See `SIMULATION.md` for full documentation.

## Testing

Unit and hook tests use [Vitest](https://vitest.dev/). Tests live in `src/__tests__/`.

```bash
npm test            # single run (pass/fail)
npm run test:watch  # watch mode — re-runs on file save
```

| File | What it covers |
|---|---|
| `src/__tests__/computerAI.test.ts` | All 9 `determineOutcome` combos, adaptive countering, cheat mode, strategy overrides |
| `src/__tests__/useGameState.test.tsx` | Phase state machine, input handling, miss detection, scoring |

See `TESTING.md` for the full testing plan and rationale.

## AI tuning baseline

The three knobs that most affect feel are `ADAPTIVE_WIN_RATE`, `IMBALANCE_PROBABILITY`,
and `ADAPTIVE_NOISE`. Here's the current baseline and the reasoning behind it.

### How the bot wins (post-threshold breakdown)

There are two distinct win mechanisms, and they feel very different to a player:

**Imbalance** (`IMBALANCE_PROBABILITY`): The bot commits to a move *before* the player
picks. It uses history-based prediction only (can't cheat — it doesn't know your move yet).
This is the cleanest form of the illusion: the bot genuinely "called it" first. An
observant player can sometimes exploit it (if the bot tips its hand early enough to see),
but a typical player just feels like the bot predicted them. This is the mechanism worth leaning into.

**Cheat** (`ADAPTIVE_WIN_RATE`): After the player picks, the bot looks at the actual move
and returns the counter. Near-guaranteed win, but the most "fake" mechanism. At 90% this
dominates the experience and can feel arbitrary or rigged if a player suspects it.

**History-based adaptive** (the fallback): When neither imbalance nor cheat fires, the
bot counters the player's most frequent historical move. This improves gradually as history
builds — it creates a natural win-rate curve rather than a step function. It's also the
most "honest" AI the game has.

### Current values and why

| Param | Old | Current | Reasoning |
|---|---|---|---|
| `IMBALANCE_PROBABILITY` | 0.40 | **0.55** | Majority of rounds the bot commits first. More opportunities for the "how did it know?" moment without being so frequent that an observant player can farm it. |
| `ADAPTIVE_WIN_RATE` | 0.90 | **0.65** | Cuts the raw cheat share from ~54% of all rounds to ~29%. The freed rounds fall through to history-based adaptive, creating a more gradual win-rate climb that feels earned rather than sudden. Less likely to feel obviously rigged. |
| `ADAPTIVE_NOISE` | 0.20 | **0.15** | History-reading is now doing more work (WIN_RATE is lower), so sharpen it slightly. 15% random bleed is still enough that a player can't perfectly game it by planting a fake pattern. |
| `ADAPTIVE_THRESHOLD` | 20 | **20** | Left alone — grounded in Stetson et al. 2006 recalibration timeline. Don't guess at this one without data. |

### Rough expected win rates (vs. random player)

| Phase | Old config | Current config |
|---|---|---|
| Games 0–19 (random) | ~33% | ~33% |
| Games 20+ | ~69% | ~58% |

The drop from 69% to 58% is intentional. 69% can feel crushing and arbitrary within a
few rounds of the threshold. 58% is still well above chance and builds more gradually
as history accumulates, which should feel more like "this bot is uncannily good" than
"this bot is clearly broken."

### Suggested sweeps to validate

```bash
# See the win-rate curve shape as cheat rate varies — look for gradual vs. step-function
npx tsx scripts/simulate.ts --sweep ADAPTIVE_WIN_RATE 0,0.3,0.5,0.65,0.9 --strategy random

# Compare observant vs. non-observant player at current imbalance probability
npx tsx scripts/simulate.ts --games 1000 --strategy perfect
npx tsx scripts/simulate.ts --games 1000 --strategy fire-at-will

# Sweep imbalance to find where the gap between perfect/fire-at-will feels interesting
npx tsx scripts/simulate.ts --sweep IMBALANCE_PROBABILITY 0.2,0.4,0.55,0.7 --strategy perfect
```
