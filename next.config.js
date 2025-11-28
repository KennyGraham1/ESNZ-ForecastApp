/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
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
