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

# How hard should the AI cheat? 1.0 = always wins, 0.5 = barely adapts
npx tsx scripts/simulate.ts --sweep ADAPTIVE_WIN_RATE 0.5,0.7,0.9,1.0
```

After any run, open `scripts/sim-output.html` in a browser. You'll see a cumulative
win-rate chart (one line per variant) and a summary table. Random chance is ~33% —
anything well above that means the strategy is exploiting the AI.

See `SIMULATION.md` for full documentation.

## Testing

Unit and hook tests use [Vitest](https://vitest.dev/). Tests live in `src/__tests__/`.

```bash
npx vitest          # watch mode
npx vitest run      # single run
```

See `TESTING.md` for what to test and example test cases.
