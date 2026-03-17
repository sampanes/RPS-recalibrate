# Experiment Implementation Steps

Technical roadmap for wiring `EXPERIMENT_MODE` into App.tsx.
All timing constants are already defined in `src/config.ts`.

---

## Current State

`config.ts` now has all experiment parameters. The game loop is untouched.
`EXPERIMENT_MODE: false` is a dead flag until the steps below are completed.

The bot already registers the player's move immediately on keypress — this
naturally provides the ~5 ms "thinking buffer" the paper requires before the
35 ms illusion display fires. No changes needed to `computerAI.ts`.

---

## Step 1 — Split the reveal into two independent display events

**File:** `src/App.tsx`

**Why:** Currently `revealVisible` shows both player and bot moves at the same
time after `REVEAL_DELAY_MS`. The illusion requires the bot move to appear
at `ILLUSION_DELAY_MS` (35 ms) and the player's own move to appear at
`ILLUSION_PLAYER_MOVE_DELAY_MS` (135 ms), creating a ~100 ms temporal gap.

**Changes:**

1. Add two new state variables:
   ```ts
   const [botMoveVisible,    setBotMoveVisible]    = useState(false);
   const [playerMoveVisible, setPlayerMoveVisible] = useState(false);
   ```

2. In `handlePlayerMove`, replace the single `schedule(..., REVEAL_DELAY_MS)`
   block with:
   ```
   Normal mode (EXPERIMENT_MODE = false):
     schedule(() => { setBotMoveVisible(true); setPlayerMoveVisible(true); setRevealVisible(true); ... }, REVEAL_DELAY_MS)

   Calibration mode (calibTrials < CALIB_TRIAL_COUNT):
     delay = isNoiseTrial ? sampleGaussian() : CONFIG.CALIB_DELAY_MS
     schedule(() => { setBotMoveVisible(true); setPlayerMoveVisible(true); setRevealVisible(true); ... }, delay)

   Illusion mode (calibTrials >= CALIB_TRIAL_COUNT):
     schedule(() => { setBotMoveVisible(true);  playBeep(); },       CONFIG.ILLUSION_DELAY_MS)
     schedule(() => { setPlayerMoveVisible(true); setRevealVisible(true); }, CONFIG.ILLUSION_PLAYER_MOVE_DELAY_MS)
   ```

3. Update the JSX reveal section to gate each half on its own flag:
   ```tsx
   {botMoveVisible && <BotMoveDisplay move={computerMove} />}
   {playerMoveVisible && <PlayerMoveDisplay move={playerMove} />}
   ```

4. Clear both flags when returning to idle.

---

## Step 2 — Add experiment mode state machine

**File:** `src/App.tsx`

**New state:**
```ts
type ExperimentPhase = "calibration" | "illusion";
const [experimentPhase, setExperimentPhase] = useState<ExperimentPhase>("calibration");
const [calibTrials, setCalibTrials]         = useState(0);   // consecutive adapted trials
```

**Transition logic** (fire at end of each round in experiment mode):
```ts
if (CONFIG.EXPERIMENT_MODE && experimentPhase === "calibration") {
  const next = calibTrials + 1;
  setCalibTrials(next);
  if (next >= CONFIG.CALIB_TRIAL_COUNT) {
    setExperimentPhase("illusion");
  }
}
```

Add a `calibTrialsRef` (like other refs in the file) to avoid stale-closure
reads inside `handlePlayerMove`.

---

## Step 3 — Gaussian noise sampler

**File:** `src/utils/experimentUtils.ts` (new file)

