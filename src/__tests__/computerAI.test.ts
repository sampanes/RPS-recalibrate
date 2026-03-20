import { describe, it, expect } from "vitest";
import { computeComputerMove, determineOutcome } from "../utils/computerAI";
import { CONFIG } from "../config";
import type { Move } from "../utils/computerAI";

const empty: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };

// ─── determineOutcome — all 9 combinations ────────────────────────────────────

describe("determineOutcome", () => {
  // Ties
  it("tie: rock vs rock",          () => expect(determineOutcome("rock",     "rock"    )).toBe("tie"));
  it("tie: paper vs paper",        () => expect(determineOutcome("paper",    "paper"   )).toBe("tie"));
  it("tie: scissors vs scissors",  () => expect(determineOutcome("scissors", "scissors")).toBe("tie"));

  // Player wins
  it("win: rock beats scissors",   () => expect(determineOutcome("rock",     "scissors")).toBe("win"));
  it("win: paper beats rock",      () => expect(determineOutcome("paper",    "rock"    )).toBe("win"));
  it("win: scissors beats paper",  () => expect(determineOutcome("scissors", "paper"   )).toBe("win"));

  // Player loses
  it("lose: rock loses to paper",      () => expect(determineOutcome("rock",     "paper"   )).toBe("lose"));
  it("lose: paper loses to scissors",  () => expect(determineOutcome("paper",    "scissors")).toBe("lose"));
  it("lose: scissors loses to rock",   () => expect(determineOutcome("scissors", "rock"    )).toBe("lose"));
});

// ─── computeComputerMove — random phase ───────────────────────────────────────

describe("computeComputerMove — random phase (below threshold)", () => {
  it("returns a valid move", () => {
    const move = computeComputerMove(0, empty);
    expect(["rock", "paper", "scissors"]).toContain(move);
  });

  it("produces multiple distinct moves across many calls (not stuck on one)", () => {
    const moves = new Set(
      Array.from({ length: 100 }, () => computeComputerMove(0, empty))
    );
    expect(moves.size).toBeGreaterThan(1);
  });
});

// ─── computeComputerMove — adaptive phase ────────────────────────────────────

describe("computeComputerMove — adaptive phase (noise=0)", () => {
  // With ADAPTIVE_NOISE=0 and ADAPTIVE_WIN_RATE=0 (no cheating on current move),
  // it must deterministically counter the dominant history move.
  const deterministicConfig = { ...CONFIG, ADAPTIVE_NOISE: 0, ADAPTIVE_WIN_RATE: 0 };

  it("counters rock when rock dominates history", () => {
    const history: Record<Move, number> = { rock: 90, paper: 5, scissors: 5 };
    expect(computeComputerMove(99, history, undefined, null, deterministicConfig)).toBe("paper");
  });

  it("counters paper when paper dominates history", () => {
    const history: Record<Move, number> = { rock: 5, paper: 90, scissors: 5 };
    expect(computeComputerMove(99, history, undefined, null, deterministicConfig)).toBe("scissors");
  });

  it("counters scissors when scissors dominates history", () => {
    const history: Record<Move, number> = { rock: 5, paper: 5, scissors: 90 };
    expect(computeComputerMove(99, history, undefined, null, deterministicConfig)).toBe("rock");
  });
});

// ─── computeComputerMove — cheat mode ────────────────────────────────────────

describe("computeComputerMove — cheat mode (ADAPTIVE_WIN_RATE=1)", () => {
  const cheatConfig = { ...CONFIG, ADAPTIVE_WIN_RATE: 1, ADAPTIVE_THRESHOLD: 0 };

  it("beats rock with paper",      () => expect(computeComputerMove(1, empty, "rock",     null, cheatConfig)).toBe("paper"));
  it("beats paper with scissors",  () => expect(computeComputerMove(1, empty, "paper",    null, cheatConfig)).toBe("scissors"));
  it("beats scissors with rock",   () => expect(computeComputerMove(1, empty, "scissors", null, cheatConfig)).toBe("rock"));
});

// ─── computeComputerMove — strategy overrides ────────────────────────────────

describe("computeComputerMove — strategyOverride", () => {
  it("random override produces multiple distinct moves even with a dominant history", () => {
    const moves = new Set(
      Array.from({ length: 100 }, () =>
        computeComputerMove(999, { rock: 999, paper: 0, scissors: 0 }, undefined, "random")
      )
    );
    expect(moves.size).toBeGreaterThan(1);
  });

  it("adaptive override counters history even below the adaptive threshold", () => {
    const config = { ...CONFIG, ADAPTIVE_NOISE: 0, ADAPTIVE_WIN_RATE: 0 };
    const history: Record<Move, number> = { rock: 90, paper: 0, scissors: 0 };
    // Game 0 is normally random phase, but override forces adaptive
    expect(computeComputerMove(0, history, undefined, "adaptive", config)).toBe("paper");
  });
});
