import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: "standalone",
  // Required for monorepo: trace files from workspace root
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Transpile workspace packages (TypeScript source)
  transpilePackages: ["@pptnc/types", "@pptnc/datastore"],
  // Exclude @google-cloud packages from bundling to fix proto file resolution
  serverExternalPackages: [
    "@google-cloud/datastore",
    "google-gax",
    "protobufjs",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
  },
  experimental: {
    // With select() optimization, query is fast enough for parallel workers
    // Query fetches only needed fields (~0.6MB instead of ~46MB with transcripts)
    cpus: 4,
  },
};

export default nextConfig;
