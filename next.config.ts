import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: [{
        source: "/",
        has: [{ type: "query", key: "native_deriv", value: "1" }],
        destination: "/native-deriv/index.html",
      }],
    };
  },
  async headers() {
    const editorCsp = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src wss://api.derivws.com/trading/v1/options/ws/public wss://staging-api.derivws.com/trading/v1/options/ws/public; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    return [
      {
        source: "/native-deriv/:path*",
        headers: [{ key: "Content-Security-Policy", value: editorCsp }],
      },
      {
        source: "/",
        has: [{ type: "query", key: "native_deriv", value: "1" }],
        headers: [{ key: "Content-Security-Policy", value: editorCsp }],
      },
    ];
  }
};
export default nextConfig;
