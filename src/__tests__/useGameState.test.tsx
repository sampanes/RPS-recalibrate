import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameState } from "../hooks/useGameState";
import { CONFIG } from "../config";

// Mock all sound functions — they hit the Web Audio API which isn't in jsdom.
vi.mock("../utils/sounds", () => ({
  playCountdownTick: vi.fn(),
  playShootSound: vi.fn(),
  playResultWithDelay: vi.fn(),
}));

const defaultParams = { arenaHovered: false, isDebug: false };
const STEP = CONFIG.STEP_DURATION_MS; // 700 ms

// Helpers to advance through common phases
function advanceToAccepting() {
  act(() => vi.advanceTimersByTime(STEP * 3));
}

beforeEach(() => {
  vi.useFakeTimers();
  // Return 0.5 for all Math.random() calls.
  // 0.5 > IMBALANCE_PROBABILITY (0.4) → imbalance never fires → clean phase transitions.
  // Math.floor(0.5 * 3) = 1 → computer always picks "paper" during random phase.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Phase transitions ────────────────────────────────────────────────────────

describe("phase transitions", () => {
  it("starts in idle", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    expect(result.current.phase).toBe("idle");
  });

  it("idle → countdown on beginCountdown", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    expect(result.current.phase).toBe("countdown");
  });

  it("countdown → accepting after STEP * 3 ms", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    expect(result.current.phase).toBe("accepting");
  });

  it("second beginCountdown while already counting down is ignored", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    act(() => result.current.beginCountdown());
    expect(result.current.phase).toBe("countdown");
  });

  it("accepting → locked on handlePlayerMove", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    expect(result.current.phase).toBe("locked");
  });

  it("locked → reveal after playerDelay (CALIB_DELAY_MS)", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + 10));
    expect(result.current.phase).toBe("reveal");
  });

  it("reveal → idle after REVEAL_DURATION_MS", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + CONFIG.REVEAL_DURATION_MS + 50));
    expect(result.current.phase).toBe("idle");
  });

  it("resets moves and outcome when a new round begins", () => {
    const { result } = renderHook(() => useGameState(defaultParams));

    // Complete a full round
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + CONFIG.REVEAL_DURATION_MS + 50));

    // Start a new round and verify state was cleared
    act(() => result.current.beginCountdown());
    expect(result.current.playerMove).toBeNull();
    expect(result.current.computerMove).toBeNull();
    expect(result.current.outcome).toBeNull();
  });
});

// ─── Input handling ───────────────────────────────────────────────────────────

describe("input handling", () => {
  it("handlePlayerMove is ignored when not in accepting phase (idle)", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.handlePlayerMove("rock"));
    expect(result.current.phase).toBe("idle");
  });

  it("handlePlayerMove is ignored during countdown", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    act(() => vi.advanceTimersByTime(STEP)); // mid-countdown
    act(() => result.current.handlePlayerMove("rock"));
    expect(result.current.phase).toBe("countdown");
  });

  it("computerMove is set synchronously on a valid throw", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    expect(result.current.computerMove).not.toBeNull();
  });

  it("playerMove is revealed after playerDelay", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("scissors"));

    // Not yet revealed
    expect(result.current.playerMove).toBeNull();

    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + 10));
    expect(result.current.playerMove).toBe("scissors");
  });
});

// ─── Miss detection ───────────────────────────────────────────────────────────

describe("miss detection", () => {
  it("sets missedShot and enters reveal when player does not throw in time", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    // Two separate acts: the first flushes the phase="accepting" state update so
    // phaseRef.current is current when the nested miss timer fires in the second.
    act(() => vi.advanceTimersByTime(STEP * 3));
    act(() => vi.advanceTimersByTime(CONFIG.SHOOT_WINDOW_MS + CONFIG.INPUT_LATE_GRACE_MS + 10));
    expect(result.current.missedShot).toBe(true);
    expect(result.current.phase).toBe("reveal");
  });

  it("does NOT set missedShot when player throws within the grace period", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    // Throw right at the edge of the shoot window, before grace expires
    act(() => vi.advanceTimersByTime(CONFIG.SHOOT_WINDOW_MS - 10));
    act(() => result.current.handlePlayerMove("paper"));
    act(() => vi.advanceTimersByTime(CONFIG.INPUT_LATE_GRACE_MS + 50));
    expect(result.current.missedShot).toBe(false);
  });

  it("missedShot resets to false at the start of the next round", () => {
    const { result } = renderHook(() => useGameState(defaultParams));

    // Cause a miss (same two-act split as the miss detection test above)
    act(() => result.current.beginCountdown());
    act(() => vi.advanceTimersByTime(STEP * 3));
    act(() =>
      vi.advanceTimersByTime(
        CONFIG.SHOOT_WINDOW_MS +
          CONFIG.INPUT_LATE_GRACE_MS +
          CONFIG.REVEAL_DURATION_MS +
          CONFIG.MISS_EXTRA_HOLD_MS +
          50
      )
    );
    expect(result.current.missedShot).toBe(true);

    // Start a fresh round
    act(() => result.current.beginCountdown());
    expect(result.current.missedShot).toBe(false);
  });
});

// ─── Scoring ──────────────────────────────────────────────────────────────────

describe("scoring", () => {
  it("increments totalGames by 1 after a completed round", () => {
    const { result } = renderHook(() => useGameState(defaultParams));
    expect(result.current.totalGames).toBe(0);

    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + 10));

    expect(result.current.totalGames).toBe(1);
  });

  it("records the correct outcome: paper beats rock → player loses", () => {
    // Math.random = 0.5 → computer picks "paper" (ALL_MOVES[1]) in random phase.
    // Player throws rock → lose.
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("rock"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + 10));

    expect(result.current.outcome).toBe("lose");
    expect(result.current.scores.losses).toBe(1);
    expect(result.current.scores.wins).toBe(0);
  });

  it("records the correct outcome: scissors beats paper → player wins", () => {
    // Math.random = 0.5 → computer picks "paper". Player throws scissors → win.
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("scissors"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + 10));

    expect(result.current.outcome).toBe("win");
    expect(result.current.scores.wins).toBe(1);
    expect(result.current.scores.losses).toBe(0);
  });

  it("records a tie correctly", () => {
    // Math.random = 0.5 → computer picks "paper". Player throws paper → tie.
    const { result } = renderHook(() => useGameState(defaultParams));
    act(() => result.current.beginCountdown());
    advanceToAccepting();
    act(() => result.current.handlePlayerMove("paper"));
    act(() => vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + 10));

    expect(result.current.outcome).toBe("tie");
    expect(result.current.scores.ties).toBe(1);
  });

  it("accumulates scores across multiple rounds", () => {
    const { result } = renderHook(() => useGameState(defaultParams));

    // Two rounds: scissors (win) then rock (lose), computer always picks paper
    for (const move of ["scissors", "rock"] as const) {
      act(() => result.current.beginCountdown());
      advanceToAccepting();
      act(() => result.current.handlePlayerMove(move));
      act(() =>
        vi.advanceTimersByTime(CONFIG.CALIB_DELAY_MS + CONFIG.REVEAL_DURATION_MS + 50)
      );
    }

    expect(result.current.totalGames).toBe(2);
    expect(result.current.scores.wins).toBe(1);
    expect(result.current.scores.losses).toBe(1);
    expect(result.current.scores.ties).toBe(0);
  });
});
