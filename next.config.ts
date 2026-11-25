import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{
      source: "/native-deriv/:path*",
      headers: [{
        key: "Content-Security-Policy",
        // The official Blockly editor evaluates generated code internally during initialization.
        // This exception is limited to the sandboxed editor asset path; broker networking remains denied.
        value: "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      }]
    }];
  }
};
export default nextConfig;
