// Set by deploy.sh when building ON the nivacity server (CloudLinux caps
// processes/threads; Next's parallel build hits `spawn EAGAIN` / SIGABRT).
const lowResource = process.env.LOW_RESOURCE_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework, and never ship source maps (readable source).
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site may show VacancyPal inside a frame (copycat wrappers, clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Location is used by "Jobs near you"; nothing else needs device features.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
  // Serve images as-is: avoids the native `sharp` dependency on shared hosting.
  images: { unoptimized: true },
  ...(lowResource
    ? {
        experimental: { workerThreads: false, cpus: 1 },
        // Type-check runs locally (`tsc --noEmit`) before every push; skip the
        // extra thread-hungry pass on the constrained server.
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
};

export default nextConfig;
