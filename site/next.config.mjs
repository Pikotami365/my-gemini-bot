/** @type {import('next').NextConfig} */
const nextConfig = {
  // Шрифты для картинок-превью читаются с диска — включаем их в сборку.
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
};
export default nextConfig;
