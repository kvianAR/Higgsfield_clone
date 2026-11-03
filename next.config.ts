import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  agentRules: false,
  devIndicators: false,
  serverExternalPackages: ["formidable", "sharp", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/creative/video-render": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/package.json"],
  },
};

export default withNextIntl(nextConfig);
