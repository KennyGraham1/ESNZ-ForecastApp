/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, dev }) => {
    // Fixes for Highcharts and map-collection
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Optimize build performance
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
      };
    }

    // In dev mode, exclude node_modules and build artefacts from the file
    // watcher to prevent EMFILE: too many open files (inotify limit exhaustion).
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      };
    }

    return config;
  },
  // Increase build timeout
  staticPageGenerationTimeout: 180,
  // Disable static optimization for pages with dynamic imports
  experimental: {
    optimizeCss: false,
  },
}

module.exports = nextConfig
