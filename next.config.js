/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack is the default bundler in Next.js 16. It handles fs/net/tls
  // browser fallbacks and watch exclusions automatically.
  turbopack: {},

  // Webpack config retained for `next build --webpack` fallback.
  webpack: (config, { isServer, dev }) => {
    // Fixes for Highcharts and map-collection (browser bundles only)
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Stable chunk IDs for long-term caching
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
      };
    }

    // Exclude node_modules and build artefacts from the file watcher to
    // prevent EMFILE exhaustion (inotify limit) in dev mode.
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      };
    }

    return config;
  },
  // Increase build timeout for large Highcharts map-data imports
  staticPageGenerationTimeout: 180,
}

module.exports = nextConfig
