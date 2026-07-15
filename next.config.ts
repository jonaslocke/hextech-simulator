import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["steamvents"],
  reactStrictMode: true
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
