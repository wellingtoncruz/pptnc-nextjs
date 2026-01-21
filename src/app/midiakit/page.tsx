import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  Headphones,
  PlayCircle,
  TrendingUp,
  Youtube,
  Download,
  Mail,
  Scissors,
  Film,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpotifyIcon } from "@/components/icons/social-icons";
import { getMetrics, formatMetricNumber } from "@/lib/datastore/metrics";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";

export const metadata: Metadata = {
  title: "Midiakit - Anuncie no Podcast de Tecnologia",
  description:
    "Conheça as métricas e alcance do podcast de tecnologia PPT Não Compila. Baixe nosso midiakit para parcerias e patrocínios.",
  alternates: {
    canonical: `${baseUrl}/midiakit`,
  },
  openGraph: {
    title: "Midiakit | PPT Não Compila - Podcast de Tecnologia",
    description:
      "Conheça as métricas e alcance do podcast de tecnologia PPT Não Compila. Baixe nosso midiakit para parcerias e patrocínios.",
  },
};

// Revalidate every hour
export const revalidate = 3600;

interface MetricCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  description?: string;
}

function MetricCard({ icon, value, label, description }: MetricCardProps) {
  return (
    <Card className="p-6 text-center">
      <div className="mb-3 flex justify-center text-primary">{icon}</div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 font-medium text-foreground">{label}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </Card>
  );
}

export default async function MidiakitPage() {
  const metrics = await getMetrics();

  return (
    <Container className="py-8 lg:py-12">
      {/* Hero Section */}
      <header className="mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          Midiakit
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          O PPT Não Compila é um dos principais podcasts de tecnologia e
          transformação digital do Brasil, conectando profissionais e
          entusiastas de tech há mais de 200 episódios.
        </p>
      </header>

      {/* Metrics Grid */}
      <section aria-labelledby="metrics-title" className="mb-12">
        <h2
          id="metrics-title"
          className="mb-6 text-xl font-semibold text-primary"
        >
          Nossos Números
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<PlayCircle className="h-8 w-8" />}
            value={formatMetricNumber(metrics.episodes)}
            label="Episódios"
            description="Publicados"
          />
          <MetricCard
            icon={<Scissors className="h-8 w-8" />}
            value={formatMetricNumber(metrics.cortes)}
            label="Cortes"
            description="Clipes curtos"
          />
          <MetricCard
            icon={<Film className="h-8 w-8" />}
            value={formatMetricNumber(metrics.reels)}
            label="Reels"
            description="Conteúdo vertical"
          />
          <MetricCard
            icon={<Youtube className="h-8 w-8" />}
            value={formatMetricNumber(metrics.youtubeSubscribers)}
            label="Inscritos"
            description="No YouTube"
          />
          <MetricCard
            icon={<SpotifyIcon className="h-8 w-8" />}
            value={formatMetricNumber(metrics.spotifyFollowers)}
            label="Seguidores"
            description="No Spotify"
          />
          <MetricCard
            icon={<Headphones className="h-8 w-8" />}
            value={formatMetricNumber(metrics.monthlyListeners)}
            label="Ouvintes/mês"
            description="Média mensal"
          />
          <MetricCard
            icon={<TrendingUp className="h-8 w-8" />}
            value={formatMetricNumber(metrics.totalPlays)}
            label="Plays totais"
            description="Todas as plataformas"
          />
          <MetricCard
            icon={<Users className="h-8 w-8" />}
            value={formatMetricNumber(metrics.socialReach)}
            label="Alcance social"
            description="Redes sociais"
          />
        </div>
      </section>

      {/* About Section */}
      <section aria-labelledby="about-title" className="mb-12">
        <h2
          id="about-title"
          className="mb-6 text-xl font-semibold text-primary"
        >
          Sobre o Podcast
        </h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-3 text-lg font-semibold">Público-alvo</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>• Profissionais de tecnologia (desenvolvedores, arquitetos, DevOps)</li>
              <li>• Líderes técnicos e gestores de TI (CTOs, Tech Leads, Engineering Managers)</li>
              <li>• Executivos interessados em transformação digital</li>
              <li>• Empreendedores e fundadores de startups</li>
              <li>• Estudantes e entusiastas de tecnologia</li>
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="mb-3 text-lg font-semibold">Temas Abordados</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>• Inteligência Artificial e Machine Learning</li>
              <li>• Cloud Computing e Arquitetura de Software</li>
              <li>• Carreira em tecnologia e liderança técnica</li>
              <li>• Transformação digital e inovação</li>
              <li>• Startups, empreendedorismo e cases de sucesso</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Format Section */}
      <section aria-labelledby="format-title" className="mb-12">
        <h2
          id="format-title"
          className="mb-6 text-xl font-semibold text-primary"
        >
          Formato
        </h2>
        <Card className="p-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-2xl font-bold text-primary">60-90 min</p>
              <p className="text-muted-foreground">Duração média</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">Semanal</p>
              <p className="text-muted-foreground">Frequência de publicação</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">Entrevistas</p>
              <p className="text-muted-foreground">
                Com especialistas do mercado
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* CTA Section */}
      <section className="rounded-lg bg-muted/50 p-8 text-center">
        <h2 className="mb-4 text-2xl font-bold">Interessado em parceria?</h2>
        <p className="mb-6 text-muted-foreground">
          Baixe nosso midiakit completo com mais informações sobre o podcast,
          audiência e oportunidades de patrocínio.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button asChild size="lg">
            <a href="/midiakit.pdf" download>
              <Download className="mr-2 h-5 w-5" />
              Baixar Midiakit (PDF)
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contato">
              <Mail className="mr-2 h-5 w-5" />
              Entre em Contato
            </Link>
          </Button>
        </div>
      </section>
    </Container>
  );
}
