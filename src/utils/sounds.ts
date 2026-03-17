/**
 * sounds.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All audio synthesis for the Rock Paper Scissors game.
 * Uses the Web Audio API so no external files are needed — fully static.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Lazily initialise a single AudioContext shared across all sound calls.
// We defer creation until a user gesture has occurred (browser policy).
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Some browsers suspend the context after a period of inactivity.
  if (_ctx.state === "suspended") {
    _ctx.resume();
  }
  return _ctx;
}

// ─── Low-level helpers ───────────────────────────────────────────────────────

/** Play a single sine/square tone for `duration` seconds at `freq` Hz. */
function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gainValue = 0.18,
  startAt = 0
) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);

  gain.gain.setValueAtTime(gainValue, ctx.currentTime + startAt);
  // Smooth fade-out to prevent clicks
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + startAt + duration
  );

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}

/** Play a short noise burst (paper-rip / brush-stroke feel). */
function playNoise(duration: number, startAt = 0, gainValue = 0.08) {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, ctx.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + startAt + duration
  );

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime + startAt);
  source.stop(ctx.currentTime + startAt + duration + 0.05);
}

// ─── Named sound effects ─────────────────────────────────────────────────────

/** Countdown tick (each "1", "2", "3") — a soft brush-tap. */
export function playCountdownTick() {
  playTone(220, 0.12, "sine", 0.15);
  playNoise(0.08, 0, 0.05);
}

/** The "SHOOT!" beat — louder, more dramatic brush strike. */
export function playShootSound() {
  playTone(330, 0.18, "sine", 0.25);
  playTone(440, 0.14, "sine", 0.18, 0.05);
  playNoise(0.15, 0, 0.1);
}

/** Win fanfare — ascending ink-drop melody. */
export function playWinSound() {
  [523, 659, 784, 1047].forEach((f, i) =>
    playTone(f, 0.25, "sine", 0.18, i * 0.1)
  );
}

/** Loss sound — descending, muted. */
export function playLoseSound() {
  [392, 330, 262, 196].forEach((f, i) =>
    playTone(f, 0.28, "sine", 0.14, i * 0.1)
  );
}

/** Tie sound — two identical notes, then silence. */
export function playTieSound() {
  playTone(440, 0.2, "sine", 0.12, 0);
  playTone(440, 0.2, "sine", 0.12, 0.25);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * playResultWithDelay
 * ─────────────────────────────────────────────────────────────────────────────
 * Plays the appropriate result sound after a deliberate dramatic pause.
 *
 * WHY a delay?
 *   The player presses a key between "3" and "SHOOT!".  We want to:
 *     1.  Let the "SHOOT!" announcement finish sounding (~300 ms).
 *     2.  Add a beat of suspense so the reveal feels weighty (~400 ms).
 *     3.  THEN play the win / lose / tie melody.
 *
 * The total delay is therefore composed of two parts:
 *   • `shootSoundDuration`  — estimated playback length of the SHOOT sound
 *   • `suspensePause`       — extra artistic silence for drama
 *
 * @param outcome   "win" | "lose" | "tie"
 * @param delayMs   Total milliseconds to wait before the sound fires.
 *                  Defaults to 900 ms (300 shoot + 600 suspense).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function playResultWithDelay(
  outcome: "win" | "lose" | "tie",
  delayMs = 900
) {
  // Schedule the sound using a plain setTimeout so the JS event loop
  // stays unblocked — the UI can animate the reveal in parallel.
  setTimeout(() => {
    if (outcome === "win") playWinSound();
    else if (outcome === "lose") playLoseSound();
    else playTieSound();
  }, delayMs);
}
