import type { CSSProperties, ReactNode } from "react";

export const MONO = "var(--font-mono), monospace";
export const SANS = "var(--font-grotesk), sans-serif";
export const BALLOON = "M100 10 C 160 10 190 60 190 118 C 190 186 136 236 104 246 L 96 246 C 64 236 10 186 10 118 C 10 60 40 10 100 10 Z";
export const LOGO = "/assets/logo_square_192.png";

export const mono = (size = 12, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: MONO, fontSize: size, letterSpacing: ".2em", textTransform: "uppercase", ...extra,
});

/** Rótulo de seção: traço laranja + mono em caixa alta (— A NOITE). */
export function Rotulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...mono(12, { color: "var(--accent)" }), display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 24, height: 2, background: "var(--accent)" }} />
      {children}
    </div>
  );
}

export function Selo({ texto, size = 36 }: { texto?: string; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="PPT Não Compila" style={{ width: size, height: size, borderRadius: 8, display: "block" }} />
      {texto && <span style={{ ...mono(12, { color: "var(--text-2)" }), lineHeight: "16px" }}>{texto}</span>}
    </div>
  );
}

export function BalaoSvg({ style, fill = "var(--accent)", stroke = 3, brilho = false, gradiente }: {
  style: CSSProperties; fill?: string; stroke?: number; brilho?: boolean; gradiente?: string;
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 420" style={style}>
      {gradiente && (
        <defs>
          <radialGradient id={gradiente} cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#56565E" />
            <stop offset="100%" stopColor="#0C0C10" />
          </radialGradient>
        </defs>
      )}
      <path d="M100 256 C 80 300 124 340 96 420" fill="none" stroke={gradiente ? "#0C0C10" : fill} strokeWidth={stroke} />
      <path d={BALLOON} fill={gradiente ? `url(#${gradiente})` : fill} />
      <path d="M91 258 L100 245 L109 258 Z" fill={gradiente ? "#0C0C10" : fill} />
      {brilho && <ellipse cx="62" cy="72" rx="13" ry="30" transform="rotate(-24 62 72)" fill="#ffffff" opacity="0.28" />}
    </svg>
  );
}

/** 29/10 no estilo do flyer. */
export function Data({ size, style }: { size: number | string; style?: CSSProperties }) {
  return (
    <div style={{ fontWeight: 500, fontSize: size, lineHeight: 0.86, letterSpacing: "-0.05em", display: "flex", alignItems: "baseline", ...style }}>
      <span>29</span>
      <span style={{ fontSize: ".5em", fontWeight: 300, letterSpacing: 0, margin: "0 .12em", transform: "translateY(-.28em)" }}>/</span>
      <span>10</span>
    </div>
  );
}

export function Spinner({ cor = "#0B0809", fundo = "rgba(11,8,9,.25)", size = 20 }: { cor?: string; fundo?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: "50%", border: `2.5px solid ${fundo}`, borderTopColor: cor, animation: "spin .7s linear infinite" }}
    />
  );
}

/** Erro inline no tom do "Código não encontrado" (layout, tela 9). */
export function ErroInline({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--error)", fontSize: 15, lineHeight: "22px", ...style }}>
      <span style={{ flex: "none", width: 20, height: 20, marginTop: 1, borderRadius: "50%", border: "1.5px solid var(--error)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>!</span>
      <span>{children}</span>
    </div>
  );
}

export const h2 = (extra: CSSProperties = {}): CSSProperties => ({
  margin: "14px 0 0", fontSize: "var(--h2Size)", lineHeight: "var(--h2LH)", fontWeight: 700, letterSpacing: "-0.02em", textWrap: "balance", ...extra,
});

export const card: CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16 };
