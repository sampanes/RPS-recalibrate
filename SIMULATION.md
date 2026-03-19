# Simulation Runner

A headless TypeScript script that plays N games against the bot and outputs
win/loss/tie data for graphing. No React, no browser, no timers.

## Why this works

`computeComputerMove` and `determineOutcome` in `src/utils/computerAI.ts` are
pure functions with no side effects. The timing/delay machinery in the hook is
purely presentational — it doesn't affect who wins. A simulation can skip it
entirely and call the core functions in a tight loop.

## How to run

```bash
npx tsx simulate.ts                        # default config, random player
npx tsx simulate.ts --strategy perfect     # player always counters early reveals
npx tsx simulate.ts --threshold 10 20 30   # sweep ADAPTIVE_THRESHOLD values
```

## Player strategies

Each strategy is a function `(gameIndex, history, earlyReveal?) => Move`.

| Strategy | Behaviour |
|---|---|
| `random` | Picks randomly each round, no memory |
| `always-rock` | Always throws rock |
| `always-counter` | If bot revealed early, throws the counter; otherwise random |
| `perfect` | Waits until the last possible ms (simulated), always counters early reveals, random otherwise |
| `fire-at-will` | Picks immediately without waiting — never sees early reveals |
| `pattern-RRPRRP` | Cycles a fixed sequence — tests whether adaptive AI detects it |

## Config sweeps

With `AIConfig` now a parameter to `computeComputerMove`, a sweep looks like:

```ts
for (const threshold of [5, 10, 20, 30, 50]) {
  const results = simulate(1000, "random", { ...CONFIG, ADAPTIVE_THRESHOLD: threshold });
  // store results keyed by threshold
}
```

Interesting variables to sweep:

| Variable | Question it answers |
|---|---|
| `ADAPTIVE_THRESHOLD` | Is 20 games the right crossover? Does it feel too soon / too late? |
| `ADAPTIVE_NOISE` | At 20% noise, does the bot feel beatable? Does 40% feel fair? |
| `ADAPTIVE_WIN_RATE` | How crushing is the adaptive phase? 90% feels oppressive — what's fun? |
| `IMBALANCE_PROBABILITY` | How often should the bot show its hand early? |

## Output format

Emit JSON from the script, load it into a self-contained HTML file with
Chart.js (no build step needed):

```ts
// simulate.ts — final lines
const output = { config, results, cumulative };
fs.writeFileSync("sim-output.json", JSON.stringify(output, null, 2));
console.log("Open sim.html in a browser to see the graph.");
```

`sim.html` fetches `sim-output.json` and renders:
- Cumulative win/loss/tie rates over game index
- One line per config variant when sweeping
- A "fun zone" band marking the range where win rate feels balanced

## Cheat URL / player-wins mode

The existing `?debug` param exposes `strategyOverride`. A `?cheat` param could
flip `ADAPTIVE_WIN_RATE` to 0 (bot never cheats) and `ADAPTIVE_NOISE` to 0.5
(bot is noisy/dumb). The simulation can verify this actually produces the
intended win-rate curve before shipping it.

## File to create

`simulate.ts` at the project root. Runnable with `npx tsx simulate.ts`.
Dependencies: only `tsx` (dev, already common) — no new runtime packages.
