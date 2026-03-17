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

## Step 1 — Gaussian Noise Sampler & Config Update

**File:** `src/utils/experimentUtils.ts` (new file) & `src/config.ts`

**Why:** We need a robust way to generate the "organic" jitter for calibration trials to prevent conscious detection of the 135ms lag.

**1. Update `src/config.ts`:**
Add these missing parameters for better flexibility:
```ts
  /** Quartile for RT-gated illusion trigger (0.25 = fastest 25%) */
  ILLUSION_RT_THRESHOLD: 0.25,
  /** Minimum trials recorded before RT-gating activates */
  ILLUSION_MIN_RT_HISTORY: 8,
  /** Whether to reset calibration if the player misses a 'SHOOT!' window */
  RESET_CALIB_ON_MISS: true,
```

**2. Create `src/utils/experimentUtils.ts`:**
```ts
import { CONFIG } from "../config";

/** Box-Muller transform → N(0,1) sample */
function gaussianSample(): number {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); 
  while(v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Returns a calibration-trial delay.
 * CALIB_NOISE_RATIO % of trials get a Gaussian-distributed "organic" delay
 * centered at CALIB_NOISE_CENTER_MS; the rest get the fixed CALIB_DELAY_MS.
 */
export function getCalibrationDelay(): number {
  if (Math.random() < CONFIG.CALIB_NOISE_RATIO) {
    const sample = CONFIG.CALIB_NOISE_CENTER_MS
                 + gaussianSample() * CONFIG.CALIB_NOISE_SIGMA_MS;
    return Math.max(10, Math.round(sample)); // floor at 10 ms
  }
  return CONFIG.CALIB_DELAY_MS;
}
```

---

## Step 2 — Experiment State Machine & RT Tracking

**File:** `src/App.tsx`

**Why:** We need to track the experiment phase and player performance (RT) to decide when to fire the illusion.

**1. New state & refs:**
```ts
type ExperimentPhase = "calibration" | "illusion";
const [experimentPhase, setExperimentPhase] = useState<ExperimentPhase>("calibration");
const [calibTrials, setCalibTrials]         = useState(0); 

// Refs for use in timeout closures (critical!)
const experimentPhaseRef = useRef<ExperimentPhase>("calibration");
const calibTrialsRef     = useRef(0);
const inputTimestampRef  = useRef<number>(0);
const reactionTimesRef   = useRef<number[]>([]);

// Keep refs in sync
experimentPhaseRef.current = experimentPhase;
calibTrialsRef.current     = calibTrials;
```

**2. Reaction Time Capture:**
- **On `SHOOT!` fires:** `inputTimestampRef.current = performance.now();`
- **On input received (in `handlePlayerMove`):**
  ```ts
  const rt = performance.now() - inputTimestampRef.current;
  reactionTimesRef.current = [...reactionTimesRef.current.slice(-19), rt]; // Keep last 20
  ```

---

## Step 3 — Split Reveal & Dynamic Scheduling

**File:** `src/App.tsx`

**Why:** The core "trick" depends on independent timing for the bot and player displays.

**1. Add independent visibility flags:**
```ts
const [botMoveVisible, setBotMoveVisible]       = useState(false);
const [playerMoveVisible, setPlayerMoveVisible] = useState(false);
```

**2. Refactor `handlePlayerMove` reveal logic:**
Replace the standard `schedule(..., REVEAL_DELAY_MS)` with a conditional block:

