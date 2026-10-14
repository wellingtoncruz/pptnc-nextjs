"use client";

import { useEffect, useState } from "react";
import { BALLOON } from "./ui";

// [x%, tamanho, velocidade, atraso] — idênticos ao protótipo.
const BS = [[4, 44, 1.0, 0], [16, 32, 1.18, 0.12], [28, 54, 0.92, 0.04], [42, 38, 1.22, 0.2], [55, 60, 0.95, 0], [68, 36, 1.12, 0.1], [80, 50, 1.02, 0.06], [10, 28, 1.3, 0.26], [62, 28, 1.28, 0.3], [90, 36, 0.88, 0.14], [36, 30, 1.1, 0.34]];
const BC = ["#F26A21", "#D9591F", "#E8A06B", "#F26A21", "#F3F2EE"];

/** Balões da confirmação (~1,2 s). Só renderiza quando não há redução de movimento. */
export function Baloes() {
  const [k, setK] = useState(1);
  useEffect(() => setK(window.innerWidth >= 900 ? 1.4 : 1), []);
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none", overflow: "hidden" }}>
      {BS.map(([x, s, sp, d], i) => {
        const c = BC[i % BC.length];
        const size = s * k;
        return (
          <div key={i} style={{ position: "absolute", left: `${x}%`, bottom: -size * 2.2, width: size, height: size * 2.1, animation: `bRise ${(1.25 / sp).toFixed(2)}s cubic-bezier(.35,.1,.45,1) ${d}s both` }}>
            <svg viewBox="0 0 200 420" style={{ width: "100%", height: "100%", overflow: "visible", display: "block" }}>
              <path d="M100 256 C 80 300 124 340 96 420" fill="none" stroke={c} strokeWidth={3} />
              <path d={BALLOON} fill={c} />
              <path d="M91 258 L100 245 L109 258 Z" fill={c} />
              <ellipse cx={62} cy={72} rx={13} ry={30} transform="rotate(-24 62 72)" fill="#fff" opacity={0.3} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
