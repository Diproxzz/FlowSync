/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_FEATURE_PURCHASES: process.env.FEATURE_PURCHASES ?? "false",
  },
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("@napi-rs/canvas");
      }
    }
    return config;
  },
};

module.exports = nextConfig;