```ts
if (!CONFIG.EXPERIMENT_MODE) {
  // Standard Game Logic
  schedule(() => {
    setBotMoveVisible(true);
    setPlayerMoveVisible(true);
    setRevealVisible(true);
    setPhase("reveal");
    playResultWithDelay(result, CONFIG.RESULT_SOUND_EXTRA_DELAY_MS);
  }, CONFIG.REVEAL_DELAY_MS);
} else {
  // Experiment Logic
  const isIllusion = experimentPhaseRef.current === "illusion";
  
  // Calculate if this specific trial should use asymmetric timing (RT gating)
  const rts = [...reactionTimesRef.current].sort((a, b) => a - b);
  const p25 = rts[Math.floor(rts.length * CONFIG.ILLUSION_RT_THRESHOLD)] || Infinity;
  const useAsymmetricTiming = isIllusion && (rt <= p25 || rts.length < CONFIG.ILLUSION_MIN_RT_HISTORY);

  const botDelay    = useAsymmetricTiming ? CONFIG.ILLUSION_DELAY_MS : getCalibrationDelay();
  const playerDelay = useAsymmetricTiming ? CONFIG.ILLUSION_PLAYER_MOVE_DELAY_MS : botDelay;

  // Schedule Bot Reveal + Feedback Beep
  schedule(() => {
    setBotMoveVisible(true);
    playFeedbackBeep(); // Step 4
  }, botDelay);

  // Schedule Player Reveal + UI Reveal Phase
  schedule(() => {
    setPlayerMoveVisible(true);
    setRevealVisible(true);
    setPhase("reveal");
    playResultWithDelay(result, CONFIG.RESULT_SOUND_EXTRA_DELAY_MS);
  }, playerDelay);
}
```

---

## Step 4 — Auditory Feedback Trigger

**File:** `src/utils/sounds.ts`

**Why:** Motor-sensory binding is strengthened by a high-frequency beep coincident with the sensory event (bot move).

```ts
/** High-frequency beep (1200Hz) to mark the feedback event */
export function playFeedbackBeep(): void {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}
```

---

## Step 5 — Phase Transitions & "Too Slow" Handling

**File:** `src/App.tsx`

**1. Increment Calibration (at end of successful round):**
```ts
if (CONFIG.EXPERIMENT_MODE && experimentPhase === "calibration") {
  setCalibTrials(prev => {
    const next = prev + 1;
    if (next >= CONFIG.CALIB_TRIAL_COUNT) setExperimentPhase("illusion");
    return next;
  });
}
```

**2. Handle Misses:**
In the "Too slow!" timeout:
```ts
if (CONFIG.EXPERIMENT_MODE && CONFIG.RESET_CALIB_ON_MISS) {
  setCalibTrials(0);
  setExperimentPhase("calibration");
}
```

---

## Step 6 — Debug Overlay & Data Logging

**File:** `src/App.tsx` (JSX)

**Why:** Essential for verifying the experiment is running as intended.

**1. Add a subtle debug indicator (bottom left):**
```tsx
{CONFIG.EXPERIMENT_MODE && (
  <div className="fixed bottom-2 left-2 text-[10px] font-mono opacity-30 pointer-events-none uppercase">
    {experimentPhase} | Trials: {calibTrials} | RT: {lastRT}ms
  </div>
)}
```

**2. Console Logging:**
In `handlePlayerMove`, log the parameters for every trial:
`console.table({ phase, botDelay, playerDelay, rt, result });`

---

## Dependency Order

1. **Step 1 & 4** (Utils): Pure additions, no dependencies.
2. **Step 2** (State): Defines the variables used in later steps.
3. **Step 3** (The "Trick"): Core logic implementation.
4. **Step 5** (Transitions): Hooks the logic into the game lifecycle.
5. **Step 6** (Logging): Final verification layer.

---

## Regression Test Checklist

- [ ] **Standard Mode:** Set `EXPERIMENT_MODE: false`. Game should feel exactly as before.
- [ ] **Calibration Phase:** Result appears at ~135ms. No perceptible gap between bot and player moves.
- [ ] **Illusion Phase (Slow RT):** If you take your time, it should still feel like Calibration (135ms).
- [ ] **Illusion Phase (Fast RT):** Bot move should appear noticeably earlier than player move.
- [ ] **Miss Handling:** Missing a "SHOOT!" should reset the `calibTrials` counter (if configured).
- [ ] **Mobile:** Verify touch input still triggers the split reveal correctly.

---

*Source: Stetson, C., Cui, X., Montague, P. R., & Eagleman, D. M. (2006).
Motor-Sensory Recalibration Leads to an Illusory Reversal of Action and
Sensation. Neuron, 51, 651–659.*
