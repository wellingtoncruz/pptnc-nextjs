import { Container } from "@/components/layout/container";

/**
 * Placeholder component for sponsor logos
 * Replace src with actual logo URLs when available
 */
interface SponsorLogoProps {
  name: string;
  index: number;
}

function SponsorLogo({ name, index }: SponsorLogoProps) {
  return (
    <div className="flex items-center justify-center">
      <div
        className="flex h-16 w-full max-w-[180px] items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
        aria-label={`Logo ${name}`}
      >
        {/* Replace this div with actual <img> when logos are available */}
        <span className="text-center">Logo {index + 1}</span>
      </div>
    </div>
  );
}

/**
 * Sponsors section that appears before the footer on all pages
 * Displays 4 sponsor logos in a responsive grid
 */
export function Sponsors() {
  // Placeholder sponsors - replace with actual data when available
  const sponsors = [
    { name: "Apoiador 1" },
    { name: "Apoiador 2" },
    { name: "Apoiador 3" },
    { name: "Apoiador 4" },
  ];

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
          {sponsors.map((sponsor, index) => (
            <SponsorLogo key={sponsor.name} name={sponsor.name} index={index} />
          ))}
        </div>
      </Container>
    </section>
  );
}
