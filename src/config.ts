/**
 * config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central timing & behaviour configuration for Rock · Paper · Scissors.
 * All durations are in milliseconds unless noted.
 *
 * Tweak these freely — the game logic reads every value from here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CONFIG = {
  // ── Countdown ──────────────────────────────────────────────────────────────
  /** Duration of each step: "1" → "2" → "3" → "SHOOT!" */
  STEP_DURATION_MS: 700,

  // ── Input forgiveness ──────────────────────────────────────────────────────
  /**
   * How many ms BEFORE "SHOOT!" we begin accepting input.
   * This means the player can press during the "3" display.
   * e.g. 400 = the last 400ms of the "3" step already accept a throw.
   */
  INPUT_EARLY_WINDOW_MS: 400,

  /** How long the "SHOOT!" window stays open for player input */
  SHOOT_WINDOW_MS: 1600,

  /**
   * Extra grace period AFTER the SHOOT window "expires" where we still
   * accept a late input instead of declaring "Too slow!".
   * The player won't even see the "Too slow" if they press within this
   * late grace period — it's a silent save.
   */
  INPUT_LATE_GRACE_MS: 500,

  // ── Reveal ─────────────────────────────────────────────────────────────────
  /** Pause between player key-press and the reveal appearing (lets SHOOT sound breathe) */
  REVEAL_DELAY_MS: 550,

  /** Extra dramatic pause inside reveal before the outcome sound fires */
  RESULT_SOUND_EXTRA_DELAY_MS: 300,

  /** How long the result screen is shown before auto-starting the next round */
  REVEAL_DURATION_MS: 3000,

  /** Extra hold time after a "Too slow!" miss before next round */
  MISS_EXTRA_HOLD_MS: 500,

  // ── Continuous play ────────────────────────────────────────────────────────
  /**
   * When the player's cursor is inside the arena, rounds automatically chain.
   * This is the gap between the result disappearing and the next countdown starting.
   */
  AUTO_RESTART_DELAY_MS: 400,

  // ── AI ─────────────────────────────────────────────────────────────────────
  /** Number of completed games before adaptive strategy activates */
  ADAPTIVE_THRESHOLD: 20,

  /** Probability (0–1) that the adaptive AI ignores history and goes random */
  ADAPTIVE_NOISE: 0.2,

  // ── Animated background ────────────────────────────────────────────────────
  /** How many floating brushstroke blobs to keep alive at once */
  BG_BLOB_COUNT: 7,

  /** How often a new brushstroke appears (ms) */
  BG_STROKE_INTERVAL_MS: 2800,

  /** How long a single animated brushstroke takes to fully paint in (ms) */
  BG_STROKE_PAINT_DURATION_MS: 3200,

  /** How long a brushstroke lingers at full opacity before fading (ms) */
  BG_STROKE_LINGER_MS: 5000,

  /** How long the fade-out takes (ms) */
  BG_STROKE_FADE_MS: 4000,
} as const;
