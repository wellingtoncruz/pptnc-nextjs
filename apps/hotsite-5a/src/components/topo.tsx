"use client";

import type { RefObject } from "react";
import type { ConviteAberto } from "@/lib/convite";
import type { Textos } from "@/lib/textos";
import { EVENTO } from "@/lib/content";
import { BalaoSvg, Data, ErroInline, mono, SANS, Selo, Spinner } from "./ui";

const TITULO = {
  margin: "var(--nameMargin)", fontSize: "var(--nameSize)", lineHeight: "var(--nameLH)",
  fontWeight: 700, letterSpacing: "-0.025em", textWrap: "balance" as const,
};
const FRASE = { margin: "12px 0 0", fontSize: 17, lineHeight: "26px", color: "var(--text-2)", maxWidth: 420, textWrap: "pretty" as const };

/** Painel laranja do computador (quadro do flyer). */
function PainelFlyer() {
  return (
    <div aria-hidden="true" className="only-wide" style={{ flex: "0 0 440px", minHeight: 560, position: "relative", overflow: "hidden", borderRadius: 24, background: "url('/assets/orange.webp') right center / cover no-repeat, #F26A21" }}>
      <span style={{ position: "absolute", left: 32, bottom: 32, writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: "var(--font-mono), monospace", fontSize: 14, letterSpacing: ".3em", color: "#0C0C10" }}>2021 — 2026</span>
      <span style={{ position: "absolute", right: -22, bottom: -110, fontWeight: 600, fontSize: 560, lineHeight: 1, letterSpacing: "-0.06em", color: "#F3F2EE" }}>5</span>
      <BalaoSvg gradiente="hsBalloon" brilho stroke={2} style={{ position: "absolute", left: 56, top: 40, width: 170, height: 357, overflow: "visible" }} />
    </div>
  );
}

export interface TopoConviteProps {
  view: ConviteAberto;
  textos: Textos;
  loading: boolean;
  heroRef: RefObject<HTMLButtonElement | null>;
  nomeRef: RefObject<HTMLInputElement | null>;
  nomeCota: string;
  setNomeCota: (v: string) => void;
  erro: string | null;
  onConfirmar: () => void;
  onNaoPoderei: () => void;
}

/** Tela 1/2: convite aberto. Na cota, sem nome e com o campo "Seu nome" (D19/D21). */
export function TopoConvite({ view, textos, loading, heroRef, nomeRef, nomeCota, setNomeCota, erro, onConfirmar, onNaoPoderei }: TopoConviteProps) {
  const pedeNome = view.cota && !view.nome;
  return (
    <section style={{ position: "relative", padding: "var(--heroPad)" }}>
      <div className="only-narrow" aria-hidden="true">
        <div style={{ position: "absolute", right: -44, top: 64, fontWeight: 600, fontSize: 380, lineHeight: 1, letterSpacing: "-0.06em", color: "rgba(242,106,33,.09)", pointerEvents: "none" }}>5</div>
        <BalaoSvg style={{ position: "absolute", right: 136, top: 56, width: 80, height: 168, opacity: 0.2, pointerEvents: "none" }} />
      </div>
      <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 56, alignItems: "stretch" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Selo texto={textos.rotulo} />
          <h1 style={{ ...TITULO, maxWidth: 620 }}>{textos.titulo ?? view.nome}</h1>
          <p style={FRASE}>{textos.frase}</p>
          <Data size="var(--dateSize)" style={{ margin: "var(--dateMargin)", marginLeft: -4, color: "var(--accent)" }} />
          <div style={{ ...mono(12, { color: "var(--text-2)" }), marginTop: 18, lineHeight: "20px", display: "flex", flexDirection: "column" }}>
            <span>{EVENTO.diaSemana} · a partir das {EVENTO.horario}</span>
            <span>{EVENTO.endereco}</span>
            <span>{EVENTO.bairro} · {EVENTO.uf}</span>
          </div>
          {pedeNome && (
            <div style={{ marginTop: 28, maxWidth: "var(--btnMax)", display: "flex", flexDirection: "column", gap: 10 }}>
              <label htmlFor="seu-nome" style={mono(12, { color: "var(--muted)" })}>Seu nome</label>
              <input
                id="seu-nome"
                ref={nomeRef}
                className="field"
                value={nomeCota}
                onChange={(e) => setNomeCota(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nomeCota.trim()) onConfirmar(); }}
                autoComplete="name"
                maxLength={80}
                placeholder="Nome completo"
                aria-invalid={!!erro}
                style={{ height: 52, fontFamily: SANS, fontSize: 17, padding: "0 16px" }}
              />
            </div>
          )}
          <button
            ref={heroRef}
            className="btn-primary"
            onClick={onConfirmar}
            aria-busy={loading}
            disabled={pedeNome && !nomeCota.trim()}
            style={{ marginTop: pedeNome ? 14 : 28, maxWidth: "var(--btnMax)" }}
          >
            {loading ? <Spinner /> : <><span>Confirmar presença</span><span>→</span></>}
          </button>
          {erro && <ErroInline style={{ marginTop: 12, maxWidth: "var(--btnMax)" }}>{erro}</ErroInline>}
          {/* D15: sem a linha de prazo */}
          <div style={{ marginTop: 12, maxWidth: "var(--btnMax)", display: "flex", justifyContent: "flex-end" }}>
            <button className="link-tertiary" onClick={onNaoPoderei} style={{ marginRight: -4 }}>Não poderei ir</button>
          </div>
        </div>
        <PainelFlyer />
      </div>
    </section>
  );
}

