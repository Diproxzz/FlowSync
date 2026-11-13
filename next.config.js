/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_FEATURE_PURCHASES: process.env.FEATURE_PURCHASES ?? "false",
  },
  experimental: {
    serverComponentsExternalPackages: [
      "@napi-rs/canvas",
      "@whiskeysockets/baileys",
      "pino",
      "qrcode",
    ],
  },
};

module.exports = nextConfig;
