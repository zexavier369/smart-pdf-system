/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export", // Memungkinkan build statis untuk Cloudflare Pages gratis tanpa server Node berbayar
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;
