import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize: @ffprobe-installer/ffprobe uses dynamic require.resolve over
  // its package dir; webpack bundling would try to parse README.md/.d.ts.
  // Loaded via node require at runtime (nodejs runtime); the binary itself is
  // traced into the serverless function via outputFileTracingIncludes below.
  serverExternalPackages: ["@ffprobe-installer/ffprobe"],
  outputFileTracingIncludes: {
    "/api/events/*": ["./node_modules/@ffprobe-installer/linux-x64/**"],
  },
};

export default nextConfig;
