"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_ADMIN, criarToken, senhaAdmin, senhaConfere, SESSAO_MS, tokenValido } from "@/lib/admin/sessao";
import { codigoValido, normalizarCodigo } from "@/lib/guests/codigo";
import { excluir as regraExcluir, marcarConvidado as regraMarcar, permitirAcompanhante as regraPermitir } from "@/lib/guests/rules";
import { firestoreGuestStore } from "@/lib/guests/store";

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

/** Server Action é endpoint público: a sessão é conferida aqui também, não só na página. */
async function sessaoValida(): Promise<boolean> {
  const senha = senhaAdmin();
  if (!senha) return false;
  return tokenValido((await cookies()).get(COOKIE_ADMIN)?.value, senha, new Date());
}

/** Marcação "convidado" (32.10). */
export async function marcarConvidado(codigoBruto: string, marcar: boolean): Promise<void> {
  if (!(await sessaoValida())) redirect("/admin");
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigoValido(codigo)) return;
  try {
    await firestoreGuestStore.mutate(codigo, (d) => regraMarcar(d, new Date(), marcar === true));
  } catch (e) {
    console.error("[ADMIN] falha ao marcar convidado", codigo, e);
  }
  revalidatePath("/admin");
}

/** Permissão de acompanhante (32.11). */
export async function permitirAcompanhante(codigoBruto: string, permitir: boolean): Promise<void> {
  if (!(await sessaoValida())) redirect("/admin");
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigoValido(codigo)) return;
  try {
    await firestoreGuestStore.mutate(codigo, (d) => regraPermitir(d, new Date(), permitir === true));
  } catch (e) {
    console.error("[ADMIN] falha ao mudar acompanhante", codigo, e);
  }
  revalidatePath("/admin");
}

/** Exclusão lógica do convite (32.12): sem volta pelo painel; o documento continua no banco. */
export async function excluirConvite(codigoBruto: string): Promise<void> {
  if (!(await sessaoValida())) redirect("/admin");
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigoValido(codigo)) return;
  try {
    await firestoreGuestStore.mutate(codigo, (d) => regraExcluir(d, new Date()));
  } catch (e) {
    console.error("[ADMIN] falha ao excluir convite", codigo, e);
  }
  revalidatePath("/admin");
}
