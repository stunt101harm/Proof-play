import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@proof-play/condition-engine",
    "@proof-play/domain",
    "@proof-play/txline",
  ],
};

export default nextConfig;
