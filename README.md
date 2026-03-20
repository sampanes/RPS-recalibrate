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

Headless game simulation — no browser needed. Runs the same AI logic the game
uses and outputs a chart to `scripts/sim-output.html`.

```bash
# Compare all player strategies (random, perfect, always-rock, fire-at-will, …)
npx tsx scripts/simulate.ts

# One strategy, more games
npx tsx scripts/simulate.ts --games 1000 --strategy perfect

# Sweep a config variable over multiple values (one chart line per value)
npx tsx scripts/simulate.ts --sweep ADAPTIVE_THRESHOLD 5,10,20,30,50
npx tsx scripts/simulate.ts --sweep ADAPTIVE_NOISE 0,0.1,0.2,0.4,0.6
npx tsx scripts/simulate.ts --sweep ADAPTIVE_WIN_RATE 0.5,0.7,0.9,1.0
```

Open `scripts/sim-output.html` in any browser to see the cumulative win-rate chart.
See `SIMULATION.md` for full documentation on strategies and sweep options.

## Testing

Unit and hook tests use [Vitest](https://vitest.dev/). Tests live in `src/__tests__/`.

```bash
npx vitest          # watch mode
npx vitest run      # single run
```

See `TESTING.md` for what to test and example test cases.
