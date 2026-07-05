/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // In production (Azure/AWS), set BACKEND_URL to your deployed FastAPI server URL
    // e.g. BACKEND_URL=http://your-fastapi-service:8000
    // Locally defaults to http://127.0.0.1:8000
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
