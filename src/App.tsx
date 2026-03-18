/**
 * App.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Rock · Paper · Scissors — Ink & Wash Edition
 *
 * Smooth continuous play:
 *  • Hover arena (or tap on mobile) to start.
 *  • Countdown: 1 → 2 → 3 → SHOOT!
 *  • Input accepted from late in "3" through well after SHOOT! (forgiving).
 *  • 3 second result display, then auto-restart if cursor still in arena.
 *  • No instructions shown between rounds — just a quiet breath.
 *  • Cursor hidden inside the arena.
 *  • Mobile: giant translucent overlay buttons always visible.
 *
 * All durations are imported from config.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { CONFIG } from "./config";
import { WatercolorCanvas } from "./components/WatercolorCanvas";
import {
  playCountdownTick,
  playShootSound,
  playResultWithDelay,
} from "./utils/sounds";
import {
  computeComputerMove,
  determineOutcome,
  type Move,
} from "./utils/computerAI";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase =
  | "idle"       // waiting for player to hover/click Start
  | "countdown"  // counting 1 → 2 → 3 (before early window)
  | "accepting"  // accepting input (early window in "3", SHOOT, late grace)
  | "locked"     // player chose, computing result
  | "reveal";    // showing result

// ─── Static display maps ─────────────────────────────────────────────────────
const MOVE_EMOJI: Record<Move, string> = {
  rock:     "🪨",
  paper:    "📄",
  scissors: "✂️",
};
const MOVE_LABEL: Record<Move, string> = {
  rock:     "Rock",
  paper:    "Paper",
  scissors: "Scissors",
};

/**
 * TODO: Add your custom images to /public/moves/ as rock.png, paper.png, scissors.png
 * The MoveIcon component will automatically detect them.
 */
const MOVE_IMAGES: Record<Move, string> = {
  rock:     "/moves/rock.png",
  paper:    "/moves/paper.png",
  scissors: "/moves/scissors.png",
};

// Global cache for image availability to prevent per-render 404s
let _imagesDetected: boolean | null = null;

const MoveIcon: React.FC<{ move: Move; className?: string }> = ({ move, className }) => {
  // If we've already detected images are missing, go straight to emoji
  if (_imagesDetected === false) {
    return <div className={className}>{MOVE_EMOJI[move]}</div>;
  }

  return (
    <img 
      src={MOVE_IMAGES[move]} 
      alt={MOVE_LABEL[move]}
      className={className}
      style={{ objectFit: 'contain' }}
      // Fallback if this specific image fails
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  );
};

const InkPlaceholder: React.FC = () => (
  <div className="w-12 h-12 rounded-full border-2 border-dashed border-black/5 flex items-center justify-center">
    <div className="w-2 h-2 rounded-full bg-black/5 animate-pulse" />
  </div>
);

// ─── Ink-border decoration ────────────────────────────────────────────────────
const InkBorder: React.FC<{ outcome?: "win" | "lose" | "tie" | null; active: boolean }> = ({
  outcome,
  active,
}) => {
  const base = "#3a2a1a";
  const color =
    outcome === "win"  ? "#4a7a4a" :
    outcome === "lose" ? "#8a3a3a" :
    outcome === "tie"  ? "#5a5a8a" : base;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 400 500"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ transition: "opacity 0.5s" }}
    >
      <defs>
        <filter id="inkBlur"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      <rect
        x="5" y="5" width="390" height="490"
        fill="none"
        stroke={color}
        strokeWidth={active ? "2" : "1.5"}
        strokeDasharray="10 5 3 5"
        opacity={active ? 0.45 : 0.28}
        filter="url(#inkBlur)"
        style={{ transition: "stroke 0.5s, opacity 0.5s, stroke-width 0.3s" }}
      />
      {[[10,10],[390,10],[10,490],[390,490]].map(([cx,cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3.5} fill={color} opacity={active ? 0.45 : 0.25}
          style={{ transition: "fill 0.5s, opacity 0.5s" }} />
      ))}
      <rect
        x="12" y="12" width="376" height="476"
        fill="none"
        stroke={color}
        strokeWidth="0.6"
        strokeDasharray="60 8"
        opacity={0.12}
        style={{ transition: "stroke 0.5s" }}
      />
    </svg>
  );
};

