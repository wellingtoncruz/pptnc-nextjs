/**
 * Conteúdo FIXO do hotsite (D13): mudar = editar este arquivo + deploy.
 * Valores atuais = os do layout do Claude Design. Pré-requisito do deploy final:
 * números atuais, programação, apoiadores, foto e nota finais (Wellington).
 */
export const EVENTO = {
  dataCurta: "29/10",
  dia: "29",
  mes: "10",
  diaSemana: "Quinta-feira",
  diaSemanaCurto: "Qui",
  horario: "19h",
  endereco: "Rua Bastos Pereira, 25",
  bairro: "Vila Nova Conceição",
  bairroCurto: "V. Nova Conceição",
  cidade: "São Paulo",
  uf: "SP",
  // .ics: 19h–23h em São Paulo (UTC-3, sem horário de verão)
  icsInicio: "20261029T220000Z",
  icsFim: "20261030T020000Z",
} as const;

export const NUMEROS = {
  destaque: { v: "4,3", s: " mi+", l: "Pessoas impactadas" },
  cards: [
    { v: "240", s: "+", l: "Episódios" },
    { v: "45", s: " mil", l: "Seguidores e inscritos" },
    { v: "2,65", s: " mi", l: "Visualizações" },
    { v: "172", s: " mil+", l: "Horas assistidas" },
  ],
};

export const NOITE = [
  { n: "01", t: "Happy hour", d: "Comida, bebida e boa conversa, com uma fala breve dos apoiadores no palco." },
  { n: "02", t: "Quinta, 29/10", d: "A partir das 19h, no início da noite, em São Paulo." },
  { n: "03", t: "Vila Nova Conceição, SP", d: "Rua Bastos Pereira, 25." },
  { n: "04", t: "Entre pares", d: "Uma sala só com quem fez parte da história do podcast." },
];

/** horario null = item "Em breve" (estado do lançamento). */
export const PROGRAMACAO: { horario: string | null; atividade: string }[] = [
  { horario: "19h30", atividade: "Wellington Cruz: Abertura e Agradecimentos" },
  { horario: null, atividade: "Em breve" },
  { horario: null, atividade: "Em breve" },
  { horario: null, atividade: "Em breve" },
];

export const CARGOS = [
  "CTOs", "CIOs", "CDOs", "CISOs", "Heads de Engenharia", "Heads de Plataforma",
  "Arquitetos", "Staff Engineers", "Founders & CEOs", "Diretores de TI", "Líderes de Dados & IA",
];

export const APOIADORES = [
  { nome: "NullPlatform", img: "/assets/nullplatform_logo.png", h: 32, mw: "82%" },
  { nome: "VMBears", img: "/assets/sup_54.png", h: 30, mw: "82%" },
  { nome: "Klever", img: "/assets/sup_53.png", h: 24, mw: "82%" },
  { nome: "Elven", img: "/assets/sup_57.png", h: 56, mw: "82%" },
  { nome: "Maralto", img: "/assets/maralto.webp", h: 76, mw: "82%" },
  { nome: "Trends News", img: "/assets/trends_news.webp", h: 64, mw: "100%" },
];
