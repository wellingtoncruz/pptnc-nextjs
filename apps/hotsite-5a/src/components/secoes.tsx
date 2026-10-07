"use client";

import { useState, type RefObject } from "react";
import type { ConviteAberto } from "@/lib/convite";
import type { Textos } from "@/lib/textos";
import { APOIADORES, CARGOS, EVENTO, NOITE, NUMEROS, PROGRAMACAO } from "@/lib/content";
import { mesAno, resumoMaisEpisodios, visualizacoes } from "@/lib/format";
import { card, ErroInline, h2, mono, MONO, Rotulo, SANS, Spinner } from "./ui";

const SECAO = { display: "flex", flexDirection: "column" as const };

/** "Seu episódio" — só nominal; mostra o PRIMEIRO episódio (D7, D14). Player só ao tocar. */
export function SecaoEpisodio({ view }: { view: ConviteAberto }) {
  const [tocando, setTocando] = useState(false);
  const ep = view.episodio;
  if (!ep) return null;
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>Seu episódio</Rotulo>
      <h2 style={h2()}>Aqui você fez história junto com a gente</h2>
      <div style={{ marginTop: 24, position: "relative", overflow: "hidden", borderRadius: 16, border: "1px solid rgba(242,106,33,.4)", background: "linear-gradient(165deg,rgba(242,106,33,.16),rgba(242,106,33,.03))", padding: 12, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
        <div style={{ position: "absolute", top: -140, right: -120, width: 380, height: 380, background: "radial-gradient(circle,rgba(242,106,33,.24),rgba(242,106,33,0) 66%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", flex: "1 1 300px", minWidth: 0, aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
          {tocando ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ep.videoId}?autoplay=1&rel=0`}
              title={ep.titulo}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <button className="play-btn" onClick={() => setTocando(true)} aria-label="Assistir ao episódio" style={{ appearance: "none", border: 0, padding: 0, margin: 0, cursor: "pointer", position: "absolute", inset: 0, width: "100%", height: "100%", background: "radial-gradient(120% 90% at 85% 20%,rgba(242,106,33,.35),rgba(12,12,16,0) 60%),linear-gradient(160deg,#1E1236,#0C0C10 70%)", display: "block", textAlign: "left" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/mic_cutout.webp" alt="" style={{ position: "absolute", right: "-6%", bottom: "-18%", height: "118%", transform: "rotate(-8deg)", opacity: 0.85, pointerEvents: "none" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo_square_192.png" alt="" style={{ position: "absolute", left: 14, top: 14, width: 32, height: 32, borderRadius: 6 }} />
              <span style={{ position: "absolute", left: 14, bottom: 14, maxWidth: "62%", fontFamily: SANS, fontSize: 16, lineHeight: "20px", fontWeight: 700, color: "var(--text)", textWrap: "balance" }}>{ep.titulo}</span>
              <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 60, height: 60, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#0B0809" /></svg>
              </span>
            </button>
          )}
        </div>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0, padding: "4px 8px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={mono(12, { color: "var(--text-2)" })}>Seu primeiro episódio · {mesAno(ep.publicadoEm)}</span>
          <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, textWrap: "pretty" }}>{ep.titulo}</span>
          {ep.views != null && <span style={mono(12, { color: "var(--muted)" })}>{visualizacoes(ep.views)}</span>}
          {view.maisEpisodios && (
            <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.12)", fontSize: 15, lineHeight: "22px", color: "var(--text-2)", textWrap: "pretty" }}>
              {resumoMaisEpisodios(view.maisEpisodios.quantidade, view.maisEpisodios.views)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function SecaoNumeros() {
  const d = NUMEROS.destaque;
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>5 anos em números</Rotulo>
      <h2 style={h2()}>O que construímos juntos desde 2021</h2>
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "var(--numCols)", gap: 12 }}>
        <div style={{ gridColumn: "var(--impactSpan)", background: "linear-gradient(160deg,rgba(242,106,33,.16),rgba(242,106,33,.03))", border: "1px solid rgba(242,106,33,.42)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, minHeight: 120 }}>
          <div style={{ fontSize: 40, lineHeight: "44px", fontWeight: 700, letterSpacing: "-0.04em", color: "var(--accent)" }}>{d.v}<span style={{ fontSize: 24, fontWeight: 600 }}>{d.s}</span></div>
          <div style={mono(12, { color: "var(--text)" })}>{d.l}</div>
        </div>
        {NUMEROS.cards.map((n) => (
          <div key={n.l} style={{ ...card, padding: 20, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, minHeight: 120 }}>
            <div style={{ fontSize: 40, lineHeight: "44px", fontWeight: 700, letterSpacing: "-0.04em", whiteSpace: "nowrap" }}>{n.v}<span style={{ fontSize: 22, fontWeight: 600, color: "var(--muted)" }}>{n.s}</span></div>
            <div style={mono(12, { color: "var(--muted)", lineHeight: "16px" })}>{n.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SecaoNoite() {
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>A noite</Rotulo>
      <h2 style={h2()}>Cinco anos de conversas, agora na mesma sala</h2>
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "var(--nightCols)", gap: 12 }}>
        {NOITE.map((c) => (
          <div key={c.n} style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".2em", color: "var(--accent)" }}>{c.n}</span>
            <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, letterSpacing: "-0.01em" }}>{c.t}</span>
            <span style={{ fontSize: 15, lineHeight: "22px", color: "var(--text-2)", textWrap: "pretty" }}>{c.d}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SecaoProgramacao() {
  const definida = PROGRAMACAO.every((p) => p.horario);
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>Programação</Rotulo>
      <h2 style={h2({ textWrap: undefined })}>Como vai ser a noite</h2>
      <div style={{ marginTop: 24, position: "relative", display: "flex", flexDirection: "column", maxWidth: 640 }}>
        <div style={{ position: "absolute", left: 7, top: 14, bottom: 14, width: 2, background: "rgba(255,255,255,.12)" }} />
        {PROGRAMACAO.map((p, i) => {
          const ok = !!p.horario;
          return (
            <div key={i} style={{ position: "relative", display: "grid", gridTemplateColumns: "16px 72px minmax(0,1fr)", gap: 16, alignItems: "center", padding: "14px 0" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: ok ? "#F26A21" : "#56565E", border: "3px solid var(--bg)", boxShadow: ok ? "0 0 0 4px rgba(242,106,33,.18)" : "none" }} />
              <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: ".1em", color: ok ? "#F26A21" : "#7A7A84" }}>{p.horario ?? "--:--"}</span>
              <span style={ok
                ? { fontSize: 17, lineHeight: "24px", fontWeight: 600, color: "var(--text)", fontFamily: SANS }
                : { fontSize: 17, lineHeight: "24px", fontWeight: 500, color: "var(--muted)", fontFamily: MONO, letterSpacing: ".2em", textTransform: "uppercase" }}>
                {p.atividade}
              </span>
            </div>
          );
        })}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: "22px", color: "var(--muted)" }}>
        {definida ? "Horários sujeitos a pequenos ajustes." : "Os demais horários serão publicados aqui."}
      </p>
    </section>
  );
}

export function SecaoNetworking() {
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>Networking</Rotulo>
      <h2 style={h2()}>Quem você vai encontrar</h2>
      <p style={{ margin: "12px 0 0", fontSize: 17, lineHeight: "26px", color: "var(--text-2)", maxWidth: 560, textWrap: "pretty" }}>
        Lideranças de tecnologia que passaram pelos mais de 240 episódios do podcast.
      </p>
      <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CARGOS.map((r) => (
          <span key={r} style={{ border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.04)", borderRadius: 999, padding: "8px 14px", fontSize: 14, lineHeight: "18px", color: "var(--text)" }}>{r}</span>
        ))}
      </div>
    </section>
  );
}

export function SecaoApoiadores() {
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>Apoiadores</Rotulo>
      <h2 style={h2()}>Quem torna a noite possível</h2>
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "var(--logoCols)", gap: 12 }}>
        {APOIADORES.map((l) => (
          <div key={l.nome} style={{ background: "#FFFFFF", borderRadius: 16, height: 96, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.img} alt={l.nome} style={{ maxHeight: l.h, maxWidth: l.mw, objectFit: "contain", display: "block" }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SecaoNota({ textos }: { textos: Textos }) {
  return (
    <section data-reveal="1" style={SECAO}>
      <Rotulo>Uma nota</Rotulo>
      <div style={{ ...card, marginTop: 20, padding: 24, display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <p style={{ flex: "1 1 300px", margin: 0, fontSize: "var(--noteSize)", lineHeight: "var(--noteLH)", fontWeight: 500, letterSpacing: "-0.01em", textWrap: "pretty" }}>{textos.nota}</p>
        <div style={{ flex: "0 1 260px", display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/wellington.webp" alt="Foto de Wellington Cruz" style={{ flex: "none", width: 72, height: 88, borderRadius: 12, objectFit: "cover", objectPosition: "50% 12%", display: "block" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 18, lineHeight: "22px", fontWeight: 700 }}>Wellington Cruz</span>
            <span style={mono(11, { letterSpacing: ".18em", color: "var(--muted)", lineHeight: "16px" })}>Host · PPT Não Compila</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export interface BlocoFinalProps {
  estado: ConviteAberto["estado"];
  textos: Textos;
  footRef: RefObject<HTMLButtonElement | null>;
  loading: boolean;
  erro: string | null;
  onConfirmar: () => void;
  onNaoPoderei: () => void;
  onVerIngresso: () => void;
}

export function BlocoFinal({ estado, textos, footRef, loading, erro, onConfirmar, onNaoPoderei, onVerIngresso }: BlocoFinalProps) {
  return (
    <section data-reveal="1" style={{ position: "relative", overflow: "hidden", borderRadius: 24, border: "1px solid rgba(242,106,33,.36)", background: "linear-gradient(165deg,rgba(242,106,33,.14),rgba(242,106,33,.02))", padding: "var(--finalPad)", display: "flex", flexDirection: "column" }}>
      <div aria-hidden="true" style={{ position: "absolute", right: -30, bottom: -90, fontWeight: 600, fontSize: 300, lineHeight: 1, letterSpacing: "-0.06em", color: "rgba(242,106,33,.10)", pointerEvents: "none" }}>5</div>
      {estado === "convite" && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <span style={mono(12, { color: "var(--text-2)" })}>{EVENTO.dataCurta} · {EVENTO.diaSemana} · {EVENTO.horario} · {EVENTO.bairro}</span>
          <h2 style={h2({ margin: "12px 0 0", textWrap: undefined })}>{textos.finalPergunta}</h2>
          <button ref={footRef} className="btn-primary" onClick={onConfirmar} aria-busy={loading} style={{ marginTop: 24, maxWidth: "var(--btnMax)" }}>
            {loading ? <Spinner /> : <>Confirmar presença <span>→</span></>}
          </button>
          {erro && <ErroInline style={{ marginTop: 12 }}>{erro}</ErroInline>}
          <div style={{ marginTop: 12, maxWidth: "var(--btnMax)", display: "flex", justifyContent: "flex-end" }}>
            <button className="link-tertiary" onClick={onNaoPoderei} style={{ marginRight: -4 }}>Não poderei ir</button>
          </div>
        </div>
      )}
      {estado === "confirmado" && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={mono(12, { color: "var(--text-2)" })}>Presença confirmada</span>
          <h2 style={h2({ margin: 0, textWrap: undefined })}>{textos.finalConfirmado}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, lineHeight: "26px", color: "var(--text-2)" }}>Seu nome está na lista.</span>
            <button className="link-tertiary" onClick={onVerIngresso}>Ver ingresso ↑</button>
          </div>
        </div>
      )}
      {estado === "recusou" && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <span style={mono(12, { color: "var(--text-2)" })}>Ainda dá tempo</span>
          <h2 style={h2({ margin: "12px 0 0", textWrap: undefined })}>A agenda mudou?</h2>
          <button className="btn-secondary" onClick={onConfirmar} aria-busy={loading} style={{ marginTop: 24, width: "100%", maxWidth: "var(--btnMax)" }}>
            {loading ? <Spinner cor="#F26A21" fundo="rgba(242,106,33,.25)" /> : "Mudei de ideia, quero ir →"}
          </button>
        </div>
      )}
    </section>
  );
}

export function Rodape() {
  return (
    <footer style={{ maxWidth: 1200, margin: "var(--footMargin)", padding: "24px var(--padX) var(--footPadB)" }}>
      <div style={{ paddingTop: 24, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo_square_192.png" alt="PPT Não Compila" style={{ width: 32, height: 32, borderRadius: 7, display: "block" }} />
        <span style={mono(12, { flex: 1, color: "var(--muted)" })}>PPT Não Compila</span>
        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".2em", color: "var(--muted)" }}>2021 — 2026</span>
      </div>
    </footer>
  );
}
