import type { Metadata } from "next";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FontScaleProvider } from "@/components/FontScaleProvider";
import { DataProvider } from "@/context/DataContext";
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";

export const metadata: Metadata = {
  title: "HUDD — Odisha Urban Governance",
  description: "Agentic intelligence platform for Housing & Urban Development Department, Government of Odisha",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <AuthSessionProvider>
          <ThemeProvider>
            <FontScaleProvider>
              <DataProvider>
                {children}
                <SpeedInsights />
              </DataProvider>
            </FontScaleProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
