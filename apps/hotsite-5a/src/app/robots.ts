import type { MetadataRoute } from "next";

// Convites pessoais: nada de indexação.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
