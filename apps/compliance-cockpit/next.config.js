/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agentguard/core-schema'],
  output: 'standalone',
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-icons',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
    ],
  },
  env: {
    APP_VERSION: require('./package.json').version,
    NEXT_PUBLIC_USE_MOCK_TRACES: 'true',
  },
  async rewrites() {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8081';
    const bankGateUrl = process.env.BANK_GATE_URL || 'http://localhost:4000';
    const witnessUrl = process.env.WITNESS_URL || 'http://localhost:5000';
    const marketUrl = process.env.MARKET_MCP_URL || 'http://localhost:4004';
    const trustUrl = process.env.TRUST_ENGINE_URL || 'http://localhost:4006';

    return [
      {
        source: '/api/customer/:path*',
        destination: `${gatewayUrl}/api/customer/:path*`,
      },
      {
        source: '/api/agent/:path*',
        destination: `${gatewayUrl}/api/agent/:path*`,
      },
      {
        source: '/api/v1/lab/:path*',
        destination: `${gatewayUrl}/api/v1/lab/:path*`,
      },
      {
        source: '/api/v1/demo/:path*',
        destination: `${gatewayUrl}/api/v1/demo/:path*`,
      },
      {
        source: '/api/v1/:path*',
        destination: `${gatewayUrl}/api/v1/:path*`,
      },
      {
        source: '/api/bank/:path*',
        destination: `${bankGateUrl}/:path*`,
      },
      {
        source: '/api/witness/:path*',
        destination: `${witnessUrl}/:path*`,
      },
      {
        source: '/api/market/:path*',
        destination: `${marketUrl}/api/market/:path*`,
      },
      {
        source: '/api/trust/:path*',
        destination: `${trustUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
