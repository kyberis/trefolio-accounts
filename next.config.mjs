/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  async rewrites() {
    return [
      { source: "/oauth2/token", destination: "/api/oauth2/token" },
      { source: "/oauth2/userinfo", destination: "/api/oauth2/userinfo" },
      { source: "/oauth2/jwks", destination: "/api/oauth2/jwks" },
      { source: "/.well-known/openid-configuration", destination: "/api/.well-known/openid-configuration" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};
export default nextConfig;
