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

    setLastTouchMove(move);
    setTimeout(() => setLastTouchMove(null), 400);

    // During early countdown phase, stash the move for processing at SHOOT
    if (p === "countdown") {
      earlyMoveRef.current = move;
      haptic(12);
      return;
    }

    // Only accept during "accepting" phase
    if (p !== "accepting") return;

    haptic(18);

    // Lock immediately — no more input this round
    setPhase("locked");
    earlyMoveRef.current = null;

    // Computer decides RIGHT NOW based on accumulated history
    const compMove = computeComputerMove(totalGamesRef.current, playerHistoryRef.current);
    const result   = determineOutcome(move, compMove);

    setPlayerMove(move);
    setComputerMove(compMove);
    setOutcome(result);

    // Update scoreboard
    setScores(prev => ({
      wins:   result === "win"  ? prev.wins + 1   : prev.wins,
      ties:   result === "tie"  ? prev.ties + 1   : prev.ties,
      losses: result === "lose" ? prev.losses + 1 : prev.losses,
    }));

    const nextTotal = totalGamesRef.current + 1;
    setTotalGames(nextTotal);
    setPlayerHistory(prev => ({ ...prev, [move]: prev[move] + 1 }));
    if (nextTotal >= CONFIG.ADAPTIVE_THRESHOLD) setAdaptiveActive(true);

    // Delayed reveal + result sound
    schedule(() => {
      setRevealVisible(true);
      setPhase("reveal");
      playResultWithDelay(result, CONFIG.RESULT_SOUND_EXTRA_DELAY_MS);
      // Extra haptic for victory!
      if (result === "win") schedule(() => haptic([25, 45, 35]), CONFIG.RESULT_SOUND_EXTRA_DELAY_MS);
      else if (result === "lose") schedule(() => haptic(40), CONFIG.RESULT_SOUND_EXTRA_DELAY_MS);
      else schedule(() => haptic([15, 15]), CONFIG.RESULT_SOUND_EXTRA_DELAY_MS);
    }, CONFIG.REVEAL_DELAY_MS);

    // Auto-return to idle / auto-restart
    schedule(() => {
      setRevealVisible(false);
      setPhase("idle");
      queueAutoRestart();
    }, CONFIG.REVEAL_DELAY_MS + CONFIG.REVEAL_DURATION_MS);
  }, [schedule, queueAutoRestart, haptic]);

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
    setOutcome(null);
    setRevealVisible(false);
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

    // Early input window opens during "3" step (earlyMs before SHOOT)
    schedule(() => {
      if (phaseRef.current === "countdown") {
        setPhase("accepting");
      }
    }, step * 3 - earlyMs);

    // "SHOOT!" fires
    schedule(() => {
      setCountdownIdx(3);
      setDisplayStep("SHOOT!");
      playShootSound();
      haptic(25);

      // If player pressed early during "3", process it now
      if (earlyMoveRef.current) {
        const em = earlyMoveRef.current;
        earlyMoveRef.current = null;
        // Ensure we're in accepting so handlePlayerMove processes it
        setPhase("accepting");
        // Micro-delay for React to flush
        schedule(() => handlePlayerMoveRef.current(em), 16);
        return;
      }

      // Ensure accepting phase (unless already locked by early input)
      if (phaseRef.current !== "locked") {
        setPhase("accepting");
      }

      // Miss timeout: SHOOT_WINDOW_MS + late grace
      schedule(() => {
        if (phaseRef.current === "accepting") {
          setMissedShot(true);
          setPhase("reveal");
          setRevealVisible(true);

          const holdMs = CONFIG.REVEAL_DURATION_MS + CONFIG.MISS_EXTRA_HOLD_MS;
          schedule(() => {
            setRevealVisible(false);
            setPhase("idle");
            queueAutoRestart();
          }, holdMs);
        }
      }, CONFIG.SHOOT_WINDOW_MS + CONFIG.INPUT_LATE_GRACE_MS);
    }, step * 3);
  }, [clearAllTimers, schedule, queueAutoRestart]);

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

          {/* ── COUNTDOWN / ACCEPTING / LOCKED ── */}
          {showCountdown && !revealVisible && (
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
              {phase === "locked" && (
                <p className="text-sm italic" style={{ color: "#8a7a6a", animation: "inkFadeIn 0.2s ease-out" }}>
                  deciding…
                </p>
              )}
            </div>
          )}

          {/* ── REVEAL ── */}
          {revealVisible && (
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
                  {/* Moves side by side */}
                  <div className="flex items-center gap-6 justify-center w-full">
                    {/* Player */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="text-6xl md:text-7xl"
                        style={{
                          filter: "drop-shadow(1px 3px 6px rgba(0,0,0,0.13))",
                          animation: "inkPop 0.3s ease-out",
                        }}
                      >
                        {playerMove ? MOVE_EMOJI[playerMove] : "❓"}
                      </div>
                      <span
                        className="text-lg font-semibold"
                        style={{ fontFamily: "'Caveat', cursive", color: "#3a2a18", fontSize: "1.25rem" }}
                      >
                        {playerMove ? MOVE_LABEL[playerMove] : ""}
                      </span>
                      <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a78" }}>
                        You
                      </span>
                    </div>

                    {/* VS */}
                    <div style={{ fontFamily: "'Caveat', cursive", fontSize: "1.6rem", color: "#a09080", fontWeight: 700 }}>
                      vs
                    </div>

                    {/* Computer */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="text-6xl md:text-7xl"
                        style={{
                          filter: "drop-shadow(1px 3px 6px rgba(0,0,0,0.13))",
                          animation: "inkPop 0.3s ease-out 0.1s both",
                        }}
                      >
                        {computerMove ? MOVE_EMOJI[computerMove] : "❓"}
                      </div>
                      <span
                        className="text-lg font-semibold"
                        style={{ fontFamily: "'Caveat', cursive", color: "#3a2a18", fontSize: "1.25rem" }}
                      >
                        {computerMove ? MOVE_LABEL[computerMove] : ""}
                      </span>
                      <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a78" }}>
                        Ink
                      </span>
                    </div>
                  </div>

                  {/* Outcome word */}
                  <div
                    className="text-5xl font-bold mt-1"
                    style={{
                      fontFamily: "'Caveat', cursive",
                      color: outcomeColor,
                      textShadow: "1px 2px 8px rgba(0,0,0,0.09)",
                      animation: "inkPop 0.35s ease-out 0.2s both",
                    }}
                  >
                    {outcomeWord}
                  </div>

                  {/* Watercolor result bar */}
                  <div
                    className="w-full h-1 rounded-full mt-0"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${outcomeColor}55, transparent)`,
                      transition: "background 0.5s",
                    }}
                  />
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
            const accepting = phase === "accepting";
            const isLastPressed = lastTouchMove === move;
            
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
                  if (p === "accepting" || p === "countdown") handlePlayerMoveRef.current(move);
                  else if (p === "idle") beginCountdownRef.current();
                }}
                onClick={() => {
                  const p = phaseRef.current;
                  if (p === "accepting" || p === "countdown") handlePlayerMoveRef.current(move);
                  else if (p === "idle") beginCountdownRef.current();
                }}
                className={`
                  relative pointer-events-auto flex flex-col items-center justify-center
                  w-20 h-20 sm:w-24 sm:h-24 transition-all duration-300
                  ${isLastPressed ? 'scale-90' : 'scale-100'}
                  ${accepting ? 'animate-pulse-subtle' : ''}
                `}
                style={{
                  background: accepting ? "rgba(255, 252, 248, 0.92)" : "rgba(255, 252, 248, 0.45)",
                  border: "1px solid rgba(100, 80, 60, 0.2)",
                  borderRadius: radii,
                  boxShadow: accepting 
                    ? "0 8px 25px rgba(0,0,0,0.12), inset 0 0 15px rgba(100,80,60,0.08)"
                    : "0 4px 10px rgba(0,0,0,0.06)",
                  backdropFilter: "blur(6px)",
                  opacity: (phase === "reveal" || phase === "locked") ? 0 : 1,
                  visibility: (phase === "reveal" || phase === "locked") ? "hidden" : "visible",
                  transition: "opacity 0.4s, transform 0.2s, background 0.3s, visibility 0.4s, border-radius 0.5s",
                }}
              >
                {/* Ink splash effect on press */}
                {isLastPressed && (
                  <div className="absolute inset-0 animate-ping opacity-30" style={{ background: "#8a7a6a", borderRadius: radii }} />
                )}
                
                <span
                  className="text-4xl sm:text-5xl"
                  style={{
                    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                    transform: accepting ? "scale(1.15)" : "scale(1)",
                    transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                  }}
                >
                  {MOVE_EMOJI[move]}
                </span>
                <span
                  className="text-xs mt-1 font-bold uppercase tracking-widest"
                  style={{
                    fontFamily: "'Caveat', cursive",
                    color: accepting ? "#3a2a18" : "#8a7a6a",
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
                    stroke={accepting ? "#5a4a3a" : "rgba(100,80,60,0.25)"}
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                    opacity={accepting ? 0.5 : 0.3}
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
        className="relative z-10 mt-5 text-xs italic hidden md:block text-center"
        style={{ color: "#a09080", zIndex: 10 }}
      >
        keyboard:{" "}
        {(["rock","paper","scissors"] as Move[]).map((m, i) => (
          <span key={m}>
            <kbd
              className="font-mono px-1 rounded mx-0.5"
              style={{ background: "rgba(180,165,145,0.3)", border: "1px solid rgba(100,80,60,0.18)", borderBottomWidth: 2 }}
            >
              {i+1}
            </kbd>{" "}{MOVE_LABEL[m]}
            {i < 2 ? " · " : ""}
          </span>
        ))}
        &nbsp;|&nbsp;numpad works too
      </div>

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
