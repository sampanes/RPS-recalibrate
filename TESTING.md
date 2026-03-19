# Testing Plan

## Recommended setup: Vitest

Vitest is the natural choice — it's built for Vite projects, uses the same
config file, and has first-class fake-timer support. Install once:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `vite.config.ts`:
```ts
test: {
  environment: "jsdom",
  globals: true,
}
```

Run with `npx vitest`.

---

## 1. Unit tests — `src/utils/computerAI.ts`

Pure functions, zero setup. These are the highest-value tests to write first.

### `determineOutcome`

```ts
it("returns tie when both moves match", () => {
  expect(determineOutcome("rock", "rock")).toBe("tie");
});
it("returns win when player beats computer", () => {
  expect(determineOutcome("paper", "rock")).toBe("win");
});
it("returns lose when computer beats player", () => {
  expect(determineOutcome("rock", "paper")).toBe("lose");
});
// Cover all 9 combinations.
```

### `computeComputerMove` — random phase

```ts
it("returns a valid move in random phase", () => {
  const move = computeComputerMove(0, { rock: 0, paper: 0, scissors: 0 });
  expect(["rock", "paper", "scissors"]).toContain(move);
});
it("stays random when below threshold", () => {
  // Run 100 times, assert we don't always get the same move
  const moves = new Set(
    Array.from({ length: 100 }, () =>
      computeComputerMove(0, { rock: 50, paper: 0, scissors: 0 })
    )
  );
  expect(moves.size).toBeGreaterThan(1);
});
```

### `computeComputerMove` — adaptive phase

```ts
it("tends to counter the most frequent player move", () => {
  // With noise=0, it should always counter rock when rock dominates
  const config = { ...CONFIG, ADAPTIVE_NOISE: 0, ADAPTIVE_WIN_RATE: 0 };
  const move = computeComputerMove(
    99,
    { rock: 90, paper: 5, scissors: 5 },
    undefined,
    null,
    config
  );
  expect(move).toBe("paper"); // paper beats rock
});
it("respects strategyOverride=random regardless of game count", () => {
  const moves = new Set(
    Array.from({ length: 100 }, () =>
      computeComputerMove(999, { rock: 999, paper: 0, scissors: 0 }, undefined, "random")
    )
  );
  expect(moves.size).toBeGreaterThan(1);
});
```

### `computeComputerMove` — cheat mode

```ts
it("returns the winning move when ADAPTIVE_WIN_RATE=1 and player move is known", () => {
  const config = { ...CONFIG, ADAPTIVE_WIN_RATE: 1, ADAPTIVE_THRESHOLD: 0 };
  expect(computeComputerMove(99, { rock: 0, paper: 0, scissors: 0 }, "rock", null, config))
    .toBe("paper");
  expect(computeComputerMove(99, { rock: 0, paper: 0, scissors: 0 }, "scissors", null, config))
    .toBe("rock");
});
```

---

## 2. Hook tests — `src/hooks/useGameState.ts`

Uses `renderHook` from `@testing-library/react` and `vi.useFakeTimers()`.
No DOM, no JSX rendered.

### Setup

```ts
import { renderHook, act } from "@testing-library/react";
import { vi, beforeEach, afterEach } from "vitest";
import { useGameState } from "../src/hooks/useGameState";

const defaultParams = { arenaHovered: false, isDebug: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });
```

### Phase transitions

```ts
it("starts in idle phase", () => {
  const { result } = renderHook(() => useGameState(defaultParams));
  expect(result.current.phase).toBe("idle");
});

it("transitions idle → countdown → accepting on beginCountdown", () => {
  const { result } = renderHook(() => useGameState(defaultParams));

  act(() => result.current.beginCountdown());
  expect(result.current.phase).toBe("countdown");

  // Advance past all three countdown steps to SHOOT
  act(() => vi.advanceTimersByTime(CONFIG.STEP_DURATION_MS * 3));
  expect(result.current.phase).toBe("accepting");
});

it("does nothing if beginCountdown is called when not idle", () => {
  const { result } = renderHook(() => useGameState(defaultParams));
  act(() => result.current.beginCountdown());
  act(() => result.current.beginCountdown()); // second call — should be ignored
  expect(result.current.phase).toBe("countdown");
});
```

### Input handling

```ts
it("ignores handlePlayerMove when not in accepting phase", () => {
  const { result } = renderHook(() => useGameState(defaultParams));
  act(() => result.current.handlePlayerMove("rock"));
  expect(result.current.phase).toBe("idle"); // unchanged
});

it("locks phase and records moves after a valid throw", () => {
  const { result } = renderHook(() => useGameState(defaultParams));
  act(() => result.current.beginCountdown());
  act(() => vi.advanceTimersByTime(CONFIG.STEP_DURATION_MS * 3));

  act(() => result.current.handlePlayerMove("rock"));
  expect(result.current.phase).toBe("locked");

  // Advance past reveal delay
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.playerMove).toBe("rock");
  expect(result.current.computerMove).not.toBeNull();
});
```

### Scoring

```ts
it("increments the correct score counter after each round", () => {
  // Force a win: set ADAPTIVE_WIN_RATE=0 and spy on computeComputerMove
  // to return a known losing move, then play the counter.
  // (See mock strategy in the simulation doc for how to seed outcomes.)
});
```

### Miss detection

```ts
it("sets missedShot when player does not throw in time", () => {
  const { result } = renderHook(() => useGameState(defaultParams));
  act(() => result.current.beginCountdown());
  act(() => vi.advanceTimersByTime(
    CONFIG.STEP_DURATION_MS * 3 +
    CONFIG.SHOOT_WINDOW_MS +
    CONFIG.INPUT_LATE_GRACE_MS + 10
  ));
  expect(result.current.missedShot).toBe(true);
  expect(result.current.phase).toBe("reveal");
});
```

### The imbalance input-window fix

```ts
it("opens accepting phase when computer reveals early (imbalance fix)", () => {
  // This test would have caught the bug fixed in the imbalance handler.
  // Mock Math.random to force do_imbalance_bool=true and a large imbalanceAdvanceMs,
  // then assert phase becomes "accepting" before SHOOT fires.
});
```

---

## 3. What not to test

- **Rendering / JSX** — component snapshot tests are brittle and catch nothing useful
- **CSS / animation** — not your problem to test
- **Sound / haptics** — side effects; mock them and assert they were called if you care
- **WatercolorCanvas** — pure visual, no logic

---

## Priority order

1. All 9 combinations of `determineOutcome` — 5 minutes, catches logic inversions
2. `computeComputerMove` adaptive countering with `ADAPTIVE_NOISE: 0` — catches AI regressions
3. Phase transition: `idle → countdown → accepting → locked → reveal → idle`
4. Miss detection timeout
5. Imbalance input-window regression test
