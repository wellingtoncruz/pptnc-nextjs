import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
