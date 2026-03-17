/**
 * WatercolorCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A living, breathing watercolor background.
 *
 * Architecture
 * ────────────
 * • A static SVG layer holds persistent wash pools and paper texture — things
 *   that never move, acting like the dried base coat of a painting.
 *
 * • A dynamic layer renders an array of "strokes" managed in a React ref
 *   (to avoid re-rendering the whole tree).  Each stroke is an SVG element
 *   animated via CSS custom properties injected through a <style> tag.
 *
 * • A setInterval fires every BG_STROKE_INTERVAL_MS to birth a new stroke.
 *   Each stroke goes through:
 *     1. "painting"  — clipPath / opacity animates from 0 → 1
 *     2. "lingering" — sits at full opacity
 *     3. "fading"    — opacity animates to 0
 *   After the full lifecycle the stroke is removed from state.
 *
 * • Strokes are randomised in shape (ellipse / organic path), colour
 *   (muted watercolour palette), position, rotation, and scale so each one
 *   looks handmade.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { CONFIG } from "../config";

// ── Watercolour palette ──────────────────────────────────────────────────────
// Desaturated, warm/cool mix — ink wash, indigo, burnt sienna, sage, slate
const PALETTE = [
  "#8faabf", // steel blue wash
  "#b0a0c8", // soft violet
  "#9abfaa", // sage green
  "#c4a882", // warm sienna
  "#a0b8c8", // pale cerulean
  "#c8a0a0", // dusty rose
  "#8a9aaa", // blue-grey ink
  "#b8c0a0", // yellow-green wash
  "#aab0c0", // cool lavender
  "#c0b090", // raw umber
];

// ── Stroke shapes ────────────────────────────────────────────────────────────
// Each is a function returning an SVG path or shape string
// relative to a local 0,0 origin (will be placed via transform).
type ShapeKind = "ellipse" | "blob" | "stroke" | "splash";

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Build an organic blob path around origin 0,0 using cubic beziers */
function blobPath(rx: number, ry: number, wobble: number): string {
  // 8 control points around an ellipse, each randomly perturbed
  const pts: [number, number][] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    const r = randomBetween(1 - wobble, 1 + wobble);
    pts.push([Math.cos(angle) * rx * r, Math.sin(angle) * ry * r]);
  }
  // Close with cubic beziers
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const cpx = (p1[0] + p2[0]) / 2;
    const cpy = (p1[1] + p2[1]) / 2;
    d += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

/** Build a brushstroke-like tapered ellipse path */
function strokePath(len: number, thickness: number): string {
  const half = len / 2;
  // Tapered — wide in middle, pointed at ends
  return `M ${-half} 0
    C ${-half * 0.6} ${-thickness} ${half * 0.6} ${-thickness} ${half} 0
    C ${half * 0.6}  ${thickness}  ${-half * 0.6}  ${thickness} ${-half} 0 Z`;
}

// ── Stroke data type ─────────────────────────────────────────────────────────
interface Stroke {
  id: number;
  x: number;        // % of viewport width
  y: number;        // % of viewport height
  color: string;
  opacity: number;  // max opacity for this stroke (varies per stroke)
  rotation: number; // deg
  scale: number;
  kind: ShapeKind;
  rx: number;       // half-width
  ry: number;       // half-height
  blurRadius: number;
  /** CSS animation class suffix (unique per stroke so each gets fresh animation) */
  animId: number;
  phase: "in" | "hold" | "out";
}

let _strokeIdCounter = 0;

