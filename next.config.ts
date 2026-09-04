import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "exceljs"],
  experimental: {
    // Accounting workbooks are a few MB (the sample is 2.2 MB); uploads go through a server action.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
