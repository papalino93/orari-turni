"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import { RegisterServiceWorker } from "@/components/register-sw";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <RegisterServiceWorker />
          {children}
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
