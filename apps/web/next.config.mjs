/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace package is shipped as TS source; let Next transpile it.
  transpilePackages: ["@vigour/shared"],
};

export default nextConfig;
