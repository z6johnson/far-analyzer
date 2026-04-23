import type { NextConfig } from "next";

const config: NextConfig = {
  // Ensure the corpus + guide ship with the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/analyze": ["./data/far_rag.jsonl", "./data/travis-guide.json"],
  },
  // unpdf is ESM-only; mark it as external so Next doesn't try to transpile
  // it for the edge. The analyze route runs on Node.
  serverExternalPackages: ["unpdf"],
};

export default config;
