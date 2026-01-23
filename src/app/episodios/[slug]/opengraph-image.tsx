import { ImageResponse } from "next/og";
import { getEpisodeBySlug } from "@/lib/datastore/episodes";

// Image metadata
export const alt = "PPT Não Compila - Episódio";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Revalidate with the page
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OGImage({ params }: Props) {
  const { slug } = await params;
  const episode = await getEpisodeBySlug(slug);

  // Fallback if episode not found
  const title = episode?.title || "Episódio não encontrado";
  const guests = episode?.guests?.map((g) => g.name).join(", ") || "";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "linear-gradient(to bottom right, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)",
          padding: "60px",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "60px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              fontWeight: "bold",
              color: "#f97316",
              letterSpacing: "-0.02em",
            }}
          >
            PPT NÃO COMPILA
          </div>
          <div
            style={{
              fontSize: "20px",
              color: "#a1a1aa",
            }}
          >
            Podcast de Tecnologia
          </div>
        </div>

        {/* Episode badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              backgroundColor: "#f97316",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "4px",
              fontSize: "18px",
              fontWeight: "600",
            }}
          >
            EPISÓDIO
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 60 ? "48px" : "56px",
            fontWeight: "bold",
            color: "#fff",
            lineHeight: 1.2,
            maxWidth: "1000px",
            marginBottom: "24px",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>

        {/* Guests */}
        {guests && (
          <div
            style={{
              fontSize: "24px",
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "#f97316" }}>com</span>
            <span>{guests}</span>
          </div>
        )}
      </div>
    ),
    {
      ...size,
    }
  );
}
