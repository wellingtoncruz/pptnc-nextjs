"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizarCodigo } from "@/lib/guests/codigo";
import type { ConviteRestrito } from "@/lib/convite";
import { BalaoSvg, ErroInline, mono, Selo, Spinner } from "./ui";
import { ListaEspera } from "./lista-espera";
import { EVENTO } from "@/lib/content";

/** Telas 8 e 9: acesso restrito (campo vazio / código inválido). */
export function Restrito({ view }: { view: ConviteRestrito }) {
  const router = useRouter();
  const [code, setCode] = useState(view.codigoDigitado);
  const [erro, setErro] = useState(view.erro !== null);
  const [shaking, setShaking] = useState(view.erro !== null);
  const [enviando, setEnviando] = useState(false);

  // Nova resposta do servidor (outro código inválido) → tremor de novo.
  useEffect(() => {
    setEnviando(false);
    if (view.erro) {
      setErro(true);
      setShaking(true);
    }
  }, [view]);

  useEffect(() => {
    if (!shaking) return;
    const t = setTimeout(() => setShaking(false), 400);
    return () => clearTimeout(t);
  }, [shaking]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizarCodigo(code);
    if (!c) return;
    setEnviando(true);
    router.push(`/c/${encodeURIComponent(c)}`);
  };

  return (
    <section style={{ position: "relative", minHeight: "100vh", padding: "20px 20px 40px", overflow: "hidden" }}>
      <div aria-hidden="true" style={{ position: "absolute", right: -48, top: 90, fontWeight: 600, fontSize: 400, lineHeight: 1, letterSpacing: "-0.06em", color: "rgba(242,106,33,.08)", pointerEvents: "none" }}>5</div>
      <BalaoSvg style={{ position: "absolute", right: 120, top: 70, width: 84, height: 176, opacity: 0.22, pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: 440, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <Selo texto="PPT Não Compila · 5 anos" />
        <div style={{ ...mono(12, { color: "var(--accent)" }), marginTop: 96, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 24, height: 2, background: "var(--accent)" }} />
          Acesso restrito
        </div>
        <h1 style={{ margin: "16px 0 0", fontSize: 36, lineHeight: "40px", fontWeight: 700, letterSpacing: "-0.02em", textWrap: "balance" }}>Este convite é pessoal</h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: "26px", color: "var(--text-2)", textWrap: "pretty" }}>
          Digite o código que veio na mensagem do convite para abrir a sua página.
        </p>
        <form onSubmit={submit} style={{ margin: "36px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <label htmlFor="codigo" style={mono(12, { color: "var(--muted)" })}>Código do convite</label>
          <input
            id="codigo"
            className="field"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/\s/g, "")); setErro(false); }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="EX.: NOME123"
            aria-invalid={erro}
            aria-describedby={erro ? "codigo-erro" : undefined}
            maxLength={20}
            style={{ fontFamily: "var(--font-mono), monospace", fontSize: 20, letterSpacing: ".15em", textTransform: "uppercase", animation: shaking ? "shake .36s ease" : "none" }}
          />
          {erro && (
            <div id="codigo-erro">
              <ErroInline>Código não encontrado. Confira a mensagem do convite e tente de novo.</ErroInline>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={!code || enviando} aria-busy={enviando} style={{ marginTop: 14 }}>
            {enviando ? <Spinner /> : <>Abrir convite <span>→</span></>}
          </button>
        </form>
        <ListaEspera />
        <div style={{ ...mono(12, { color: "var(--muted)" }), marginTop: 72, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          {EVENTO.dataCurta} · {EVENTO.diaSemana} · {EVENTO.cidade}
        </div>
      </div>
    </section>
  );
}
