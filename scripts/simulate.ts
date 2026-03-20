/**
 * simulate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Headless RPS simulation. No React, no browser, no timers.
 * Calls the same pure AI functions the game uses.
 *
 * Run:
 *   npx tsx scripts/simulate.ts
 *   npx tsx scripts/simulate.ts --games 1000 --strategy perfect
 *   npx tsx scripts/simulate.ts --sweep ADAPTIVE_THRESHOLD 5,10,20,30,50
 *   npx tsx scripts/simulate.ts --sweep ADAPTIVE_NOISE 0,0.1,0.2,0.4,0.6
 *   npx tsx scripts/simulate.ts --sweep ADAPTIVE_WIN_RATE 0.5,0.7,0.9,1.0
 *
 * Output: scripts/sim-output.html  (open in any browser)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { computeComputerMove, determineOutcome, type Move, type AIConfig } from "../src/utils/computerAI";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { CONFIG } from "../src/config";

// ─── Types ────────────────────────────────────────────────────────────────────
type Outcome = "win" | "tie" | "loss";

type PlayerStrategy = (
  gameIndex:   number,
  history:     Record<Move, number>,
  earlyReveal: Move | null,
) => Move;

interface GameRecord {
  outcome:    Outcome;
  cumWinRate: number;
  cumTieRate: number;
}

interface SimResult {
  label:    string;
  config:   AIConfig;
  records:  GameRecord[];
  totals:   { wins: number; ties: number; losses: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ALL_MOVES: Move[] = ["rock", "paper", "scissors"];

function randomMove(): Move {
  return ALL_MOVES[Math.floor(Math.random() * 3)];
}

const COUNTERS: Record<Move, Move> = {
  rock:     "paper",
  paper:    "scissors",
  scissors: "rock",
};

// ─── Player strategies ────────────────────────────────────────────────────────
/**
 * Each strategy signature: (gameIndex, history, earlyReveal) => Move
 *
 * earlyReveal: the bot's committed move if it showed its hand before the player
 *              picked, or null if the bot hasn't revealed yet.
 *
 * "perfect"     — always counters an early reveal; random otherwise.
 *                 Models a player who waits and watches.
 * "fire-at-will"— always receives null for earlyReveal (commits before seeing).
 *                 Models a player who fires immediately every round.
 * "random"      — ignores early reveal, picks randomly.
 * "always-X"    — fixed move, ignores everything.
 * "cycle"       — cycles R→P→S regardless of anything.
 * "counter-history" — counters the bot's most common move so far (meta-adaptive player).
 */
const STRATEGIES: Record<string, PlayerStrategy> = {
  "random":          ()          => randomMove(),
  "always-rock":     ()          => "rock",
  "always-paper":    ()          => "paper",
  "always-scissors": ()          => "scissors",
  "cycle":           (i)         => ALL_MOVES[i % 3],
  "perfect":         (_, __, er) => er ? COUNTERS[er] : randomMove(),
  "fire-at-will":    ()          => randomMove(),   // earlyReveal intentionally ignored
  "counter-history": (i, hist)   => {
    if (i === 0) return randomMove();
    // Find what the bot has been throwing most (proxy: counter player's most common)
    // A "smart" player who tracks bot tendencies and plays the meta-counter
    const botLikely = ALL_MOVES.reduce((a, b) => hist[a] > hist[b] ? a : b);
    return COUNTERS[botLikely];
  },
};

// ─── Core simulation loop ─────────────────────────────────────────────────────
function runSimulation(
  games:       number,
  strategyKey: string,
  config:      AIConfig,
  label:       string,
): SimResult {
  const strategy = STRATEGIES[strategyKey];
  if (!strategy) throw new Error(`Unknown strategy: ${strategyKey}. Valid: ${Object.keys(STRATEGIES).join(", ")}`);

  const history: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };
  const totals = { wins: 0, ties: 0, losses: 0 };
  const records: GameRecord[] = [];

  for (let i = 0; i < games; i++) {
    // Simulate imbalance: bot may commit to a move before the player picks.
    // "fire-at-will" players always get null — they don't wait to see.
    const showsHandEarly =
      strategyKey !== "fire-at-will" &&
      Math.random() < config.IMBALANCE_PROBABILITY;

    const earlyReveal: Move | null = showsHandEarly
      ? computeComputerMove(i, { ...history }, undefined, null, config)
      : null;

    const playerMove = strategy(i, { ...history }, earlyReveal);

    // Bot is committed to earlyReveal if it showed its hand; otherwise picks now.
    const botMove = earlyReveal ?? computeComputerMove(i, { ...history }, playerMove, null, config);

    const raw     = determineOutcome(playerMove, botMove);
    const outcome = raw === "lose" ? "loss" : raw;

    if (outcome === "win")  totals.wins++;
    if (outcome === "tie")  totals.ties++;
    if (outcome === "loss") totals.losses++;

    history[playerMove]++;

    records.push({
      outcome,
      cumWinRate: totals.wins  / (i + 1),
      cumTieRate: totals.ties  / (i + 1),
    });
  }

  return { label, config, records, totals };
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag: string, fallback: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };

  const games       = parseInt(get("--games", "500"), 10);
  const strategyArg = get("--strategy", "all");
  const sweepVar    = args.indexOf("--sweep") !== -1 ? args[args.indexOf("--sweep") + 1] : null;
  const sweepVals   = sweepVar
    ? args[args.indexOf("--sweep") + 2]?.split(",").map(Number) ?? []
    : [];

  return { games, strategyArg, sweepVar, sweepVals };
}

// ─── Chart colours ────────────────────────────────────────────────────────────
const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2",
  "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f",
];