function createStroke(): Stroke {
  const kind: ShapeKind = pickFrom(["ellipse", "blob", "stroke", "ellipse", "blob"]);
  const rx = randomBetween(60, 200);
  const ry = randomBetween(30, 100);
  return {
    id: _strokeIdCounter++,
    animId: _strokeIdCounter,
    x: randomBetween(5, 95),
    y: randomBetween(5, 95),
    color: pickFrom(PALETTE),
    opacity: randomBetween(0.06, 0.18),
    rotation: randomBetween(-35, 35),
    scale: randomBetween(0.7, 1.5),
    kind,
    rx,
    ry,
    blurRadius: randomBetween(8, 22),
    phase: "in" as const,
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export const WatercolorCanvas: React.FC = () => {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync for use inside setInterval closure
  strokesRef.current = strokes;

  const addStroke = useCallback(() => {
    const stroke: Stroke = createStroke();

    // Add to state — starts in "in" phase
    setStrokes(prev => {
      // Keep a max of BG_BLOB_COUNT * 2 entries at once
      const next = [...prev, stroke];
      return next.slice(-CONFIG.BG_BLOB_COUNT * 2);
    });

    // After paint-in + linger → transition to "out"
    const holdStart = CONFIG.BG_STROKE_PAINT_DURATION_MS + CONFIG.BG_STROKE_LINGER_MS;
    setTimeout(() => {
      setStrokes(prev =>
        prev.map(s => s.id === stroke.id ? { ...s, phase: "out" as const } : s)
      );
    }, holdStart);

    // After full lifecycle, remove
    const removeAt = holdStart + CONFIG.BG_STROKE_FADE_MS + 200;
    setTimeout(() => {
      setStrokes(prev => prev.filter(s => s.id !== stroke.id));
    }, removeAt);
  }, []);

  // Seed with initial strokes so the page isn't blank on load
  useEffect(() => {
    // Stagger 3 initial strokes so they don't all appear simultaneously
    for (let i = 0; i < 3; i++) {
      setTimeout(() => addStroke(), i * 900);
    }

    // Continuously add new strokes
    timerRef.current = setInterval(addStroke, CONFIG.BG_STROKE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [addStroke]);

  // Build per-stroke CSS animations injected into a <style> tag.
  // Each stroke gets its own uniquely-named keyframe so their timings are fully independent.
  // SVG groups do NOT support %-based translate, so we use absolute viewport units (vw/vh)
  // computed from the stroke's 0-100 percentage positions.
  const styleBlocks = strokes.map(s => {
    const paintMs = CONFIG.BG_STROKE_PAINT_DURATION_MS;
    const fadeMs  = CONFIG.BG_STROKE_FADE_MS;
    const inName  = `wc-in-${s.animId}`;
    const outName = `wc-out-${s.animId}`;
    // Position in viewport units so the SVG (100% wide/tall) maps correctly
    const tx = `${s.x}vw`;
    const ty = `${s.y}vh`;
    return `
      @keyframes ${inName} {
        0%   { opacity: 0;           transform: translate(${tx}, ${ty}) rotate(${s.rotation}deg) scale(${s.scale * 0.55}); }
        35%  { opacity: ${s.opacity * 0.6}; }
        100% { opacity: ${s.opacity}; transform: translate(${tx}, ${ty}) rotate(${s.rotation}deg) scale(${s.scale}); }
      }
      @keyframes ${outName} {
        0%   { opacity: ${s.opacity}; transform: translate(${tx}, ${ty}) rotate(${s.rotation}deg) scale(${s.scale}); }
        100% { opacity: 0;            transform: translate(${tx}, ${ty}) rotate(${s.rotation}deg) scale(${s.scale * 1.08}); }
      }
      .wc-stroke-${s.animId} {
        animation: ${s.phase === "out" ? outName : inName}
          ${s.phase === "out" ? fadeMs : paintMs}ms
          ${s.phase === "out" ? "ease-in" : "ease-out"}
          forwards;
      }
    `;
  }).join("\n");

  return (
    <>
      {/* Static base layer — dried wash pools */}
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 w-full h-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        style={{ zIndex: 0 }}
      >
        <defs>
          <filter id="bgBlur1"><feGaussianBlur stdDeviation="22" /></filter>
          <filter id="bgBlur2"><feGaussianBlur stdDeviation="38" /></filter>
          <filter id="bgBlur3"><feGaussianBlur stdDeviation="12" /></filter>
          {/* Paper grain texture */}
          <filter id="paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
            <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" result="blend"/>
            <feComposite in="blend" in2="SourceGraphic" operator="in"/>
          </filter>
        </defs>

        {/* Large dried wash pools — warm/cool opposition */}
        <ellipse cx="150" cy="130" rx="300" ry="190" fill="#b4cfe0" opacity="0.22" filter="url(#bgBlur2)" />
        <ellipse cx="1050" cy="650" rx="280" ry="180" fill="#c5b4d6" opacity="0.18" filter="url(#bgBlur2)" />
        <ellipse cx="580" cy="720" rx="340" ry="140" fill="#cce0c4" opacity="0.15" filter="url(#bgBlur2)" />
        <ellipse cx="1100" cy="120" rx="220" ry="150" fill="#e8d8bc" opacity="0.2" filter="url(#bgBlur2)" />
        <ellipse cx="80"  cy="700" rx="180" ry="130" fill="#b4c4e0" opacity="0.18" filter="url(#bgBlur2)" />
        <ellipse cx="620" cy="350" rx="500" ry="280" fill="#f0e8d8" opacity="0.12" filter="url(#bgBlur2)" />

        {/* Mid-tone ink blobs */}
        <circle cx="340"  cy="490" r="80"  fill="#7aafca" opacity="0.1"  filter="url(#bgBlur1)" />
        <circle cx="800"  cy="190" r="60"  fill="#c0a0b8" opacity="0.12" filter="url(#bgBlur1)" />
        <circle cx="480"  cy="660" r="100" fill="#a0c0a0" opacity="0.1"  filter="url(#bgBlur1)" />
        <circle cx="960"  cy="420" r="70"  fill="#c0b080" opacity="0.1"  filter="url(#bgBlur1)" />

        {/* Fine ink splatters — cluster A */}
        {[
          [420, 320, 7], [433, 309, 4], [412, 332, 3], [444, 328, 2],
          [762, 542, 5], [773, 553, 3], [758, 560, 2],
          [182, 400, 4], [190, 395, 2],
          [1002, 382, 6], [1012, 371, 3], [995, 390, 2],
          [600, 180, 3], [612, 174, 2],
          [290, 620, 4], [300, 628, 2],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="#4a5a6a" opacity={0.12 + (i % 4) * 0.02} filter="url(#bgBlur3)" />
        ))}

        {/* Dried brushstroke marks */}
        <ellipse cx="600" cy="95"  rx="230" ry="22" fill="#9ab0c0" opacity="0.13" filter="url(#bgBlur1)" transform="rotate(-6,600,95)" />
        <ellipse cx="290" cy="755" rx="190" ry="20" fill="#b0a0c8" opacity="0.14" filter="url(#bgBlur1)" transform="rotate(4,290,755)" />
        <ellipse cx="960" cy="460" rx="160" ry="18" fill="#a0c0b0" opacity="0.12" filter="url(#bgBlur1)" transform="rotate(-18,960,460)" />
        <ellipse cx="120" cy="350" rx="140" ry="16" fill="#c0a880" opacity="0.11" filter="url(#bgBlur1)" transform="rotate(22,120,350)" />
        <ellipse cx="1080" cy="300" rx="120" ry="15" fill="#8090a8" opacity="0.1"  filter="url(#bgBlur1)" transform="rotate(-10,1080,300)" />

        {/* Paper texture overlay — very subtle */}
        <rect x="0" y="0" width="1200" height="800" fill="#d8cfc4" opacity="0.06" filter="url(#paper)" />

        {/* Ultra-fine grain dots */}
        {Array.from({ length: 55 }).map((_, i) => (
          <circle
            key={i}
            cx={((i * 141.7 + 30) % 1200)}
            cy={((i * 93.1 + 60) % 800)}
            r={0.5 + (i % 3) * 0.4}
            fill="#6a5a4a"
            opacity={0.05 + (i % 6) * 0.008}
          />
        ))}
      </svg>

      {/* Dynamic animated strokes layer */}
      <style>{styleBlocks}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: 1 }}
      >
        <svg
          className="w-full h-full"
          style={{ position: "absolute", inset: 0 }}
          aria-hidden="true"
        >
          <defs>
            {strokes.map(s => (
              <filter key={s.id} id={`sf-${s.id}`}>
                <feGaussianBlur stdDeviation={s.blurRadius} />
              </filter>
            ))}
          </defs>

          {strokes.map(s => {
            // Each stroke is a <g> whose position + rotation + scale come entirely
            // from a CSS animation (see styleBlocks above).  The shape itself is
            // drawn around origin 0,0 so the CSS transform-origin lands at its centre.
            const shapeEl = s.kind === "stroke"
              ? <path d={strokePath(s.rx * 2, s.ry)} fill={s.color} filter={`url(#sf-${s.id})`} />
              : <path d={blobPath(s.rx, s.ry, 0.22)}  fill={s.color} filter={`url(#sf-${s.id})`} />;

            return (
              <g
                key={s.id}
                className={`wc-stroke-${s.animId}`}
                style={{ transformOrigin: "0px 0px" }}
              >
                {shapeEl}
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
};
