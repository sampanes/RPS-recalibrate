/**
 * useGameState.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All game logic extracted from App.tsx: phase state machine, scheduling,
 * scoring, AI strategy, haptics, keyboard input.
 *
 * App.tsx is responsible only for rendering and passing in UI-derived values
 * (arenaHovered, isDebug).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { CONFIG } from "../config";
import {
  playCountdownTick,
  playShootSound,
  playResultWithDelay,
} from "../utils/sounds";
import {
  computeComputerMove,
  determineOutcome,
  type Move,
} from "../utils/computerAI";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Phase =
  | "idle"
  | "countdown"
  | "accepting"
  | "locked"
  | "reveal";

export interface DebugLog {
  botStrategy: "random" | "adaptive";
  shootTime: number | null;
  inputTime: number | null;
  latency: number | null;
  playerDelay: number | null;
  botDelay: number | null;
}

export interface GameState {
  phase: Phase;
  countdownIdx: number;
  displayStep: string;
  visualAccepting: boolean;
  missedShot: boolean;
  adaptiveActive: boolean;
  playerMove: Move | null;
  computerMove: Move | null;
  outcome: "win" | "lose" | "tie" | null;
  revealVisible: boolean;
  computerRevealVisible: boolean;
  playerRevealVisible: boolean;
  lastTouchMove: Move | null;
  scores: { wins: number; ties: number; losses: number };
  totalGames: number;
  beginCountdown: () => void;
  handlePlayerMove: (move: Move) => void;
  debugLog: DebugLog;
  playerDelayOverride: number | null;
  botDelayOverride: number | null;
  strategyOverride: "random" | "adaptive" | null;
  setPlayerDelayOverride: (v: number | null) => void;
  setBotDelayOverride: (v: number | null) => void;
  setStrategyOverride: (v: "random" | "adaptive" | null) => void;
}

// ─── Internal scheduler ───────────────────────────────────────────────────────
function useScheduler() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAllTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timers.current.push(id);
    return id;
  }, []);

  return { schedule, clearAllTimers };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useGameState({
  arenaHovered,
  isDebug,
}: {
  arenaHovered: boolean;
  isDebug: boolean;
}): GameState {
  const { schedule, clearAllTimers } = useScheduler();

  // ── State ──────────────────────────────────────────────────────────────────
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
  const [revealVisible, setRevealVisible]         = useState(false);
  const [adaptiveActive, setAdaptiveActive]       = useState(false);
  const [missedShot, setMissedShot]               = useState(false);
  const [displayStep, setDisplayStep]             = useState<string>("");
  const [lastTouchMove, setLastTouchMove]         = useState<Move | null>(null);
  const [visualAccepting, setVisualAccepting]     = useState(false);
  const [computerRevealVisible, setComputerRevealVisible] = useState(false);
  const [playerRevealVisible, setPlayerRevealVisible]     = useState(false);

  // ── Debug state ────────────────────────────────────────────────────────────
  const [playerDelayOverride, setPlayerDelayOverride] = useState<number | null>(null);
  const [botDelayOverride, setBotDelayOverride]       = useState<number | null>(null);
  const [strategyOverride, setStrategyOverride]       = useState<"random" | "adaptive" | null>(null);
  const [debugLog, setDebugLog] = useState<DebugLog>({
    botStrategy: "random",
    shootTime: null,
    inputTime: null,
    latency: null,
    playerDelay: null,
    botDelay: null,
  });

  // ── Refs (mirror state/props for use inside timeout closures) ──────────────
  const phaseRef         = useRef<Phase>("idle");
  const arenaHoveredRef  = useRef(false);
  const totalGamesRef    = useRef(0);
  const playerHistoryRef = useRef<Record<Move, number>>({ rock: 0, paper: 0, scissors: 0 });
  const computerMoveRef  = useRef<Move | null>(null);
  const earlyMoveRef     = useRef<Move | null>(null);

  phaseRef.current         = phase;
  arenaHoveredRef.current  = arenaHovered;
  totalGamesRef.current    = totalGames;
  playerHistoryRef.current = playerHistory;

  // ── Stable function refs (break circular dependency) ──────────────────────
  const handlePlayerMoveRef = useRef<(m: Move) => void>(() => {});
  const beginCountdownRef   = useRef<() => void>(() => {});

  // ── Haptic ─────────────────────────────────────────────────────────────────
  const haptic = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  // ── queueAutoRestart ───────────────────────────────────────────────────────
  const queueAutoRestart = useCallback(() => {
    if (arenaHoveredRef.current) {
      schedule(() => {
        if (arenaHoveredRef.current && phaseRef.current === "idle") {
          beginCountdownRef.current();
        }
      }, CONFIG.AUTO_RESTART_DELAY_MS);
    }
  }, [schedule]);

  // ── handlePlayerMove ───────────────────────────────────────────────────────
  const handlePlayerMove = useCallback((move: Move) => {
    const p = phaseRef.current;
    if (p !== "accepting") return;

    setPhase("locked");
    setVisualAccepting(false);
    setLastTouchMove(move);

    const isImbalanceReveal = computerMoveRef.current !== null;
    const compMove = computerMoveRef.current || computeComputerMove(
      totalGamesRef.current,
      playerHistoryRef.current,
      move,
      strategyOverride
    );
    const result   = determineOutcome(move, compMove);
    const strategy = strategyOverride || (totalGamesRef.current >= CONFIG.ADAPTIVE_THRESHOLD ? "adaptive" : "random");

    const isLearned = CONFIG.EXPERIMENT_MODE && (
      strategyOverride === "adaptive" ||
      (strategyOverride !== "random" && totalGamesRef.current >= CONFIG.ADAPTIVE_THRESHOLD)
    );

    const playerDelay = playerDelayOverride !== null
      ? playerDelayOverride
      : ((CONFIG.EXPERIMENT_MODE && isLearned)
        ? CONFIG.ILLUSION_PLAYER_MOVE_DELAY_MS
        : CONFIG.CALIB_DELAY_MS);

    let botDelay = 0;
    if (!isImbalanceReveal) {
      if (botDelayOverride !== null) {
        botDelay = botDelayOverride;
      } else if (CONFIG.EXPERIMENT_MODE && isLearned) {
        botDelay = CONFIG.ILLUSION_DELAY_MS;
      } else {
        botDelay = Math.round(100 + Math.random() * 80);
      }
    }

    if (isDebug) {
      const inputTime = Date.now();
      const shootTime = debugLog.shootTime;
      if (!isImbalanceReveal) {
        setDebugLog(prev => ({
          ...prev,
          botStrategy: strategy,
          inputTime,
          latency: shootTime ? inputTime - shootTime : null,
          playerDelay,
          botDelay,
        }));
      } else {
        setDebugLog(prev => ({
          ...prev,
          botStrategy: strategy,
          inputTime,
          latency: shootTime ? inputTime - shootTime : null,
          playerDelay,
        }));
      }
    }

    setComputerMove(compMove);

    if (!isImbalanceReveal && botDelay > 0) {
      schedule(() => setComputerRevealVisible(true), botDelay);
    } else {
      setComputerRevealVisible(true);
    }

    schedule(() => {
      setPlayerMove(move);
      setPlayerRevealVisible(true);
      schedule(() => setLastTouchMove(null), 220);
      setRevealVisible(true);
      setPhase("reveal");
      setOutcome(result);

      setScores(prev => ({
        wins:   result === "win"  ? prev.wins + 1   : prev.wins,
        ties:   result === "tie"  ? prev.ties + 1   : prev.ties,
        losses: result === "lose" ? prev.losses + 1 : prev.losses,
      }));

      const nextTotal = totalGamesRef.current + 1;
      setTotalGames(nextTotal);
      setPlayerHistory(prev => ({ ...prev, [move]: prev[move] + 1 }));
      if (nextTotal >= CONFIG.ADAPTIVE_THRESHOLD) setAdaptiveActive(true);

      playResultWithDelay(result, 0);

      if (result === "win") haptic([25, 45, 35]);
      else if (result === "lose") haptic(40);
      else haptic([15, 15]);

      schedule(() => {
        setRevealVisible(false);
        setPhase("idle");
        queueAutoRestart();
      }, CONFIG.REVEAL_DURATION_MS);
    }, playerDelay);

  }, [schedule, queueAutoRestart, haptic, isDebug, debugLog.shootTime, playerDelayOverride, botDelayOverride, strategyOverride]);

  handlePlayerMoveRef.current = handlePlayerMove;

  // ── beginCountdown ─────────────────────────────────────────────────────────
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
    const do_imbalance_bool = Math.random() < CONFIG.IMBALANCE_PROBABILITY;
    const span = CONFIG.IMBALANCE_EARLIEST_MS + CONFIG.IMBALANCE_LATEST_MS;
    const bias = 1 - Math.pow(Math.random(), 2);
    const imbalanceAdvanceMs = (bias * span) - CONFIG.IMBALANCE_EARLIEST_MS;

    if (do_imbalance_bool && isDebug) {
      setDebugLog(prev => ({ ...prev, botDelay: Math.round(imbalanceAdvanceMs) }));
    }

    playCountdownTick();
    haptic(8);

    schedule(() => {
      setCountdownIdx(1);
      setDisplayStep("2");
      playCountdownTick();
      haptic(8);
    }, step);

    schedule(() => {
      setCountdownIdx(2);
      setDisplayStep("3");
      playCountdownTick();
      haptic(10);
    }, step * 2);

    schedule(() => {
      if (do_imbalance_bool) {
        const compMove = computeComputerMove(totalGamesRef.current, playerHistoryRef.current);
        computerMoveRef.current = compMove;
        setComputerMove(compMove);
        setComputerRevealVisible(true);
        playCountdownTick();
        if (phaseRef.current === "countdown") {
          setPhase("accepting");
          setVisualAccepting(true);
        }
      }
    }, step * 3 - imbalanceAdvanceMs);

    schedule(() => {
      if (phaseRef.current === "countdown") {
        setPhase("accepting");
        setVisualAccepting(true);
      }
    }, step * 3 - earlyMs);

    schedule(() => {
      setCountdownIdx(3);
      setDisplayStep("SHOOT!");
      playShootSound();
      haptic(25);

      if (isDebug) {
        setDebugLog(prev => ({ ...prev, shootTime: Date.now(), inputTime: null, latency: null }));
      }

      if (phaseRef.current !== "locked") {
        setPhase("accepting");
        setVisualAccepting(true);
      }

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

  beginCountdownRef.current = beginCountdown;

  // ── Keyboard listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Digit1" || e.code === "Numpad1") handlePlayerMoveRef.current("rock");
      if (e.code === "Digit2" || e.code === "Numpad2") handlePlayerMoveRef.current("paper");
      if (e.code === "Digit3" || e.code === "Numpad3") handlePlayerMoveRef.current("scissors");
      if ((e.code === "Space" || e.code === "Enter") && phaseRef.current === "idle") {
        beginCountdownRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    phase,
    countdownIdx,
    displayStep,
    visualAccepting,
    missedShot,
    adaptiveActive,
    playerMove,
    computerMove,
    outcome,
    revealVisible,
    computerRevealVisible,
    playerRevealVisible,
    lastTouchMove,
    scores,
    totalGames,
    beginCountdown,
    handlePlayerMove,
    debugLog,
    playerDelayOverride,
    botDelayOverride,
    strategyOverride,
    setPlayerDelayOverride,
    setBotDelayOverride,
    setStrategyOverride,
  };
}