// ─── HTML output ──────────────────────────────────────────────────────────────
function buildHTML(results: SimResult[], games: number, mode: string): string {
  const datasets = results.map((r, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    return {
      label:           r.label,
      data:            r.records.map((rec, i) => ({ x: i + 1, y: +(rec.cumWinRate * 100).toFixed(2) })),
      borderColor:     color,
      backgroundColor: color + "22",
      borderWidth:     2,
      pointRadius:     0,
      tension:         0.3,
    };
  });

  // Summary table rows
  const tableRows = results.map(r => {
    const g = r.records.length;
    const wr = (r.totals.wins  / g * 100).toFixed(1);
    const tr = (r.totals.ties  / g * 100).toFixed(1);
    const lr = (r.totals.losses / g * 100).toFixed(1);
    return `<tr>
      <td>${r.label}</td>
      <td style="color:#4e9a4e">${wr}%</td>
      <td style="color:#888">${tr}%</td>
      <td style="color:#c05050">${lr}%</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RPS Simulation — ${mode}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; margin: 0; padding: 24px; }
    h1   { font-size: 1.4rem; margin-bottom: 4px; color: #c8b8a0; }
    p    { color: #888; font-size: 0.85rem; margin: 0 0 24px; }
    .chart-wrap { background: #16213e; border-radius: 8px; padding: 20px; max-width: 900px; }
    canvas { max-height: 420px; }
    table { border-collapse: collapse; margin-top: 24px; max-width: 900px; width: 100%; }
    th, td { text-align: left; padding: 8px 16px; border-bottom: 1px solid #333; font-size: 0.85rem; }
    th { color: #a0a0c0; font-weight: 600; }
    td:first-child { color: #c8b8a0; }
  </style>
</head>
<body>
  <h1>RPS Simulation — ${mode}</h1>
  <p>${games} games per variant · cumulative win rate over game index</p>
  <div class="chart-wrap">
    <canvas id="chart"></canvas>
  </div>
  <table>
    <thead><tr><th>Variant</th><th>Win %</th><th>Tie %</th><th>Loss %</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>
    const ctx = document.getElementById("chart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        datasets: ${JSON.stringify(datasets)},
      },
      options: {
        parsing: false,
        animation: false,
        plugins: {
          legend: { labels: { color: "#ccc", boxWidth: 14 } },
          annotation: {},
        },
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "Game #", color: "#888" },
            ticks: { color: "#888" },
            grid:  { color: "#ffffff11" },
          },
          y: {
            min: 0, max: 100,
            title: { display: true, text: "Cumulative Win Rate (%)", color: "#888" },
            ticks: { color: "#888", callback: v => v + "%" },
            grid:  { color: "#ffffff11" },
          },
        },
      },
    });
  </script>
  <!-- Baseline reference: 33.3% is random expected win rate -->
  <p style="margin-top:12px; font-size:0.75rem; color:#555">
    Random expected win rate ≈ 33.3% &nbsp;·&nbsp; Ties ≈ 33.3%
  </p>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const { games, strategyArg, sweepVar, sweepVals } = parseArgs();

  const results: SimResult[] = [];

  if (sweepVar) {
    // ── Config sweep mode ──────────────────────────────────────────────────
    const validKeys: (keyof AIConfig)[] = ["ADAPTIVE_THRESHOLD", "ADAPTIVE_NOISE", "ADAPTIVE_WIN_RATE", "IMBALANCE_PROBABILITY"];
    if (!validKeys.includes(sweepVar as keyof AIConfig)) {
      console.error(`Unknown sweep variable: ${sweepVar}. Valid: ${validKeys.join(", ")}`);
      process.exit(1);
    }
    const strategy = strategyArg === "all" ? "random" : strategyArg;
    console.log(`Sweeping ${sweepVar} over [${sweepVals.join(", ")}] with strategy "${strategy}", ${games} games each\n`);

    for (const val of sweepVals) {
      const config = { ...CONFIG, [sweepVar]: val } as AIConfig;
      const label  = `${sweepVar}=${val}`;
      const result = runSimulation(games, strategy, config, label);
      results.push(result);
      const { wins, ties, losses } = result.totals;
      console.log(`  ${label.padEnd(30)} W:${(wins/games*100).toFixed(1)}%  T:${(ties/games*100).toFixed(1)}%  L:${(losses/games*100).toFixed(1)}%`);
    }

    const mode = `${sweepVar} sweep (strategy: ${strategy})`;
    const html = buildHTML(results, games, mode);
    const out  = path.join(__dirname, "sim-output.html");
    fs.writeFileSync(out, html);
    console.log(`\nChart written to ${out}`);

  } else {
    // ── Strategy comparison mode ───────────────────────────────────────────
    const toRun = strategyArg === "all" ? Object.keys(STRATEGIES) : [strategyArg];
    console.log(`Running ${toRun.length} strategy/strategies, ${games} games each\n`);

    for (const key of toRun) {
      const result = runSimulation(games, key, CONFIG, key);
      results.push(result);
      const { wins, ties, losses } = result.totals;
      console.log(`  ${key.padEnd(20)} W:${(wins/games*100).toFixed(1)}%  T:${(ties/games*100).toFixed(1)}%  L:${(losses/games*100).toFixed(1)}%`);
    }

    const mode = strategyArg === "all" ? "all strategies" : `strategy: ${strategyArg}`;
    const html  = buildHTML(results, games, mode);
    const out   = path.join(__dirname, "sim-output.html");
    fs.writeFileSync(out, html);
    console.log(`\nChart written to ${out}`);
  }
}

main();
