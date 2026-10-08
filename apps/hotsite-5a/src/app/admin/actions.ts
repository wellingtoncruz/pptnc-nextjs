"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_ADMIN, criarToken, senhaAdmin, senhaConfere, SESSAO_MS } from "@/lib/admin/sessao";

export interface EstadoLogin {
  erro: string | null;
}

const ERRO = "Senha incorreta.";

/** Login do painel (32.9). Senha errada espera ~1 s e loga sem o valor. */
export async function entrar(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const senha = senhaAdmin();
  if (!senha || !senhaConfere(form.get("senha"), senha)) {
    await new Promise((r) => setTimeout(r, 1000));
    console.warn("[ADMIN] senha errada");
    return { erro: ERRO };
  }
  (await cookies()).set(COOKIE_ADMIN, criarToken(senha, new Date()), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/admin",
    maxAge: SESSAO_MS / 1000,
  });
  redirect("/admin");
}

export async function sair(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_ADMIN, path: "/admin" });
  redirect("/admin");
}
