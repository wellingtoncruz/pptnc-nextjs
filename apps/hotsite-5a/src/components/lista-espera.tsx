"use client";

import { useState } from "react";
import { entrarNaListaDeEspera } from "@/app/actions";
import type { CampoEspera, ResultadoEspera } from "@/lib/espera/espera";
import { MENSAGEM_ESPERA } from "@/lib/mensagens";
import { ErroInline, mono, SANS, Spinner } from "./ui";

const CAMPOS: { campo: CampoEspera; rotulo: string; type: string; autoComplete: string; inputMode?: "email" | "tel"; maxLength: number; placeholder: string }[] = [
  { campo: "nome", rotulo: "Nome", type: "text", autoComplete: "name", maxLength: 80, placeholder: "Nome completo" },
  { campo: "empresa", rotulo: "Empresa", type: "text", autoComplete: "organization", maxLength: 80, placeholder: "Onde você trabalha" },
  { campo: "email", rotulo: "Email", type: "email", autoComplete: "email", inputMode: "email", maxLength: 254, placeholder: "voce@email.com" },
  { campo: "celular", rotulo: "Celular", type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 20, placeholder: "(11) 98765-4321" },
];

const VAZIO: Record<CampoEspera, string> = { nome: "", empresa: "", email: "", celular: "" };

/** Lista de espera na tela restrita (32.7, D26–D28): mesmo campo, rótulo mono e botão do layout. */
export function ListaEspera() {
  const [valores, setValores] = useState(VAZIO);
  const [site, setSite] = useState(""); // honeypot
  const [erros, setErros] = useState<Partial<Record<CampoEspera, string>>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<string | null>(null);

  const completo = Object.values(valores).every((v) => v.trim() !== "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completo || enviando) return;
    setEnviando(true);
    setErroGeral(null);
    let r: ResultadoEspera;
    try {
      r = await entrarNaListaDeEspera({ ...valores, site });
    } catch {
      r = { ok: false, erro: "FALHA_TEMPORARIA" };
    }
    setEnviando(false);
    if (r.ok) return setPronto(r.primeiroNome);
    if ("erros" in r) {
      setErros(Object.fromEntries(Object.entries(r.erros).map(([c, codigo]) => [c, MENSAGEM_ESPERA[codigo]])));
      const primeiro = CAMPOS.find((c) => r.erros[c.campo]);
      if (primeiro) document.getElementById(`espera-${primeiro.campo}`)?.focus();
    } else {
      setErroGeral(MENSAGEM_ESPERA[r.erro]);
    }
  };

  return (
    <div style={{ marginTop: 48 }}>
      <div aria-hidden="true" style={{ ...mono(12, { color: "var(--muted)" }), display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />ou<span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <h2 style={{ margin: "36px 0 0", fontSize: 28, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.02em", textWrap: "balance" }}>Ainda não tem convite?</h2>
      {pronto !== null ? (
        <p role="status" style={{ margin: "14px 0 0", fontSize: 17, lineHeight: "26px", color: "var(--text)", textWrap: "pretty" }}>
          Pronto, {pronto}. Seu nome está na lista de espera.
        </p>
      ) : (
        <>
          <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: "26px", color: "var(--text-2)", textWrap: "pretty" }}>
            Deixe seus dados para entrar na lista de espera.
          </p>
          <form onSubmit={submit} noValidate style={{ margin: "28px 0 0", display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
            {CAMPOS.map((c) => {
              const id = `espera-${c.campo}`;
              const erro = erros[c.campo];
              return (
                <div key={c.campo} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label htmlFor={id} style={mono(12, { color: "var(--muted)" })}>{c.rotulo}</label>
                  <input
                    id={id}
                    className="field"
                    type={c.type}
                    inputMode={c.inputMode}
                    value={valores[c.campo]}
                    onChange={(e) => {
                      setValores((v) => ({ ...v, [c.campo]: e.target.value }));
                      setErros((er) => ({ ...er, [c.campo]: undefined }));
                    }}
                    autoComplete={c.autoComplete}
                    maxLength={c.maxLength}
                    placeholder={c.placeholder}
                    aria-invalid={!!erro}
                    aria-describedby={erro ? `${id}-erro` : undefined}
                    style={{ height: 52, fontFamily: SANS, fontSize: 17, padding: "0 16px" }}
                  />
                  {erro && <div id={`${id}-erro`}><ErroInline>{erro}</ErroInline></div>}
                </div>
              );
            })}
            {/* Honeypot: fora da tela, da leitura de tela e da navegação por teclado. */}
            <div aria-hidden="true" style={{ position: "absolute", left: -10000, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor="espera-site">Site</label>
              <input id="espera-site" name="site" type="text" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={!completo || enviando} aria-busy={enviando} style={{ marginTop: 4 }}>
              {enviando ? <Spinner /> : <>Entrar na lista de espera <span>→</span></>}
            </button>
            {erroGeral && <ErroInline>{erroGeral}</ErroInline>}
          </form>
        </>
      )}
    </div>
  );
}
