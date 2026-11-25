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
    const editorCsp = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://tradesche.com https://www.tradesche.com https://*.vercel.app; style-src 'self' 'unsafe-inline' https://tradesche.com https://www.tradesche.com https://*.vercel.app https://fonts.googleapis.com; img-src 'self' data: blob: https://tradesche.com https://www.tradesche.com https://*.vercel.app; font-src 'self' data: https://tradesche.com https://www.tradesche.com https://*.vercel.app https://fonts.gstatic.com; connect-src wss://api.derivws.com/trading/v1/options/ws/public wss://staging-api.derivws.com/trading/v1/options/ws/public; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
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
