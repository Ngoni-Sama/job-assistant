// Set by deploy.sh when building ON the nivacity server (CloudLinux caps
// processes/threads; Next's parallel build hits `spawn EAGAIN` / SIGABRT).
const lowResource = process.env.LOW_RESOURCE_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
