/**
 * External links for podcast platforms and social media
 */
export const EXTERNAL_LINKS = {
  youtube: "https://www.youtube.com/@PPTNaoCompila",
  youtubeSubscribe: "https://www.youtube.com/channel/UCOvTsuQyJq-fpydse7BY2PQ?sub_confirmation=1",
  spotify: "https://open.spotify.com/show/5aKHRdBlylb2wj5Ac8Kqpj",
  instagram: "https://www.instagram.com/pptnaocompila",
  linkedin: "https://www.linkedin.com/company/ppt-nao-compila",
} as const;

/**
 * Navigation links for the site
 */
export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/episodios", label: "Episódios" },
  { href: "/midiakit", label: "Midiakit" },
  { href: "/sugerir-pauta", label: "Sugerir Pauta" },
  { href: "/contato", label: "Contato" },
] as const;

/**
 * Site metadata
 */
export const SITE_CONFIG = {
  name: "PPT Não Compila",
  shortName: "PPTNC",
  description: "Podcast sobre tecnologia e transformação digital",
} as const;