```ts
import { CONFIG } from "../config";

/** Box-Muller transform → N(0,1) sample */
function gaussianSample(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Returns a calibration-trial delay.
 * CALIB_NOISE_RATIO % of trials get a Gaussian-distributed "organic" delay
 * centered at CALIB_NOISE_CENTER_MS; the rest get the fixed CALIB_DELAY_MS.
 */
export function calibrationDelay(): number {
  if (Math.random() < CONFIG.CALIB_NOISE_RATIO) {
    const sample = CONFIG.CALIB_NOISE_CENTER_MS
                 + gaussianSample() * CONFIG.CALIB_NOISE_SIGMA_MS;
    return Math.max(10, Math.round(sample)); // floor at 10 ms
  }
  return CONFIG.CALIB_DELAY_MS;
}
```

Import and call this in the Step 1 scheduling logic.

---

## Step 4 — Reaction-time tracker (for ACC trigger logic)

**File:** `src/App.tsx`

The paper suggests triggering the illusion specifically on rounds where the
player's "confidence" (fastest reaction times) is highest. This requires
tracking per-round reaction times.

**New state/refs:**
```ts
const inputTimestampRef = useRef<number>(0);     // set on SHOOT
const reactionTimesRef  = useRef<number[]>([]);  // rolling window
```

**On SHOOT:** `inputTimestampRef.current = performance.now();`

**On input received:**
```ts
const rt = performance.now() - inputTimestampRef.current;
reactionTimesRef.current = [...reactionTimesRef.current.slice(-9), rt]; // keep last 10
```

**ACC trigger:** In illusion mode, only deploy the asymmetric timing when
the current RT is in the fastest quartile of the player's recorded RTs:
```ts
const rts = reactionTimesRef.current;
const p25 = rts.sort((a,b) => a-b)[Math.floor(rts.length * 0.25)];
const useIllusion = experimentPhase === "illusion" && rt <= p25;
```

---

## Step 5 — Beep on bot-move display (sensory trigger)

**File:** `src/utils/sounds.ts` and `src/App.tsx`

The paper uses a high-frequency auditory trigger coincident with the sensory
feedback event (the moment the bot's move appears). The current sound system
plays the outcome sound 300 ms _after_ the reveal.

Add a new short beep:
```ts
export function playFeedbackBeep(ctx: AudioContext): void {
  // ~120 Hz tone, 80 ms, to mark the motor-sensory binding moment
  const osc = ctx.createOscillator();
  osc.frequency.value = 1200; // high-frequency per paper recommendation
  osc.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}
```

Fire `playFeedbackBeep()` at the same time `setBotMoveVisible(true)` is
called in the illusion/calibration schedule.

---

## Step 6 — UI indicators (optional, for experiment logging)

Consider adding a small, unobtrusive indicator visible only in
`EXPERIMENT_MODE`:

- Current phase: `CALIBRATION (n/20)` or `ILLUSION`
- Optional: log each trial's `{ trialNum, delay, phase, outcome, rt }` to
  `console.table()` or a `window.__experimentLog` array for post-session
  export via `JSON.stringify(window.__experimentLog)`.

---

## Dependency order

```
Step 3 (sampler util)  ← no deps
Step 2 (state machine) ← no deps
Step 4 (RT tracker)    ← no deps
Step 1 (split reveal)  ← needs Step 3
Step 5 (beep)          ← needs Step 1
Step 6 (logging)       ← needs Steps 2, 4
```

Steps 2, 3, 4 can be done in parallel. Step 1 is the riskiest change
(touches the core reveal path) and should be done carefully with the normal
mode path regression-tested first.

---

## Regression test checklist (after each step)

- [ ] Normal mode (`EXPERIMENT_MODE: false`): game plays identically to today
- [ ] Calibration phase: result appears at ~135 ms; ~40% of trials feel slightly faster
- [ ] Illusion phase: bot move visible before player move; gap is perceptible
- [ ] Too-slow path still works in all phases
- [ ] Auto-restart still chains correctly
- [ ] Mobile touch still works

---

*Source: Stetson, C., Cui, X., Montague, P. R., & Eagleman, D. M. (2006).
Motor-Sensory Recalibration Leads to an Illusory Reversal of Action and
Sensation. Neuron, 51, 651–659.*
