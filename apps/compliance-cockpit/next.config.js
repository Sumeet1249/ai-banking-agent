/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agentguard/core-schema'],
  output: 'standalone',
  env: {
    APP_VERSION: require('./package.json').version,
    NEXT_PUBLIC_USE_MOCK_TRACES: 'true',
  },
  async rewrites() {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8080';
    const bankGateUrl = process.env.BANK_GATE_URL || 'http://localhost:4000';
    const witnessUrl = process.env.WITNESS_URL || 'http://localhost:5000';
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
    ];
  },
};

module.exports = nextConfig;