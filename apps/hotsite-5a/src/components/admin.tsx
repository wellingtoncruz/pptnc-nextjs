import { sair } from "@/app/admin/actions";
import type { Filtro, Painel } from "@/lib/admin/painel";
import { ListaConvites } from "./admin-lista";
import { card, ErroInline, mono, Rotulo, Selo } from "./ui";

/** Painel do anfitrião (32.9/32.10/32.13): contadores e filtro no servidor; lista e busca no cliente. */
function Contador({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={mono(11, { color: "var(--muted)", letterSpacing: ".14em" })}>{rotulo}</span>
      <span style={{ fontSize: 32, lineHeight: "36px", fontWeight: 700, color: destaque ? "var(--accent)" : "var(--text)" }}>{valor}</span>
    </div>
  );
}

export function PainelAdmin({ painel, filtro, comProblema }: { painel: Painel; filtro: Filtro; comProblema: number }) {
  const c = painel.contadores;
  const opcao = (valor: Filtro, texto: string) => (
    <a
      href={valor === "todos" ? "/admin" : `/admin?filtro=${valor}`}
      aria-current={filtro === valor ? "page" : undefined}
      className="seg"
      data-ativo={filtro === valor}
    >
      {texto}
    </a>
  );
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px 64px", display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <Selo texto="Painel do anfitrião · 5 anos" />
        <form action={sair}>
          <button type="submit" className="link-tertiary">Sair</button>
        </form>
      </header>

      <section aria-label="Contadores" className="admin-cards">
        <Contador rotulo="Criados" valor={c.criados} />
        <Contador rotulo="Convidados" valor={c.convidados} />
        <Contador rotulo="Confirmados" valor={c.confirmados} destaque />
        <Contador rotulo="Não confirmados" valor={c.naoConfirmados} />
        <Contador rotulo="Recusados" valor={c.recusados} />
        <Contador rotulo="Excluídos" valor={c.excluidos} />
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
            {opcao("convidados-nao-confirmados", "Convidados não confirmados")}
            {opcao("nao-convidados", "Não convidados")}
          </nav>
        </div>
        <ListaConvites linhas={painel.linhas} />
      </section>
    </main>
  );
}
