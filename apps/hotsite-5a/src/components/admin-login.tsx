"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "@/app/admin/actions";
import { ErroInline, mono, Selo, Spinner } from "./ui";

/** Tela de senha do painel (32.9), na própria /admin (A1). */
export function LoginAdmin() {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, { erro: null });
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <form action={acao} style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <Selo texto="Painel do anfitrião" />
        <label htmlFor="senha-admin" style={{ ...mono(12, { color: "var(--text-2)" }), marginTop: 16 }}>Senha</label>
        <input
          id="senha-admin" name="senha" type="password" className="field" autoComplete="current-password" required autoFocus
          aria-invalid={estado.erro ? true : undefined} aria-describedby={estado.erro ? "senha-admin-erro" : undefined}
        />
        {estado.erro && <div id="senha-admin-erro"><ErroInline>{estado.erro}</ErroInline></div>}
        <button className="btn-primary" type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? <Spinner /> : "Entrar"}
        </button>
      </form>
    </main>
  );
}

