import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  // Site-wide security headers. The policy itself lives in
  // src/lib/securityHeaders.ts so it can be unit-tested.
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
