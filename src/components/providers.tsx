"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
