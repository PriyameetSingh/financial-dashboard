import { Metadata } from "next";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { InlineAlert } from "@/components/nocturne";
import NationalColourBand from "@/components/NationalColourBand";
import GovLoginBranding from "@/components/GovLoginBranding";
import LoginGrid from "@/components/LoginGrid";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Secure Login | HUDD Dashboard",
  description:
    "Official access portal for the Housing & Urban Development Department, Government of Odisha — authenticated entry only.",
};

const LOGIN_ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  account_not_registered: {
    title: "Your account is not registered in this dashboard",
    body: "Your single sign-on identity was verified, but it is not linked to a dashboard account. Please contact your departmental IT administrator to have your account provisioned.",
  },
  invalidated: {
    title: "Your session is no longer valid",
    body: "Your session was ended (for example, because your password was reset). Please sign in again.",
  },
  session_invalidated: {
    title: "Your session is no longer valid",
    body: "Your session was ended (for example, because your password was reset). Please sign in again.",
  },
};

type SearchParams = Promise<{ error?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const errorInfo = error ? LOGIN_ERROR_MESSAGES[error] ?? null : null;
  const currentRelease = await prisma.release.findFirst({
    where: { isCurrent: true },
    select: { version: true },
  });
  const currentVersion = currentRelease?.version || "1.0.0";

  return (
    <NocturneRoot className="flex min-h-screen flex-col">
      <NationalColourBand />

      <main className="flex flex-1 flex-col">
        <div
          className="flex justify-end px-4 py-2"
          style={{ boxShadow: "inset 0 -1px 0 var(--color-divider)" }}
        >
          <TextSizeToolbarControl compact />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div
            className="w-full max-w-4xl overflow-hidden elev-md"
            style={{ borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
          >
            <div
              className="px-6 py-4 sm:px-8"
              style={{ boxShadow: "inset 0 -1px 0 var(--color-divider)" }}
            >
              <p className="ax-section-title text-center" style={{ margin: 0 }}>
                Official portal · Authenticated access
              </p>
            </div>

            <div className="grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,280px)_1fr] lg:gap-12 lg:py-12">
              <GovLoginBranding />

              <div className="flex min-h-0 flex-col justify-center space-y-8">
                <header
                  className="space-y-3 pb-8"
                  style={{ boxShadow: "inset 0 -1px 0 var(--color-divider)" }}
                >
                  <h1 style={{ fontSize: 26, margin: 0 }}>HUDD Integrated Dashboard</h1>
                  <p className="ax-wz-hint" style={{ fontSize: 14 }}>
                    Sign in using your department-issued credentials via the secure single sign-on
                    service. This system is restricted to authorised officers and staff of the
                    Housing &amp; Urban Development Department.
                  </p>
                </header>

                {errorInfo && (
                  <InlineAlert>
                    <strong>{errorInfo.title}</strong>
                    <span style={{ display: "block", marginTop: 4 }}>{errorInfo.body}</span>
                  </InlineAlert>
                )}

                <LoginGrid />

                <footer
                  className="space-y-3 pt-6 text-xs leading-relaxed"
                  style={{ boxShadow: "inset 0 1px 0 var(--color-divider)", color: "var(--ax-muted)" }}
                >
                  <p>
                    By continuing, you acknowledge that access is monitored and must comply with
                    applicable Government of India and State IT policies.
                  </p>
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 pt-3"
                    style={{ boxShadow: "inset 0 1px 0 var(--color-divider)" }}
                  >
                    <p>Need help? Contact your departmental IT / SSO administrator.</p>
                    <p className="text-[10px] font-semibold">Version {currentVersion}</p>
                  </div>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </main>
    </NocturneRoot>
  );
}
