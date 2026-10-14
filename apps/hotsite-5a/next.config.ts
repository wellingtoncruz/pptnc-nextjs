import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment (mesmo padrão do apps/web)
  output: "standalone",
  // Monorepo: rastreia arquivos a partir da raiz do workspace
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["@google-cloud/firestore", "google-gax", "protobufjs"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
};

export default nextConfig;