// ─── Score display ────────────────────────────────────────────────────────────
const ScoreBoard: React.FC<{
  wins: number; ties: number; losses: number; total: number;
}> = ({ wins, ties, losses, total }) => (
  <div className="flex gap-5 items-end">
    {[
      { label: "Wins",   val: wins,   color: "#3d7a3d" },
      { label: "Ties",   val: ties,   color: "#5a5a8a" },
      { label: "Losses", val: losses, color: "#8a3a3a" },
    ].map(({ label, val, color }) => (
      <div
        key={label}
        className="flex flex-col items-center px-4 py-2 rounded-sm"
        style={{
          background: "rgba(255,252,248,0.5)",
          border: "1px solid rgba(100,80,60,0.16)",
          backdropFilter: "blur(5px)",
        }}
      >
        <span
          className="text-4xl font-bold leading-none"
          style={{ fontFamily: "'Caveat', cursive", color }}
        >
          {val}
        </span>
        <span
          className="text-xs uppercase tracking-widest mt-0.5"
          style={{ color: "#8a7a6a", letterSpacing: "0.14em" }}
        >
          {label}
        </span>
      </div>
    ))}
    <div
      className="text-xs italic pb-1"
      style={{ color: "#a09080" }}
    >
      {total} played
    </div>
  </div>
);

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Debug ───────────────────────────────────────────────────────────────────
  const isDebug = new URLSearchParams(window.location.search).has("debug");

  // ── State ───────────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState<Phase>("idle");
  const [countdownIdx, setCountdownIdx] = useState(0);
  const [playerMove, setPlayerMove]     = useState<Move | null>(null);
  const [computerMove, setComputerMove] = useState<Move | null>(null);
  const [outcome, setOutcome]           = useState<"win" | "lose" | "tie" | null>(null);
  const [scores, setScores]             = useState({ wins: 0, ties: 0, losses: 0 });
  const [totalGames, setTotalGames]     = useState(0);
  const [playerHistory, setPlayerHistory] = useState<Record<Move, number>>({
    rock: 0, paper: 0, scissors: 0,
  });
  const [revealVisible, setRevealVisible]   = useState(false);
  const [adaptiveActive, setAdaptiveActive] = useState(false);
  const [missedShot, setMissedShot]         = useState(false);
  const [arenaHovered, setArenaHovered]     = useState(false);
  const [displayStep, setDisplayStep]       = useState<string>("");
  const [lastTouchMove, setLastTouchMove]   = useState<Move | null>(null);
  const [visualAccepting, setVisualAccepting] = useState(false);
  const [, setForceUpdate] = useState(0); // For image detection trigger

  // ── Asset Detection ────────────────────────────────────────────────────────
  useEffect(() => {
    // Check if rock image exists as a proxy for all images
    const img = new Image();
    img.src = MOVE_IMAGES.rock;
    img.onload = () => {
      _imagesDetected = true;
      // Preload the others
      new Image().src = MOVE_IMAGES.paper;
      new Image().src = MOVE_IMAGES.scissors;
      setForceUpdate(v => v + 1);
    };
    img.onerror = () => {
      _imagesDetected = false;
      setForceUpdate(v => v + 1);
    };
  }, []);

  // ── Debug Overrides ────────────────────────────────────────────────────────
  const [playerDelayOverride, setPlayerDelayOverride] = useState<number | null>(null);
  const [botDelayOverride, setBotDelayOverride]       = useState<number | null>(null);
  const [strategyOverride, setStrategyOverride]       = useState<"random" | "adaptive" | null>(null);

  // ── Reveal States ───────────────────────────────────────────────────────────
  const [computerRevealVisible, setComputerRevealVisible] = useState(false);
  const [playerRevealVisible, setPlayerRevealVisible]     = useState(false);

  // ── Debug State ─────────────────────────────────────────────────────────────
  const [debugLog, setDebugLog] = useState<{
    botStrategy: "random" | "adaptive";
    shootTime: number | null;
    inputTime: number | null;
    latency: number | null;
    playerDelay: number | null;
    botDelay: number | null;
  }>({
    botStrategy: "random",
    shootTime: null,
    inputTime: null,
    latency: null,
    playerDelay: null,
    botDelay: null,
  });

  // ── Haptic feedback helper ───────────────────────────────────────────────
  const haptic = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  // ── Refs ────────────────────────────────────────────────────────────────────
  // Refs mirror state for use inside timeout closures (avoids stale captures)
  const phaseRef         = useRef<Phase>("idle");
  const arenaHoveredRef  = useRef(false);
  const totalGamesRef    = useRef(0);
  const playerHistoryRef = useRef<Record<Move, number>>({ rock: 0, paper: 0, scissors: 0 });
  const computerMoveRef  = useRef<Move | null>(null);
  const timers           = useRef<ReturnType<typeof setTimeout>[]>([]);
  const earlyMoveRef     = useRef<Move | null>(null);

  // Keep refs in sync
  phaseRef.current         = phase;
  arenaHoveredRef.current  = arenaHovered;
  totalGamesRef.current    = totalGames;
  playerHistoryRef.current = playerHistory;

  // ── Stable function refs (solve circular dependency) ────────────────────────
  // We use refs to hold the latest version of functions so they can call
  // each other without stale closures or circular useCallback deps.
  const handlePlayerMoveRef = useRef<(m: Move) => void>(() => {});
  const beginCountdownRef   = useRef<() => void>(() => {});

  // ── Timer management ────────────────────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timers.current.push(id);
    return id;
  }, []);

  // ── queueAutoRestart ────────────────────────────────────────────────────────
  // After a reveal finishes, if cursor is still in arena, auto-start next round.
  const queueAutoRestart = useCallback(() => {
    if (arenaHoveredRef.current) {
      schedule(() => {
        if (arenaHoveredRef.current && phaseRef.current === "idle") {
          beginCountdownRef.current();
        }
      }, CONFIG.AUTO_RESTART_DELAY_MS);
    }
  }, [schedule]);

  // ─────────────────────────────────────────────────────────────────────────────
  // handlePlayerMove
  // ─────────────────────────────────────────────────────────────────────────────
  const handlePlayerMove = useCallback((move: Move) => {
    const p = phaseRef.current;

    // Only accept during "accepting" phase
    if (p !== "accepting") return;

    // Lock immediately — no more input this round
    setPhase("locked");

    // Computer move might have been pre-decided in "imbalance"
    const isImbalanceReveal = computerMoveRef.current !== null;
    const compMove = computerMoveRef.current || computeComputerMove(
      totalGamesRef.current, 
      playerHistoryRef.current,
      move,
      strategyOverride
    );
    const result   = determineOutcome(move, compMove);
    const strategy = strategyOverride || (totalGamesRef.current >= CONFIG.ADAPTIVE_THRESHOLD ? "adaptive" : "random");

    // THE CORE DELAY REWORK:
    const isLearned = totalGamesRef.current >= CONFIG.ADAPTIVE_THRESHOLD;
    
    // Player Delay: 135ms standard
    const playerDelay = playerDelayOverride !== null 
      ? playerDelayOverride 
      : ((CONFIG.EXPERIMENT_MODE && isLearned)
        ? CONFIG.ILLUSION_PLAYER_MOVE_DELAY_MS
        : CONFIG.CALIB_DELAY_MS);

    // Bot Delay: 
    // - If it was an imbalance reveal, it's already shown (0 delay).
    // - If there is a manual override, use it.
    // - Otherwise, in illusion mode it's very fast (35ms).
    // - In normal mode, we give it a range around 135ms (100-180ms) 
    //   so sometimes it shows before the player, sometimes after.
    let botDelay = 0;
    if (!isImbalanceReveal) {
      if (botDelayOverride !== null) {
        botDelay = botDelayOverride;
      } else if (CONFIG.EXPERIMENT_MODE && isLearned) {
        botDelay = CONFIG.ILLUSION_DELAY_MS;
      } else {
        // Randomize bot delay slightly so it's not always exactly 135ms
        // This allows the player to sometimes "show first"
        botDelay = Math.round(100 + Math.random() * 80);
      }
    }

    if (isDebug) {
      const inputTime = Date.now();
      const shootTime = debugLog.shootTime;
      setDebugLog(prev => ({
        ...prev,
        botStrategy: strategy,
        inputTime,
        latency: shootTime ? inputTime - shootTime : null,
        playerDelay,
        botDelay: isImbalanceReveal ? -CONFIG.IMBALANCE_ADVANCE_MS : botDelay,
      }));
    }

    setComputerMove(compMove);

    // Schedule Bot Reveal
    if (!isImbalanceReveal) {
      schedule(() => {
        setComputerRevealVisible(true);
      }, botDelay);
    } else {
      setComputerRevealVisible(true);
    }

    // Schedule Player Reveal + ALL sensory consequences (sound, haptic, visuals, scores)
    schedule(() => {
      // VISUAL CHOICE FEEDBACK
      setPlayerMove(move);
      setPlayerRevealVisible(true);
      
      // BUTTON FEEDBACK (Ink splash and scale)
      setLastTouchMove(move);
      setTimeout(() => setLastTouchMove(null), 400);

      // ARENA FEEDBACK
      setRevealVisible(true);
      setVisualAccepting(false);
      setPhase("reveal");
      setOutcome(result);

      // SCOREBOARD FEEDBACK
      setScores(prev => ({
        wins:   result === "win"  ? prev.wins + 1   : prev.wins,
        ties:   result === "tie"  ? prev.ties + 1   : prev.ties,
        losses: result === "lose" ? prev.losses + 1 : prev.losses,
      }));

      const nextTotal = totalGamesRef.current + 1;
      setTotalGames(nextTotal);
      setPlayerHistory(prev => ({ ...prev, [move]: prev[move] + 1 }));
      if (nextTotal >= CONFIG.ADAPTIVE_THRESHOLD) setAdaptiveActive(true);

      // AUDIO / HAPTIC FEEDBACK
      playResultWithDelay(result, 0); 
      
      if (result === "win") haptic([25, 45, 35]);
      else if (result === "lose") haptic(40);
      else haptic([15, 15]);

      // Auto-return to idle / auto-restart after the result duration
      schedule(() => {
        setRevealVisible(false);
        setPhase("idle");
        queueAutoRestart();
      }, CONFIG.REVEAL_DURATION_MS);

    }, playerDelay);

  }, [schedule, queueAutoRestart, haptic, isDebug, debugLog.shootTime, playerDelayOverride, botDelayOverride, strategyOverride]);

  // Keep ref updated
  handlePlayerMoveRef.current = handlePlayerMove;

  // ─────────────────────────────────────────────────────────────────────────────
  // beginCountdown
  // ─────────────────────────────────────────────────────────────────────────────
  const beginCountdown = useCallback(() => {
    if (phaseRef.current !== "idle") return;

    clearAllTimers();
    setPhase("countdown");
    setCountdownIdx(0);
    setPlayerMove(null);
    setComputerMove(null);
    computerMoveRef.current = null;
    setOutcome(null);
    setRevealVisible(false);
    setComputerRevealVisible(false);
    setPlayerRevealVisible(false);
    setVisualAccepting(false);
    setMissedShot(false);
    setDisplayStep("1");
    earlyMoveRef.current = null;

    const step    = CONFIG.STEP_DURATION_MS;
    const earlyMs = CONFIG.INPUT_EARLY_WINDOW_MS;

    // Step "1" — immediate tick
    playCountdownTick();
    haptic(8);

    // Step "2"
    schedule(() => {
      setCountdownIdx(1);
      setDisplayStep("2");
      playCountdownTick();
      haptic(8);
    }, step);

    // Step "3"
    schedule(() => {
      setCountdownIdx(2);
      setDisplayStep("3");
      playCountdownTick();
      haptic(10);
    }, step * 2);

    // "Imbalance": Computer decides before "SHOOT!" with probability from CONFIG
    schedule(() => {
      if (Math.random() < CONFIG.IMBALANCE_PROBABILITY) {
        const compMove = computeComputerMove(totalGamesRef.current, playerHistoryRef.current);
        computerMoveRef.current = compMove;
        setComputerMove(compMove);
        setComputerRevealVisible(true);
        playCountdownTick();
      }
    }, step * 3 - CONFIG.IMBALANCE_ADVANCE_MS);

    // Early input window opens during "3" step (earlyMs before SHOOT)
    schedule(() => {
      if (phaseRef.current === "countdown") {
        setPhase("accepting");
        setVisualAccepting(true);
      }
    }, step * 3 - earlyMs);

    // "SHOOT!" fires
    schedule(() => {
      setCountdownIdx(3);
      setDisplayStep("SHOOT!");
      playShootSound();
      haptic(25);

      if (isDebug) {
        setDebugLog(prev => ({ ...prev, shootTime: Date.now(), inputTime: null, latency: null }));
      }

      // Ensure accepting phase (unless already locked by early input)
      if (phaseRef.current !== "locked") {
        setPhase("accepting");
        setVisualAccepting(true);
      }

      // Miss timeout: SHOOT_WINDOW_MS + late grace
      schedule(() => {
        if (phaseRef.current === "accepting") {
          setMissedShot(true);
          setPhase("reveal");
          setVisualAccepting(false);
          setRevealVisible(true);
          setComputerRevealVisible(true);
          setPlayerRevealVisible(true);

          const holdMs = CONFIG.REVEAL_DURATION_MS + CONFIG.MISS_EXTRA_HOLD_MS;
          schedule(() => {
            setRevealVisible(false);
            setPhase("idle");
            queueAutoRestart();
          }, holdMs);
        }
      }, CONFIG.SHOOT_WINDOW_MS + CONFIG.INPUT_LATE_GRACE_MS);
    }, step * 3);
  }, [clearAllTimers, schedule, queueAutoRestart, isDebug, haptic]);

  // Keep ref updated
  beginCountdownRef.current = beginCountdown;

  // ── Keyboard listener ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Move keys: number row or numpad
      if (e.code === "Digit1" || e.code === "Numpad1") handlePlayerMoveRef.current("rock");
      if (e.code === "Digit2" || e.code === "Numpad2") handlePlayerMoveRef.current("paper");
      if (e.code === "Digit3" || e.code === "Numpad3") handlePlayerMoveRef.current("scissors");
      // Start keys: space / enter when idle
      if ((e.code === "Space" || e.code === "Enter") && phaseRef.current === "idle") {
        beginCountdownRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const isShoot       = countdownIdx === 3;
  const showCountdown = phase === "countdown" || phase === "accepting" || phase === "locked";
  const isAccepting   = phase === "accepting";

  const outcomeColor =
    outcome === "win"  ? "#3a7a3a" :
    outcome === "lose" ? "#8a3030" : "#5a5a7a";

  const outcomeWord =
    outcome === "win"  ? "Victory!"   :
    outcome === "lose" ? "Defeat."    :
    outcome === "tie"  ? "Draw."      : "Missed!";

  // Show start button + instructions only when idle and cursor NOT in arena
  const showStartButton = phase === "idle" && !revealVisible && !arenaHovered;

  // Remaining games until adaptive AI
  const adaptiveCountdown =
    totalGames < CONFIG.ADAPTIVE_THRESHOLD
      ? CONFIG.ADAPTIVE_THRESHOLD - totalGames
      : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden select-none px-4"
      style={{
        background: "linear-gradient(135deg, #f6f1eb 0%, #ede7df 45%, #e8e0d6 100%)",
        fontFamily: "'IM Fell English', serif",
      }}
    >
      {/* ── Living watercolor background ── */}
      <WatercolorCanvas />

      {/* ── Title ── */}
      <header className="relative z-10 text-center mb-4 md:mb-5" style={{ zIndex: 10 }}>
        <h1
          className="text-4xl sm:text-5xl md:text-6xl font-bold"
          style={{
            fontFamily: "'Caveat', cursive",
            color: "#241810",
            textShadow: "1px 2px 12px rgba(90,65,45,0.16)",
            letterSpacing: "0.03em",
          }}
        >
          Rock · Paper · Scissors
        </h1>
        <p className="mt-1 text-sm md:text-base italic" style={{ color: "#6a5a4a" }}>
          ink &amp; wash edition
        </p>
        {adaptiveActive && (
          <p className="mt-1 text-xs md:text-sm italic" style={{ color: "#8a3a2a", opacity: 0.8 }}>
            ⚠ The ink has learned your patterns…
          </p>
        )}
        {!adaptiveActive && adaptiveCountdown > 0 && totalGames > 0 && (
          <p className="mt-1 text-[10px] md:text-xs italic" style={{ color: "#9a8a7a", opacity: 0.7 }}>
            ({adaptiveCountdown} more until the ink adapts)
          </p>
        )}
      </header>

      {/* ── Scoreboard ── */}
      <div className="relative z-10 mb-6" style={{ zIndex: 10 }}>
        <ScoreBoard
          wins={scores.wins}
          ties={scores.ties}
          losses={scores.losses}
          total={totalGames}
        />
      </div>

      {/* ── Arena card ── */}
      <div
        className="relative z-10 w-full max-w-md mx-4 rounded-sm overflow-hidden arena-card"
        style={{
          zIndex: 10,
          background: "rgba(255,252,248,0.58)",
          border: "none",
          backdropFilter: "blur(10px)",
          boxShadow: arenaHovered
            ? "0 6px 60px rgba(70,50,30,0.18), 0 2px 8px rgba(70,50,30,0.12)"
            : "0 3px 30px rgba(70,50,30,0.11), 0 1px 4px rgba(70,50,30,0.08)",
          minHeight: 340,
          transition: "box-shadow 0.4s ease",
        }}
        onMouseEnter={() => {
          setArenaHovered(true);
          if (phaseRef.current === "idle") {
            schedule(() => {
              if (arenaHoveredRef.current && phaseRef.current === "idle") {
                beginCountdownRef.current();
              }
            }, 80);
          }
        }}
        onMouseLeave={() => {
          setArenaHovered(false);
        }}
      >
        <InkBorder outcome={outcome} active={arenaHovered} />

        <div
          className="relative flex flex-col items-center justify-center p-6 md:p-8"
          style={{ minHeight: 340, zIndex: 2 }}
        >
          {/* ── IDLE: Start prompt (only when cursor outside arena) ── */}
          {showStartButton && (
            <div
              className="flex flex-col items-center gap-5 w-full"
              style={{ animation: "inkFadeIn 0.5s ease-out" }}
            >
              <button
                className="relative px-14 py-5 rounded-sm text-3xl font-bold cursor-pointer transition-all duration-300"
                style={{
                  fontFamily: "'Caveat', cursive",
                  color: "#241810",
                  background: "rgba(200,185,165,0.28)",
                  border: "2px solid rgba(80,55,35,0.35)",
                  letterSpacing: "0.08em",
                  boxShadow: "0 2px 14px rgba(80,55,35,0.12), inset 0 1px 0 rgba(255,250,240,0.4)",
                }}
                onClick={() => beginCountdownRef.current()}
              >
                <span style={{ position: "relative", zIndex: 1 }}>▶ Start</span>
              </button>

              <p className="text-sm italic text-center" style={{ color: "#8a7a6a" }}>
                hover the arena · or press{" "}
                <kbd className="font-mono px-1 rounded" style={{ background: "rgba(180,165,145,0.25)", border: "1px solid rgba(100,80,60,0.2)", borderBottomWidth: 2 }}>
                  Enter
                </kbd>{" "}
                to begin
              </p>

              <div className="flex flex-col gap-1.5 text-center text-sm" style={{ color: "#7a6a58" }}>
                <p className="italic">
                  Press between <strong>3</strong> and <strong>SHOOT!</strong>
                </p>
                <div className="flex gap-5 justify-center mt-1">
                  {(["rock", "paper", "scissors"] as Move[]).map((m, i) => (
                    <span key={m} className="flex items-center gap-1">
                      <kbd
                        className="font-mono px-1.5 py-0.5 rounded text-xs"
                        style={{
                          background: "rgba(180,165,145,0.25)",
                          border: "1px solid rgba(100,80,60,0.2)",
                          borderBottomWidth: 2,
                        }}
                      >
                        {i + 1}
                      </kbd>
                      <span>{MOVE_LABEL[m]}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── IDLE inside arena: quiet breathing dots (no instructions) ── */}
          {phase === "idle" && !revealVisible && arenaHovered && (
            <div
              className="flex flex-col items-center gap-3"
              style={{ animation: "inkFadeIn 0.3s ease-out" }}
            >
              <div
                className="text-4xl font-bold"
                style={{
                  fontFamily: "'Caveat', cursive",
                  color: "#8a7a6a",
                  opacity: 0.5,
                  animation: "breathe 2s ease-in-out infinite",
                }}
              >
                · · ·
              </div>
            </div>
          )}

          {/* ── ACTIVE GAME (Countdown, Accepting, Locked, or Reveal) ── */}
          {(showCountdown || revealVisible) && (
            <div 
              className="flex flex-col items-center gap-5 w-full"
              style={{ animation: "inkFadeIn 0.4s ease-out" }}
            >
              {missedShot ? (
                <div className="text-center">
                  <p
                    className="text-5xl font-bold"
                    style={{ fontFamily: "'Caveat', cursive", color: "#7a4a20" }}
                  >
                    Too slow!
                  </p>
                  <p className="text-sm italic mt-2" style={{ color: "#9a8a78" }}>
                    Choose before SHOOT! fades
                  </p>
                </div>
              ) : (
                <>
                  {/* If no reveal has happened at all (standard 1, 2, 3), show centered countdown */}
                  {(!computerRevealVisible && !playerRevealVisible) ? (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <div
                        key={displayStep}
                        style={{
                          fontFamily: "'Caveat', cursive",
                          fontSize: isShoot ? "4.5rem" : "6rem",
                          fontWeight: 700,
                          lineHeight: 1,
                          color: isShoot ? "#7a2e10" : "#241810",
                          textShadow: isShoot
                            ? "0 0 40px rgba(200,70,20,0.3), 2px 3px 12px rgba(80,30,10,0.18)"
                            : "2px 3px 10px rgba(70,40,20,0.14)",
                          animation: "inkPop 0.22s cubic-bezier(.2,1.6,.4,1)",
                        }}
                      >
                        {displayStep}
                      </div>

                      {isAccepting && isShoot && (
                        <p
                          className="text-xl animate-pulse"
                          style={{ fontFamily: "'Caveat', cursive", color: "#5a3010" }}
                        >
                          1 · 2 · 3 … now!
                        </p>
                      )}
                    </div>
                  ) : (
                    /* THE VERSUS LAYOUT (Used for imbalance, calibration delay, and final reveal) */
                    <div className="flex flex-col items-center gap-5 w-full">
                      <div className="flex items-center gap-6 justify-center w-full">
                        {/* Player Side */}
                        <div 
                          className="flex flex-col items-center gap-1 transition-all duration-300"
                          style={{ opacity: playerRevealVisible ? 1 : 0.35, transform: playerRevealVisible ? "scale(1)" : "scale(0.95)" }}
                        >
                          <div
                            className="text-6xl md:text-7xl flex items-center justify-center w-20 h-20 md:w-24 md:h-24"
                            style={{
                              filter: "drop-shadow(1px 3px 6px rgba(0,0,0,0.13))",
                              animation: playerRevealVisible ? "inkPop 0.3s ease-out" : "none",
                            }}
                          >
                            {playerRevealVisible && playerMove ? (
                              <MoveIcon move={playerMove} className="w-full h-full" />
                            ) : (
                              <InkPlaceholder />
                            )}
                          </div>
                          <span
                            className="text-lg font-semibold h-7"
                            style={{ fontFamily: "'Caveat', cursive", color: "#3a2a18", fontSize: "1.25rem" }}
                          >
                            {playerRevealVisible && playerMove ? MOVE_LABEL[playerMove] : ""}
                          </span>
                          <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a78" }}>
                            You
                          </span>
                        </div>

                        {/* Middle: Countdown OR "vs" */}
                        <div 
                          className="flex flex-col items-center justify-center min-w-[80px]"
                          style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, color: "#a09080" }}
                        >
                          {showCountdown ? (
                            <div 
                              key={displayStep}
                              className="text-4xl md:text-5xl"
                              style={{ 
                                animation: "inkPop 0.22s cubic-bezier(.2,1.6,.4,1)",
                                color: isShoot ? "#7a2e10" : "#a09080",
                                textShadow: isShoot ? "0 0 20px rgba(200,70,20,0.15)" : "none"
                              }}
                            >
                              {displayStep}
                            </div>
                          ) : (
                            <div className="text-2xl animate-inkFadeIn">vs</div>
                          )}
                        </div>

                        {/* Computer Side */}
                        <div 
                          className="flex flex-col items-center gap-1 transition-all duration-300"
                          style={{ opacity: computerRevealVisible ? 1 : 0.35, transform: computerRevealVisible ? "scale(1)" : "scale(0.95)" }}
                        >
                          <div
                            className="text-6xl md:text-7xl flex items-center justify-center w-20 h-20 md:w-24 md:h-24"
                            style={{
                              filter: "drop-shadow(1px 3px 6px rgba(0,0,0,0.13))",
                              animation: computerRevealVisible ? "inkPop 0.3s ease-out" : "none",
                            }}
                          >
                            {computerRevealVisible && computerMove ? (
                              <MoveIcon move={computerMove} className="w-full h-full" />
                            ) : (
                              <InkPlaceholder />
                            )}
                          </div>
                          <span
                            className="text-lg font-semibold h-7"
                            style={{ fontFamily: "'Caveat', cursive", color: "#3a2a18", fontSize: "1.25rem" }}
                          >
                            {computerRevealVisible && computerMove ? MOVE_LABEL[computerMove] : ""}
                          </span>
                          <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a78" }}>
                            Ink
                          </span>
                        </div>
                      </div>

                      {/* Outcome (only when sensory revealed) */}
                      {playerRevealVisible && (
                        <div className="flex flex-col items-center gap-2 w-full">
                          <div
                            className="text-5xl font-bold mt-1"
                            style={{
                              fontFamily: "'Caveat', cursive",
                              color: outcomeColor,
                              textShadow: "1px 2px 8px rgba(0,0,0,0.09)",
                              animation: "inkPop 0.35s ease-out both",
                            }}
                          >
                            {outcomeWord}
                          </div>
                          <div
                            className="w-full h-1 rounded-full mt-0"
                            style={{
                              background: `linear-gradient(90deg, transparent, ${outcomeColor}55, transparent)`,
                              transition: "background 0.5s",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Mobile overlay buttons (Fantastic Version) ── */}
        <div
          className="absolute inset-x-0 bottom-0 flex justify-around items-end pb-10 px-4 md:hidden pointer-events-none"
          style={{ zIndex: 30 }}
        >
          {(["rock", "paper", "scissors"] as Move[]).map((move, i) => {
            const accepting = visualAccepting;
            const isLastPressed = lastTouchMove === move;
            const isHidden = phase === "idle" || phase === "reveal";
            
            // Generate a unique organic shape for each button
            const radii = [
              "60% 40% 30% 70% / 60% 30% 70% 40%",
              "40% 60% 70% 30% / 40% 50% 60% 50%",
              "50% 50% 30% 70% / 50% 60% 40% 60%",
            ][i];

            return (
              <button
                key={move}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const p = phaseRef.current;
                  if (p === "accepting") handlePlayerMoveRef.current(move);
                  else if (p === "idle") beginCountdownRef.current();
                }}
                onClick={() => {
                  const p = phaseRef.current;
                  if (p === "accepting") handlePlayerMoveRef.current(move);
                  else if (p === "idle") beginCountdownRef.current();
                }}
                className={`
                  relative pointer-events-auto flex flex-col items-center justify-center
                  w-20 h-20 sm:w-24 sm:h-24 transition-all duration-300
                  ${isLastPressed ? 'scale-90' : 'scale-100'}
                  ${accepting ? 'animate-pulse-subtle' : ''}
                `}
                style={{
                  background: accepting ? "rgba(255, 252, 248, 0.92)" : "rgba(255, 252, 248, 0.25)",
                  border: accepting ? "1px solid rgba(100, 80, 60, 0.2)" : "1px solid rgba(100, 80, 60, 0.1)",
                  borderRadius: radii,
                  boxShadow: accepting 
                    ? "0 8px 25px rgba(0,0,0,0.12), inset 0 0 15px rgba(100,80,60,0.08)"
                    : "0 2px 6px rgba(0,0,0,0.04)",
                  backdropFilter: "blur(6px)",
                  opacity: isHidden ? 0 : 1,
                  visibility: isHidden ? "hidden" : "visible",
                  transition: "opacity 0.4s, transform 0.2s, background 0.3s, visibility 0.4s, border-radius 0.5s",
                }}
              >
                {/* Ink splash effect on press */}
                {isLastPressed && (
                  <div className="absolute inset-0 animate-ping opacity-30" style={{ background: "#8a7a6a", borderRadius: radii }} />
                )}
                
                <span
                  className="text-4xl sm:text-5xl flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16"
                  style={{
                    filter: accepting ? "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" : "grayscale(100%) opacity(0.5)",
                    transform: accepting ? "scale(1.15)" : "scale(0.9)",
                    transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.3s",
                  }}
                >
                  <MoveIcon move={move} className="w-full h-full" />
                </span>
                <span
                  className="text-xs mt-1 font-bold uppercase tracking-widest"
                  style={{
                    fontFamily: "'Caveat', cursive",
                    color: accepting ? "#3a2a18" : "#a09080",
                    opacity: accepting ? 1 : 0.5,
                    fontSize: '0.65rem'
                  }}
                >
                  {MOVE_LABEL[move]}
                </span>

                {/* Decorative ink ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-12 pointer-events-none" viewBox="0 0 100 100">
                  <path
                    d="M20,50 C20,20 80,20 80,50 C80,80 20,80 20,50"
                    fill="none"
                    stroke={accepting ? "#5a4a3a" : "rgba(100,80,60,0.15)"}
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                    opacity={accepting ? 0.5 : 0.2}
                    style={{ transition: 'stroke 0.3s' }}
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Desktop key hint (below arena) ── */}
      <div
        className="relative z-10 mt-5 text-xs italic hidden md:block text-center transition-opacity duration-300"
        style={{ color: "#a09080", zIndex: 10, opacity: visualAccepting ? 1 : 0.4 }}
      >
        keyboard:{" "}
        {(["rock","paper","scissors"] as Move[]).map((m, i) => (
          <span key={m}>
            <kbd
              className="font-mono px-1 rounded mx-0.5"
              style={{ 
                background: visualAccepting ? "rgba(180,165,145,0.3)" : "rgba(180,165,145,0.1)", 
                border: "1px solid rgba(100,80,60,0.18)", 
                borderBottomWidth: 2 
              }}
            >
              {i+1}
            </kbd>{" "}{MOVE_LABEL[m]}
            {i < 2 ? " · " : ""}
          </span>
        ))}
        &nbsp;|&nbsp;numpad works too
      </div>

      {/* ── Debug Overlay ── */}
      {isDebug && (
        <div 
          className="fixed bottom-0 right-0 p-3 m-2 rounded bg-black/90 text-white text-[10px] font-mono z-[100] backdrop-blur-sm border border-white/20 flex flex-col gap-2 min-w-[220px]"
        >
          <div className="flex flex-col gap-1.5 border-b border-white/10 pb-2">
            <div className="flex items-center justify-between gap-2">
              <label className="w-12">Player:</label>
              <input 
                type="range" 
                min="0" 
                max={CONFIG.CALIB_DELAY_MS + 500} 
                value={playerDelayOverride ?? CONFIG.CALIB_DELAY_MS} 
                onChange={(e) => setPlayerDelayOverride(Number(e.target.value))}
                className="flex-1 accent-blue-500 h-1"
              />
              <button 
                onClick={() => setPlayerDelayOverride(null)}
                className={`px-1 rounded border ${playerDelayOverride === null ? 'bg-blue-600 border-blue-400' : 'bg-transparent border-white/20'}`}
              >
                Default
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="w-12">Bot:</label>
              <input 
                type="range" 
                min="0" 
                max={180 + 500} 
                value={botDelayOverride ?? (debugLog.botDelay !== null && debugLog.botDelay >= 0 ? debugLog.botDelay : 140)} 
                onChange={(e) => setBotDelayOverride(Number(e.target.value))}
                className="flex-1 accent-red-500 h-1"
              />
              <button 
                onClick={() => setBotDelayOverride(null)}
                className={`px-1 rounded border ${botDelayOverride === null ? 'bg-red-600 border-red-400' : 'bg-transparent border-white/20'}`}
              >
                Default
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="w-12">Strat:</label>
              <div className="flex-1 flex gap-1">
                <button 
                  onClick={() => {
                    if (strategyOverride === null) setStrategyOverride("random");
                    else if (strategyOverride === "random") setStrategyOverride("adaptive");
                    else setStrategyOverride(null);
                  }}
                  className="flex-1 px-1 rounded border border-white/20 bg-transparent hover:bg-white/5"
                >
                  Cycle: {strategyOverride === null ? 'Default' : (strategyOverride === 'random' ? 'Random' : 'Adaptive')}
                </button>
                <button 
                  onClick={() => setStrategyOverride(null)}
                  className={`px-1 rounded border ${strategyOverride === null ? 'bg-purple-600 border-purple-400' : 'bg-transparent border-white/20'}`}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center gap-3">
            <div className="flex gap-2">
              <span className="text-blue-300">P:{debugLog.playerDelay ?? "---"}ms</span>
              <span className="opacity-40">vs</span>
              <span className="text-red-300">C:{debugLog.botDelay ?? "---"}ms</span>
            </div>
            <span className="text-yellow-400 font-bold">
              {CONFIG.EXPERIMENT_MODE 
                ? (totalGames >= CONFIG.ADAPTIVE_THRESHOLD ? "GASLIGHT" : "CALIB") 
                : "NORMAL"}
            </span>
          </div>
          <div className="flex justify-between items-center opacity-80">
            <span>RT: {debugLog.latency ?? "---"}ms</span>
            {debugLog.botDelay !== null && debugLog.botDelay < 0 && (
              <span className="text-orange-400 animate-pulse">IMBALANCE!</span>
            )}
            <span className={strategyOverride ? 'text-purple-400 font-bold' : ''}>
              {debugLog.botStrategy.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* ── Keyframe animations + arena cursor hiding ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=IM+Fell+English:ital@0;1&display=swap');

        .arena-card {
          cursor: none !important;
        }
        .arena-card * {
          cursor: none !important;
        }

        @keyframes inkPop {
          0%   { opacity: 0; transform: scale(0.65) rotate(-4deg); }
          65%  { transform: scale(1.07) rotate(1.5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes inkFadeIn {
          0%   { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.35; transform: scale(0.95); }
          50%      { opacity: 0.6;  transform: scale(1.05); }
        }
        @keyframes pulse-subtle {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
