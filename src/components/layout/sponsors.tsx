import Image from "next/image";
import { Container } from "@/components/layout/container";

/**
 * Sponsor configuration
 * To add/change sponsors:
 * 1. Add logo images to public/sponsors/ folder
 * 2. Update the SPONSORS array below with name, logo path, and optional URL
 */
interface Sponsor {
  name: string;
  logo?: string; // Path relative to public/, e.g., "/sponsors/empresa.png"
  url?: string; // Optional link to sponsor website
}

const SPONSORS: Sponsor[] = [
  { name: "VMBears", logo: "/sponsors/vmbears.png", url: "https://vmbears.io" },
  { name: "Klever", logo: "/sponsors/klever.png.webp", url: "https://klever.io" },
  { name: "Techrom", logo: "/sponsors/techrom.png", url: "https://techrom.co" },
  { name: "Seja um apoiador", logo: "/sponsors/seja_apoiador.png", url: "https://pptnaocompila.com.br/midiakit" },
];

function SponsorLogo({ name, logo, url }: Sponsor) {
  const content = logo ? (
    <Image
      src={logo}
      alt={`Logo ${name}`}
      width={160}
      height={48}
      className="h-12 w-auto max-w-[160px] object-contain"
    />
  ) : (
    <div
      className="flex h-16 w-full max-w-[180px] items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
      aria-label={`Logo ${name}`}
    >
      <span className="text-center">Logo</span>
    </div>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center transition-opacity hover:opacity-80"
        aria-label={`Visitar ${name}`}
      >
        {content}
      </a>
    );
  }

  return <div className="flex items-center justify-center">{content}</div>;
}

/**
 * Sponsors section that appears before the footer on all pages
 * Displays 4 sponsor logos in a responsive grid
 */
export function Sponsors() {
  return (
    <section
      aria-labelledby="sponsors-title"
      className="border-t bg-background py-10"
    >
      <Container>
        <h2
          id="sponsors-title"
          className="mb-8 text-center text-lg font-semibold text-muted-foreground"
        >
          Apoiadores
        </h2>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
          {SPONSORS.map((sponsor) => (
            <SponsorLogo key={sponsor.name} {...sponsor} />
          ))}
        </div>
      </Container>
    </section>
  );
}