/** Ingresso (D1: sem código — "Seu nome está na lista"). */
export function Ingresso({ nome, acompanhante, animacao, estatico }: { nome: string; acompanhante: string | null; animacao: string; estatico?: boolean }) {
  return (
    <div style={{ animation: animacao, opacity: estatico ? 0.5 : 1, transform: `scale(${estatico ? 0.975 : 1})`, transformOrigin: "50% 40%" }}>
      <div role="img" aria-label={`Ingresso simbólico de ${nome}`} style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
        <div style={{ position: "relative", overflow: "hidden", padding: "22px 22px 26px", background: "url('/assets/orange.webp') right center / cover no-repeat, #F26A21", color: "#0B0809" }}>
          <span aria-hidden="true" style={{ position: "absolute", right: -16, bottom: -70, fontWeight: 600, fontSize: 280, lineHeight: 1, letterSpacing: "-0.06em", color: "#F3F2EE", opacity: 0.9 }}>5</span>
          <BalaoSvg fill="#0C0C10" stroke={4} style={{ position: "absolute", right: 118, top: 46, width: 46, height: 97 }} />
          <div style={{ ...mono(11, { letterSpacing: ".2em", fontWeight: 500 }), position: "relative", display: "flex", justifyContent: "space-between" }}>
            <span>PPT Não Compila · 5 anos</span><span>Ingresso</span>
          </div>
          <div style={{ position: "relative", marginTop: 30, maxWidth: "64%", fontSize: 22, lineHeight: "26px", fontWeight: 700, letterSpacing: "-0.01em", textWrap: "balance", overflowWrap: "anywhere" }}>{nome}</div>
          {acompanhante && (
            <div style={{ ...mono(11, { letterSpacing: ".16em", fontWeight: 500 }), position: "relative", marginTop: 6, maxWidth: "64%", lineHeight: "16px", overflowWrap: "anywhere" }}>+1 · {acompanhante}</div>
          )}
          <Data size={64} style={{ position: "relative", marginTop: 26, marginLeft: -2 }} />
          <div style={{ ...mono(11, { letterSpacing: ".18em", fontWeight: 500 }), position: "relative", marginTop: 12, lineHeight: "16px" }}>
            {EVENTO.diaSemanaCurto} · {EVENTO.horario} · {EVENTO.bairroCurto}
          </div>
        </div>
        <div style={{ position: "relative", height: 0 }}>
          <span style={{ position: "absolute", left: -12, top: -12, width: 24, height: 24, borderRadius: "50%", background: "var(--bg)" }} />
          <span style={{ position: "absolute", right: -12, top: -12, width: 24, height: 24, borderRadius: "50%", background: "var(--bg)" }} />
          <span style={{ position: "absolute", left: 20, right: 20, top: -1, borderTop: "2px dashed var(--bg)" }} />
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderTop: 0, borderRadius: "0 0 20px 20px", padding: "18px 22px 22px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={mono(11, { letterSpacing: ".12em", color: "var(--muted)", whiteSpace: "nowrap" })}>Entrada</span>
            <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, color: "var(--text)" }}>Seu nome está na lista</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo_square_192.png" alt="" style={{ flex: "none", width: 40, height: 40, borderRadius: 8, display: "block" }} />
        </div>
      </div>
    </div>
  );
}

export interface TopoConfirmadoProps {
  view: ConviteAberto;
  textos: Textos;
  ingressoAnim: string;
  mostrarPergunta: boolean;
  perguntaAnim: string;
  acompAberto: boolean;
  setAcompAberto: (v: boolean) => void;
  acompDraft: string;
  setAcompDraft: (v: string) => void;
  editandoAcomp: boolean;
  salvandoAcomp: boolean;
  erroAcomp: string | null;
  onIncluir: () => void;
  onAlterar: () => void;
  onAgenda: () => void;
  onNaoPoderei: () => void;
}

