import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Numero di versione mostrato sul sito (vedi src/lib/version.ts): quello di
  // package.json, da aumentare a ogni rilascio, più il commit di Vercel.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  // La guida in PDF viene letta dal disco dalla route /gestione-menu/guida.
  outputFileTracingIncludes: {
    "/gestione-menu/guida": ["./docs/guida/Guida-gestione-menu.pdf"],
  },
};

export default nextConfig;
