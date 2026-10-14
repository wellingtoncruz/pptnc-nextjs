"use client";

import { useEffect, useRef, useState } from "react";
import { excluirConvite, marcarConvidado, permitirAcompanhante } from "@/app/admin/actions";
import { filtrarPorNome, type LinhaPainel } from "@/lib/admin/painel";
import { mono } from "./ui";

const COR_STATUS: Record<LinhaPainel["status"], string> = {
  confirmado: "var(--accent)",
  pendente: "var(--muted)",
  recusou: "var(--error)",
  excluido: "var(--muted)",
};

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Fallback para contexto sem Clipboard API.
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const IconeCopiar = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);
const IconeOk = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** Lista do painel (32.10–32.12): duas linhas por convidado, busca por nome no navegador, copiar link, marcar convidado, liberar +1 e excluir. */
export function ListaConvites({ linhas }: { linhas: LinhaPainel[] }) {
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const visiveis = filtrarPorNome(linhas, busca);

  const aoCopiar = async (l: LinhaPainel) => {
    if (!(await copiar(l.url))) return;
    setCopiado(l.codigo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label htmlFor="busca-nome" className="sr-only">Buscar pelo nome</label>
      <input
        id="busca-nome" type="search" className="field admin-busca" placeholder="Buscar pelo nome"
        autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)}
      />
      {visiveis.length === 0 ? (
        <p style={{ margin: 0, padding: "24px 18px", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 16 }}>
          Nenhum convidado encontrado.
        </p>
      ) : (
        <ul className="admin-lista">
          {visiveis.map((l) => (
            <li key={l.codigo} className="admin-item" data-convidado={l.convidado} data-status={l.status}>
              <div className="admin-l1">
                <span className="admin-nome" style={l.nome.startsWith("(") ? { color: "var(--muted)" } : undefined}>{l.nome}</span>
                {l.status === "recusou" ? (
                  <span className="admin-selo-recusou">{l.statusTexto}</span>
                ) : (
                  <span style={{ color: COR_STATUS[l.status], fontSize: 13, fontWeight: 600 }}>{l.statusTexto}</span>
                )}
              </div>
              {l.status !== "excluido" && (
              <div className="admin-acao">
                <button type="button" className="admin-btn admin-copiar" data-ok={copiado === l.codigo} onClick={() => aoCopiar(l)}
                  aria-label={copiado === l.codigo ? `Link de ${l.nome} copiado` : `Copiar link de ${l.nome}`}>
                  {copiado === l.codigo ? <IconeOk /> : <IconeCopiar />}
                  <span className="admin-copiar-txt">{copiado === l.codigo ? "Link copiado" : "Copiar link"}</span>
                </button>
                {l.convidado && <span className="admin-quando" style={mono(11, { letterSpacing: ".04em", textTransform: "none" })}>{l.convidadoEm}</span>}
                {l.marcaTravada ? (
                  <button type="button" className="admin-btn admin-marca" data-on="true" disabled
                    title="Quem respondeu ao convite fica marcado como convidado">
                    ✓ Convidado
                  </button>
                ) : (
                <form action={marcarConvidado.bind(null, l.codigo, !l.convidado)}>
                  <button type="submit" className="admin-btn admin-marca" data-on={l.convidado}
                    aria-label={l.convidado ? `Desfazer convidado de ${l.nome}` : `Marcar ${l.nome} como convidado`}>
                    {l.convidado ? "✓ Convidado" : "Marcar convidado"}
                  </button>
                </form>
                )}
                {removendo === l.codigo ? (
                  <span className="admin-confirma" role="group" aria-label={`Remover +1 de ${l.nome}`}>
                    <span className="admin-confirma-txt">Remover +1 de {l.acompanhanteNome}?</span>
                    <form action={permitirAcompanhante.bind(null, l.codigo, false)} onSubmit={() => setRemovendo(null)}>
                      <button type="submit" className="admin-btn admin-perigo">Confirmar</button>
                    </form>
                    <button type="button" className="admin-btn" onClick={() => setRemovendo(null)}>Cancelar</button>
                  </span>
                ) : l.acompanhanteLiberado && l.acompanhanteNome ? (
                  <button type="button" className="admin-btn admin-marca" data-on="true" onClick={() => setRemovendo(l.codigo)}
                    aria-label={`Bloquear acompanhante de ${l.nome}`}>
                    ✓ +1 liberado
                  </button>
                ) : (
                  <form action={permitirAcompanhante.bind(null, l.codigo, !l.acompanhanteLiberado)}>
                    <button type="submit" className="admin-btn admin-marca" data-on={l.acompanhanteLiberado}
                      aria-label={l.acompanhanteLiberado ? `Bloquear acompanhante de ${l.nome}` : `Liberar acompanhante de ${l.nome}`}>
                      {l.acompanhanteLiberado ? "✓ +1 liberado" : "Liberar +1"}
                    </button>
                  </form>
                )}
                {excluindo === l.codigo ? (
                  <span className="admin-confirma" role="group" aria-label={`Excluir convite de ${l.nome}`}>
                    <span className="admin-confirma-txt">Excluir convite de {l.nome}?</span>
                    <form action={excluirConvite.bind(null, l.codigo)} onSubmit={() => setExcluindo(null)}>
                      <button type="submit" className="admin-btn admin-perigo">Confirmar</button>
                    </form>
                    <button type="button" className="admin-btn" onClick={() => setExcluindo(null)}>Cancelar</button>
                  </span>
                ) : (
                  <button type="button" className="admin-btn admin-perigo" onClick={() => setExcluindo(l.codigo)}
                    aria-label={`Excluir convite de ${l.nome}`}>
                    Excluir
                  </button>
                )}
              </div>
              )}
              <div className="admin-l2">
                <ul>
                  {l.detalhes.map((d, i) => (
                    <li key={i} style={d.mono ? { fontFamily: "var(--font-mono), monospace", color: "var(--text-2)" } : undefined}>{d.texto}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p style={{ ...mono(11, { color: "var(--muted)", letterSpacing: ".14em" }), margin: 0 }} aria-live="polite">
        {visiveis.length} {visiveis.length === 1 ? "convite exibido" : "convites exibidos"}
      </p>
    </div>
  );
}
