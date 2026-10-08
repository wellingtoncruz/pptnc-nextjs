import { sair } from "@/app/admin/actions";
import type { Filtro, LinhaPainel, Painel } from "@/lib/admin/painel";
import { card, ErroInline, mono, Rotulo, Selo } from "./ui";

/** Painel do anfitrião (32.9): componente de servidor, só leitura. */
const COR_STATUS: Record<LinhaPainel["status"], string> = {
  confirmado: "var(--accent)",
  pendente: "var(--muted)",
  recusou: "var(--error)",
};

function Contador({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={mono(11, { color: "var(--muted)", letterSpacing: ".14em" })}>{rotulo}</span>
      <span style={{ fontSize: 32, lineHeight: "36px", fontWeight: 700, color: destaque ? "var(--accent)" : "var(--text)" }}>{valor}</span>
    </div>
  );
}

const COLUNAS = ["Nome", "Empresa", "Código", "Tipo", "Status", "Acompanhante", "Email", "Celular", "Respondido em"];

export function PainelAdmin({ painel, filtro, comProblema }: { painel: Painel; filtro: Filtro; comProblema: number }) {
  const c = painel.contadores;
  const opcao = (valor: Filtro, texto: string) => (
    <a
      href={valor === "todos" ? "/admin" : "/admin?filtro=confirmados"}
      aria-current={filtro === valor ? "page" : undefined}
      className="seg"
      data-ativo={filtro === valor}
    >
      {texto}
    </a>
  );
  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 16px 64px", display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <Selo texto="Painel do anfitrião · 5 anos" />
        <form action={sair}>
          <button type="submit" className="link-tertiary">Sair</button>
        </form>
      </header>

      <section aria-label="Contadores" className="admin-cards">
        <Contador rotulo="Total de convites" valor={c.total} />
        <Contador rotulo="Confirmados" valor={c.confirmados} destaque />
        <Contador rotulo="Pendentes" valor={c.pendentes} />
        <Contador rotulo="Recusados" valor={c.recusados} />
        <Contador rotulo="Pessoas esperadas" valor={c.pessoas} destaque />
        <Contador rotulo="Lista de espera" valor={c.espera} />
      </section>

      {comProblema > 0 && (
        <ErroInline>{comProblema} {comProblema === 1 ? "documento com problema" : "documentos com problema"}, veja o export.</ErroInline>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <Rotulo>Convites</Rotulo>
          <nav aria-label="Filtro" className="seg-wrap">
            {opcao("todos", "Todos")}
            {opcao("confirmados", "Apenas confirmados")}
          </nav>
        </div>
        <div className="admin-tabela-wrap">
          <table className="admin-tabela">
            <thead>
              <tr>{COLUNAS.map((t) => <th key={t} scope="col">{t}</th>)}</tr>
            </thead>
            <tbody>
              {painel.linhas.map((l) => (
                <tr key={l.codigo}>
                  <td className="quebra" style={{ fontWeight: 600, color: l.nome.startsWith("(") ? "var(--muted)" : undefined }}>{l.nome}</td>
                  <td>{l.empresa}</td>
                  <td style={{ fontFamily: "var(--font-mono), monospace" }}>{l.codigo}</td>
                  <td>{l.tipo}</td>
                  <td><span style={{ color: COR_STATUS[l.status], fontWeight: 600 }}>{l.statusTexto}</span></td>
                  <td className="quebra">{l.acompanhante}</td>
                  <td>{l.email}</td>
                  <td>{l.celular}</td>
                  <td>{l.respondidoEm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...mono(11, { color: "var(--muted)", letterSpacing: ".14em" }), margin: 0 }}>
          {painel.linhas.length} {painel.linhas.length === 1 ? "convite exibido" : "convites exibidos"}
        </p>
      </section>
    </main>
  );
}
