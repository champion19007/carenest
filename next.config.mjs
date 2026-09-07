/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },

  /**
   * PGlite ships a WASM binary and Neon's driver resolves its own entrypoints.
   * Bundling either breaks their file resolution ("File URL path must be
   * absolute"), so they are loaded from node_modules at runtime instead.
   */
  serverExternalPackages: ['@electric-sql/pglite', '@neondatabase/serverless'],
}

export default nextConfig