/** Telas 3–5: confirmado, com o ingresso e o acompanhante. */
export function TopoConfirmado(p: TopoConfirmadoProps) {
  const { view, textos } = p;
  const temAcomp = !!view.acompanhanteNome && !p.editandoAcomp;
  return (
    <section style={{ position: "relative", padding: "var(--heroPad)" }}>
      <div style={{ position: "absolute", top: -180, right: -160, width: 560, height: 560, background: "radial-gradient(circle,rgba(242,106,33,.18),rgba(242,106,33,0) 64%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "var(--confGap)", alignItems: "center" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Selo texto={textos.rotulo} />
          <h1 style={TITULO}>Presença <span style={{ color: "var(--accent)" }}>confirmada!</span></h1>
          <p style={FRASE}>{textos.confirmado}</p>
        </div>
        <div style={{ flex: "1 1 340px", maxWidth: 440, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <Ingresso nome={view.nome ?? ""} acompanhante={temAcomp ? view.acompanhanteNome : null} animacao={p.ingressoAnim} />

          {p.mostrarPergunta && (
            <div style={{ animation: p.perguntaAnim, display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                className="check-row"
                onClick={() => p.setAcompAberto(!p.acompAberto)}
                role="checkbox"
                aria-checked={p.acompAberto}
                style={{ alignSelf: "flex-start", appearance: "none", background: "none", border: 0, minHeight: 44, padding: "0 4px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", color: "var(--text-2)", fontFamily: SANS, fontSize: 15, borderRadius: 6 }}
              >
                <span style={{ flex: "none", width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${p.acompAberto ? "#F26A21" : "rgba(255,255,255,.32)"}`, background: p.acompAberto ? "#F26A21" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B0809", fontSize: 13, fontWeight: 700, lineHeight: 1, transition: "background .15s, border-color .15s" }}>
                  {p.acompAberto ? "✓" : ""}
                </span>
                <span>Quero levar um acompanhante</span>
              </button>
              {p.acompAberto && (
                <div style={{ animation: "fadeUp .25s ease both", display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    className="field"
                    value={p.acompDraft}
                    onChange={(e) => p.setAcompDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") p.onIncluir(); }}
                    placeholder="Nome completo do acompanhante"
                    aria-label="Nome do acompanhante"
                    aria-invalid={!!p.erroAcomp}
                    maxLength={80}
                    style={{ height: 52, fontFamily: SANS, fontSize: 17, padding: "0 16px" }}
                  />
                  <button className="btn-secondary" onClick={p.onIncluir} disabled={p.salvandoAcomp || !p.acompDraft.trim()} style={{ height: 48 }}>
                    {p.salvandoAcomp ? <Spinner cor="#F26A21" fundo="rgba(242,106,33,.25)" /> : "Incluir na lista"}
                  </button>
                  {p.erroAcomp && <ErroInline>{p.erroAcomp}</ErroInline>}
                </div>
              )}
            </div>
          )}

          {temAcomp && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 4px 0", fontSize: 15, lineHeight: "22px", color: "var(--text-2)" }}>
              <span style={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}>Acompanhante: <span style={{ color: "var(--text)" }}>{view.acompanhanteNome}</span></span>
              <button className="link-tertiary" onClick={p.onAlterar} style={{ textDecoration: "underline" }}>alterar</button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={p.onAgenda} style={{ flex: "1 1 200px" }}>Adicionar à agenda</button>
            <button className="link-tertiary" onClick={p.onNaoPoderei} style={{ padding: "0 6px" }}>Não poderei ir</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Tela 7: recusou (D15: "é só voltar aqui e confirmar"). */
export function TopoRecusou({ textos, onMudei, loading, erro }: { textos: Textos; onMudei: () => void; loading: boolean; erro: string | null }) {
  return (
    <section style={{ position: "relative", padding: "var(--heroPad)" }}>
      <div style={{ margin: "0 auto", display: "flex", flexDirection: "column", maxWidth: "var(--recMax)" }}>
        <Selo texto={textos.rotulo} />
        <h1 style={TITULO}>{textos.recusouTitulo}</h1>
        <p style={{ ...FRASE, maxWidth: 440 }}>{textos.recusouFrase}</p>
        <div style={{ ...mono(12, { color: "var(--muted)" }), marginTop: 28, padding: "18px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", lineHeight: "20px", display: "flex", flexDirection: "column" }}>
          <span>{EVENTO.dataCurta} · {EVENTO.diaSemana} · {EVENTO.horario}</span>
          <span>{EVENTO.endereco} · {EVENTO.bairro} · {EVENTO.uf}</span>
        </div>
        <button className="btn-secondary" onClick={onMudei} aria-busy={loading} style={{ marginTop: 24, width: "100%", maxWidth: "var(--btnMax)" }}>
          {loading ? <Spinner cor="#F26A21" fundo="rgba(242,106,33,.25)" /> : <>Mudei de ideia, quero ir <span>→</span></>}
        </button>
        {erro && <ErroInline style={{ marginTop: 12 }}>{erro}</ErroInline>}
      </div>
    </section>
  );
}
