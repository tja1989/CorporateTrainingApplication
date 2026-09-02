import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gemini SDK's node build imports ws/google-auth-library/fs — keep it external on the server;
  // client chunks resolve its `browser` export automatically.
  serverExternalPackages: ["@google/genai"],
  // Allow the YouTube IFrame API + embeds while keeping a restrictive default CSP.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Voice features use the microphone on this origin only; nothing uses the camera.
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
