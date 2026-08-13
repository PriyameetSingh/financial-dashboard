import type { Metadata } from "next";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FontScaleProvider } from "@/components/FontScaleProvider";
import TenantConfigProvider from "@/components/TenantConfigProvider";
import { getTenantContextSafe } from "@/lib/tenant-context";
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";

export const metadata: Metadata = {
  title: "HUDD — Odisha Urban Governance",
  description: "Agentic intelligence platform for Housing & Urban Development Department, Government of Odisha",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the tenant once per request (primes the server-side holder for
  // every RSC below) and hand the config to the client-side provider.
  // Fallback-tolerant: static prerender / unresolved requests render with
  // ODISHA_DEFAULTS, identical to today's build.
  const { config } = await getTenantContextSafe();
  return (
    <html lang="en" className="h-full" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <TenantConfigProvider config={config}>
          <AuthSessionProvider>
            <ThemeProvider>
              <FontScaleProvider>
                {children}
                <SpeedInsights />
              </FontScaleProvider>
            </ThemeProvider>
          </AuthSessionProvider>
        </TenantConfigProvider>
      </body>
    </html>
  );
}
