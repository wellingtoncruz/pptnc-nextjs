"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConviteAberto, ConviteView, ResultadoAcao } from "@/lib/convite";
import { textosPara } from "@/lib/textos";
import { EVENTO } from "@/lib/content";
import { MENSAGEM_ERRO } from "@/lib/mensagens";
import { confirmarPresenca, recusarPresenca, salvarAcompanhante } from "@/app/actions";
import { Restrito } from "./restrito";
import { TopoConfirmado, TopoConvite, TopoRecusou, type CampoContato } from "./topo";
import { formatarCelular } from "@/lib/contato";
import type { ErroConvite } from "@/lib/guests/rules";
import { BlocoFinal, Rodape, SecaoApoiadores, SecaoEpisodio, SecaoNetworking, SecaoNoite, SecaoNota, SecaoNumeros, SecaoProgramacao } from "./secoes";
import { Baloes } from "./baloes";
import { LOGO, mono, SANS, Spinner } from "./ui";

function reduzido(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollTopo() {
  window.scrollTo({ top: 0, behavior: reduzido() ? "auto" : "smooth" });
}

export function Hotsite({ inicial }: { inicial: ConviteView }) {
  if (inicial.estado === "restrito") {
    return (
      <main style={{ background: "var(--bg)", minHeight: "100vh", overflowX: "clip" }}>
        <Restrito view={inicial} />
      </main>
    );
  }
  return <ConviteAbertoPagina inicial={inicial} />;
}

type Onde = "topo" | "final" | "sheet" | "recusou";

/** Erro que pertence a um campo do topo (aparece inline sob ele). */
const CAMPO_DO_ERRO: Partial<Record<ErroConvite, CampoContato>> = {
  NOME_OBRIGATORIO: "nome",
  NOME_INVALIDO: "nome",
  EMAIL_OBRIGATORIO: "email",
  EMAIL_INVALIDO: "email",
  CELULAR_INVALIDO: "celular",
};

function ConviteAbertoPagina({ inicial }: { inicial: ConviteAberto }) {
  const [view, setView] = useState(inicial);
  // Quem recusou sem nunca ter deixado o email (ou a cota sem nome) e quer voltar: topo do convite com os campos.
  const [forcarConvite, setForcarConvite] = useState(false);
  const estado = forcarConvite ? "convite" : view.estado;
  const textos = textosPara(view);

  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState<Onde | null>(null);
  const [erro, setErro] = useState<{ onde: Onde; msg: string; campo?: CampoContato } | null>(null);
  const [celebrando, setCelebrando] = useState(false);
  const [recemConfirmado, setRecemConfirmado] = useState(false);
  const [toast, setToast] = useState("");
  // Campos do topo: nome (só cota sem nome), email (D22, obrigatório), celular (opcional).
  // Preenchidos com o contato gravado — "Mudei de ideia" reconfirma com eles (D24).
  const [valores, setValores] = useState<Record<CampoContato, string>>({
    nome: "",
    email: inicial.email ?? "",
    celular: formatarCelular(inicial.celular),
  });

  const [acompAberto, setAcompAberto] = useState(false);
  const [acompDraft, setAcompDraft] = useState("");
  const [editandoAcomp, setEditandoAcomp] = useState(false);
  const [salvandoAcomp, setSalvandoAcomp] = useState(false);
  const [erroAcomp, setErroAcomp] = useState<string | null>(null);

  const heroRef = useRef<HTMLButtonElement | null>(null);
  const footRef = useRef<HTMLButtonElement | null>(null);
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const celularRef = useRef<HTMLInputElement | null>(null);
  const refs = { nome: nomeRef, email: emailRef, celular: celularRef };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [heroVis, setHeroVis] = useState(true);
  const [footVis, setFootVis] = useState(false);

  // Barra fixa: aparece quando os dois botões principais saem da tela.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) =>
      es.forEach((e) => {
        if (e.target === heroRef.current) setHeroVis(e.isIntersecting);
        if (e.target === footRef.current) setFootVis(e.isIntersecting);
      })
    );
    if (heroRef.current) io.observe(heroRef.current);
    if (footRef.current) io.observe(footRef.current);
    return () => io.disconnect();
  }, [estado]);

  // Seções aparecem com fade + 8px uma vez só (sem movimento se reduzido).
  useEffect(() => {
    if (reduzido() || typeof IntersectionObserver === "undefined" || !rootRef.current) return;
    const rio = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          el.style.opacity = "1";
          el.style.transform = "none";
          rio.unobserve(el);
        }
      }),
      { threshold: 0.1 }
    );
    rootRef.current.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      el.style.transition = "opacity .5s ease, transform .5s ease";
      rio.observe(el);
    });
    return () => rio.disconnect();
  }, []);

  const precisaNome = view.cota && !view.nome;

  const aplicar = (r: ResultadoAcao, onde: Onde): boolean => {
    if (r.ok) {
      setView(r.convite);
      setErro(null);
      return true;
    }
    const campo = CAMPO_DO_ERRO[r.erro];
    // Erro de campo sempre aparece no topo, sob o campo; os demais onde a ação partiu.
    setErro({ onde: campo ? "topo" : onde, msg: MENSAGEM_ERRO[r.erro], campo });
    if (campo) focar(campo);
    return false;
  };

  /** Leva ao topo do convite e foca o campo (barra, sheet, bloco final, "Mudei de ideia"). */
  const focar = (campo: CampoContato) => {
    setForcarConvite(true);
    setSheet(false);
    scrollTopo();
    setTimeout(() => refs[campo].current?.focus({ preventScroll: true }), reduzido() ? 0 : 400);
  };

  const setValor = (campo: CampoContato, v: string) => {
    setValores((atual) => ({ ...atual, [campo]: v }));
    if (erro?.onde === "topo") setErro(null);
  };

  const confirmar = useCallback(async (onde: Onde) => {
    if (loading) return;
    // Sem o que é obrigatório, nada de confirmar direto: leva ao campo que falta (32.6 AC 7).
    if (precisaNome && !valores.nome.trim()) return focar("nome");
    if (!valores.email.trim()) return focar("email");
    setLoading(onde);
    setSheet(false);
    let r: ResultadoAcao;
    try {
      r = await confirmarPresenca(view.codigo, {
        nome: precisaNome ? valores.nome : undefined,
        email: valores.email,
        celular: valores.celular,
      });
    } catch {
      r = { ok: false, erro: "FALHA_TEMPORARIA" };
    }
    setLoading(null);
    // Quem falhou dentro do sheet (que já fechou) vê o erro no topo.
    if (!aplicar(r, onde === "sheet" ? "topo" : onde)) return;
    setForcarConvite(false);
    scrollTopo();
    // Celebração só com sucesso real (32.4 AC 7).
    const r0 = reduzido();
    setCelebrando(!r0);
    setRecemConfirmado(true);
    setTimeout(() => setCelebrando(false), r0 ? 300 : 1600);
  }, [loading, precisaNome, valores, view.codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  const recusar = async () => {
    if (loading) return;
    setLoading("sheet");
    let r: ResultadoAcao;
    try {
      r = await recusarPresenca(view.codigo);
    } catch {
      r = { ok: false, erro: "FALHA_TEMPORARIA" };
    }
    setLoading(null);
    if (aplicar(r, "sheet")) {
      setSheet(false);
      setForcarConvite(false);
      scrollTopo();
    }
  };

  // Com o contato gravado, reconfirma direto; sem ele, o confirmar leva aos campos.
  const mudeiDeIdeia = (onde: Onde) => confirmar(onde);

  const incluirAcomp = async () => {
    const nome = acompDraft.trim();
    if (!nome || salvandoAcomp) return;
    setSalvandoAcomp(true);
    let r: ResultadoAcao;
    try {
      r = await salvarAcompanhante(view.codigo, nome);
    } catch {
      r = { ok: false, erro: "FALHA_TEMPORARIA" };
    }
    setSalvandoAcomp(false);
    if (r.ok) {
      setView(r.convite);
      setAcompDraft("");
      setAcompAberto(false);
      setEditandoAcomp(false);
      setErroAcomp(null);
    } else {
      setErroAcomp(MENSAGEM_ERRO[r.erro]);
    }
  };

  const alterarAcomp = () => {
    setAcompDraft(view.acompanhanteNome ?? "");
    setEditandoAcomp(true);
    setAcompAberto(true);
  };

  const addAgenda = () => {
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PPT Nao Compila//5 anos//PT", "BEGIN:VEVENT",
      `UID:pptnc-5anos-${view.codigo}@pptnaocompila.com.br`, "DTSTAMP:20261007T120000Z",
      `DTSTART:${EVENTO.icsInicio}`, `DTEND:${EVENTO.icsFim}`,
      "SUMMARY:5 anos de PPT Não Compila",
      `LOCATION:${EVENTO.endereco.replace(",", "\\,")} · ${EVENTO.bairro} · ${EVENTO.cidade}`,
      "DESCRIPTION:Seu nome está na lista.", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    try {
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "pptnc-5-anos.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* navegador sem Blob: segue sem arquivo */
    }
    setToast("Evento salvo na agenda");
    setTimeout(() => setToast(""), 2200);
  };

  const barVis = estado === "convite" && !heroVis && !footVis && !sheet && !loading;
  const r0 = typeof window !== "undefined" && reduzido();
  const ingressoAnim = recemConfirmado ? (r0 ? "fadeIn .3s ease both" : "tkIn .5s cubic-bezier(.2,.8,.2,1) .35s both") : "none";
  const mostrarPergunta = view.estado === "confirmado" && view.acompanhantePermitido && (!view.acompanhanteNome || editandoAcomp) && !celebrando;
  const erroEm = (onde: Onde) => (erro?.onde === onde ? erro.msg : null);

  return (
    <div ref={rootRef} style={{ background: "var(--bg)", color: "var(--text)", fontFamily: SANS, position: "relative", overflowX: "clip", minHeight: "100vh" }}>
      {/* Faixa fixa no topo (computador) */}
      <div className="bar bar-top only-wide" data-vis={barVis} style={{ position: "sticky", top: 0, zIndex: 40, height: 72, marginBottom: -72, borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1200, height: "100%", margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="PPT Não Compila" style={{ width: 36, height: 36, borderRadius: 8, display: "block" }} />
          <span style={mono(12, { color: "var(--text-2)", whiteSpace: "nowrap", flex: "none" })}>{textos.rotulo}</span>
          <span style={{ flex: 1 }} />
          <span style={mono(12, { color: "var(--text)", whiteSpace: "nowrap", flex: "none" })}>{EVENTO.dataCurta} · {EVENTO.diaSemanaCurto} · {EVENTO.horario}</span>
          <button className="btn-primary" tabIndex={barVis ? 0 : -1} onClick={() => confirmar("topo")} style={{ height: 48, width: 280, fontSize: 16 }}>
            Confirmar presença <span>→</span>
          </button>
        </div>
      </div>

      {estado === "convite" && (
        <TopoConvite
          view={view} textos={textos} loading={loading === "topo"} heroRef={heroRef} refs={refs}
          valores={valores} setValor={setValor}
          erro={erro?.onde === "topo" ? { msg: erro.msg, campo: erro.campo } : null} onConfirmar={() => confirmar("topo")} onNaoPoderei={() => setSheet(true)}
        />
      )}
      {estado === "confirmado" && (
        <TopoConfirmado
          view={view} textos={textos} ingressoAnim={ingressoAnim} mostrarPergunta={mostrarPergunta}
          perguntaAnim={recemConfirmado && !r0 ? "fadeUp .4s ease both" : "none"}
          acompAberto={acompAberto} setAcompAberto={setAcompAberto} acompDraft={acompDraft}
          setAcompDraft={(v) => { setAcompDraft(v); setErroAcomp(null); }} editandoAcomp={editandoAcomp}
          salvandoAcomp={salvandoAcomp} erroAcomp={erroAcomp} onIncluir={incluirAcomp} onAlterar={alterarAcomp}
          onAgenda={addAgenda} onNaoPoderei={() => setSheet(true)}
        />
      )}
      {estado === "recusou" && (
        <TopoRecusou textos={textos} loading={loading === "recusou"} erro={erroEm("recusou")} onMudei={() => mudeiDeIdeia("recusou")} />
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 var(--padX)", display: "flex", flexDirection: "column", gap: "var(--secGap)" }}>
        {!view.cota && <SecaoEpisodio view={view} />}
        <SecaoNumeros />
        <SecaoNoite />
        <SecaoProgramacao />
        <SecaoNetworking />
        <SecaoApoiadores />
        <SecaoNota textos={textos} />
        <BlocoFinal
          estado={estado} textos={textos} footRef={footRef} loading={loading === "final"} erro={erroEm("final")}
          onConfirmar={() => (estado === "recusou" ? mudeiDeIdeia("final") : confirmar("final"))}
          onNaoPoderei={() => setSheet(true)} onVerIngresso={scrollTopo}
        />
      </div>
      <Rodape />

      {/* Barra fixa inferior (celular) */}
      <div className="bar bar-bottom only-narrow" data-vis={barVis} style={{ position: "sticky", bottom: 0, zIndex: 40, marginTop: -80, height: 80, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "none" }}>
          <span style={{ fontSize: 20, lineHeight: "22px", fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.02em" }}>{EVENTO.dataCurta}</span>
          <span style={mono(11, { letterSpacing: ".18em", color: "var(--text-2)" })}>{EVENTO.diaSemanaCurto} · {EVENTO.horario}</span>
        </div>
        <button className="btn-primary" tabIndex={barVis ? 0 : -1} onClick={() => confirmar("topo")} style={{ flex: 1, height: 52, fontSize: 17 }}>
          Confirmar presença <span>→</span>
        </button>
      </div>

      {sheet && (
        <div className="sheet-wrap">
          <div onClick={() => setSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(5,5,8,.68)", animation: "fadeIn .25s ease both" }} />
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "12px 20px 28px", display: "flex", flexDirection: "column" }}>
            <span style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 4, background: "#56565E" }} />
            <div style={{ ...mono(12, { color: "var(--accent)" }), marginTop: 22, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 24, height: 2, background: "var(--accent)" }} />Antes de responder
            </div>
            <h2 id="sheetTitle" style={{ margin: "12px 0 0", fontSize: 28, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.02em" }}>{textos.sheetTitulo}</h2>
            <p style={{ margin: "12px 0 0", fontSize: 17, lineHeight: "26px", color: "var(--text-2)", textWrap: "pretty" }}>{textos.sheetFrase}</p>
            <div style={{ ...mono(12, { color: "var(--text-2)" }), marginTop: 18, padding: "14px 16px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--line)", lineHeight: "20px" }}>
              {EVENTO.dataCurta} · {EVENTO.diaSemanaCurto} · {EVENTO.horario} · {EVENTO.bairro}
            </div>
            <button
              className="btn-primary"
              autoFocus
              onClick={() => (view.estado === "confirmado" ? setSheet(false) : confirmar("sheet"))}
              style={{ marginTop: 22 }}
            >
              {view.estado === "confirmado" ? "Manter minha presença" : "Quero ir: confirmar presença"}
            </button>
            <button className="link-tertiary" onClick={recusar} aria-busy={loading === "sheet"} style={{ marginTop: 6, alignSelf: "center", padding: "0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              {loading === "sheet" && <Spinner cor="var(--muted)" fundo="rgba(154,154,162,.25)" size={14} />}
              Não poderei ir mesmo
            </button>
            {erroEm("sheet") && <p role="alert" style={{ margin: "8px 0 0", textAlign: "center", color: "var(--error)", fontSize: 15, lineHeight: "22px" }}>{erroEm("sheet")}</p>}
          </div>
        </div>
      )}

      {toast && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 80, background: "#F3F2EE", color: "#0B0809", borderRadius: 999, padding: "12px 20px", fontSize: 15, fontWeight: 600, animation: "fadeUp .25s ease both", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {celebrando && <Baloes />}
    </div>
  );
}

