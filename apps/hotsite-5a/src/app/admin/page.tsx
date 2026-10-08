import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PainelAdmin } from "@/components/admin";
import { LoginAdmin } from "@/components/admin-login";
import { lerDadosPainel } from "@/lib/admin/dados";
import { lerFiltro, montarPainel } from "@/lib/admin/painel";
import { COOKIE_ADMIN, senhaAdmin, tokenValido } from "@/lib/admin/sessao";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel · 5 anos de PPT Não Compila", robots: { index: false, follow: false } };

/**
 * Painel do anfitrião (32.9, D29/D31). Só /admin (A1): sem sessão, a própria rota mostra a senha.
 * Sem o secret, a rota não existe (A3). A sessão é verificada ANTES de qualquer leitura.
 */
export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const senha = senhaAdmin();
  if (!senha) notFound();
  const token = (await cookies()).get(COOKIE_ADMIN)?.value;
  if (!tokenValido(token, senha, new Date())) return <LoginAdmin />;

  const filtro = lerFiltro((await searchParams).filtro);
  const { docs, comProblema, espera } = await lerDadosPainel();
  const baseUrl = process.env.HOTSITE_BASE_URL || "https://5anos.pptnaocompila.com.br";
  return <PainelAdmin painel={montarPainel(docs, espera, filtro, baseUrl)} filtro={filtro} comProblema={comProblema} />;
}
