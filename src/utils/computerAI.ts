/**
 * computerAI.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines the computer's Rock-Paper-Scissors move.
 *
 * Two strategies exist, selected based on how many games have been played:
 *
 *   1. RANDOM (games < ADAPTIVE_THRESHOLD from config.ts)
 *      Pure uniform random.  The computer has no bias.
 *
 *   2. ADAPTIVE (games >= ADAPTIVE_THRESHOLD)
 *      The computer analyses the player's historical move frequencies and
 *      picks the move that BEATS the player's most common choice.
 *      A configurable random noise factor (ADAPTIVE_NOISE) prevents it
 *      from being perfectly predictable itself.
 *
 * The computer's decision fires IMMEDIATELY after the player presses a key
 * (before the reveal animation starts). This means the adaptive model
 * acts on the player's history up to but NOT INCLUDING the current round.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CONFIG } from "../config";

export type Move = "rock" | "paper" | "scissors";

// Re-export threshold so the UI can reference it without importing config directly
export const ADAPTIVE_THRESHOLD = CONFIG.ADAPTIVE_THRESHOLD;

/** The move that beats each move. */
const BEATS: Record<Move, Move> = {
  rock:     "paper",
  paper:    "scissors",
  scissors: "rock",
};

const ALL_MOVES: Move[] = ["rock", "paper", "scissors"];

// ─────────────────────────────────────────────────────────────────────────────
/** Pick a uniformly random move — no pattern, no memory. */
function randomMove(): Move {
  return ALL_MOVES[Math.floor(Math.random() * 3)];
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * adaptiveMove
 * ─────────────────────────────────────────────────────────────────────────────
 * Given the player's historical move counts, predict the most likely throw
 * and return the move that defeats it.
 *
 * With probability CONFIG.ADAPTIVE_NOISE (default 20%) the AI ignores the
 * history and goes random — this prevents the player from gaming the system
 * by deliberately planting a false pattern.
 *
 * @param history  Mapping of each Move → times used across ALL prior rounds.
 *                 Does NOT include the current round's move.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function adaptiveMove(history: Record<Move, number>): Move {
  // Noise injection — go random CONFIG.ADAPTIVE_NOISE % of the time
  if (Math.random() < CONFIG.ADAPTIVE_NOISE) {
    return randomMove();
  }

  // Find the player's most-used move across all completed rounds
  let mostUsed: Move = "rock";
  let maxCount = -1;
  for (const move of ALL_MOVES) {
    if (history[move] > maxCount) {
      maxCount = history[move];
      mostUsed = move;
    }
  }

  // Throw the counter-move
  return BEATS[mostUsed];
}

// ─────────────────────────────────────────────────────────────────────────────
/** Returns the move that beats the given move. */
export function getWinningMove(playerMove: Move): Move {
  return BEATS[playerMove];
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * computeComputerMove
 * ─────────────────────────────────────────────────────────────────────────────
 * Main export.  Called IMMEDIATELY after the player commits their choice.
 * Selects random or adaptive strategy based on total completed games.
 *
 * @param totalGamesPlayed  Number of COMPLETED games BEFORE this round.
 * @param playerHistory     Cumulative counts of the player's past moves.
 *                          Does NOT yet include the current round's move.
 * @param playerCurrentMove (Optional) The player's current move for "cheating" 
 *                          in experiment/illusion mode.
 * @returns The computer's chosen move for this round.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function computeComputerMove(
  totalGamesPlayed: number,
  playerHistory: Record<Move, number>,
  playerCurrentMove?: Move
): Move {
  // Switch to "winning" behavior if we're over the threshold
  if (totalGamesPlayed >= CONFIG.ADAPTIVE_THRESHOLD) {
    // If we're in a phase where we should "always" win (and we know the player move)
    if (playerCurrentMove && Math.random() < CONFIG.ADAPTIVE_WIN_RATE) {
      return getWinningMove(playerCurrentMove);
    }
    return adaptiveMove(playerHistory);
  }
  return randomMove();
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * determineOutcome
 * ─────────────────────────────────────────────────────────────────────────────
 * Given both moves, return the round outcome from the player's perspective.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function determineOutcome(
  player: Move,
  computer: Move
): "win" | "lose" | "tie" {
  if (player === computer) return "tie";
  // BEATS[computer] is the move that beats the computer.
  // If the player threw that move, the player wins.
  if (BEATS[computer] === player) return "win";
  return "lose";
}
