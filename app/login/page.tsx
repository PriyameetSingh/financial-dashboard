import { Metadata } from "next";
import GovLoginBranding from "@/components/GovLoginBranding";
import LoginGrid from "@/components/LoginGrid";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";
import { AlertTriangle } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      {/* National colour band — common on Government of India portals */}
      <div className="flex h-1.5 w-full shrink-0" aria-hidden>
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      <main className="flex flex-1 flex-col">
        <div className="flex justify-end border-b border-slate-200/80 bg-white/80 px-4 py-2 backdrop-blur-sm">
          <TextSizeToolbarControl compact lightBackground />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06),0_12px_24px_-4px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4 sm:px-8">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
                Official portal · Authenticated access
              </p>
            </div>

            <div className="grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,280px)_1fr] lg:gap-12 lg:py-12">
              <GovLoginBranding />

              <div className="flex min-h-0 flex-col justify-center space-y-8">
                <header className="space-y-3 border-b border-slate-100 pb-8">
                  <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-[1.65rem]">
                    HUDD Integrated Dashboard
                  </h1>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Sign in using your department-issued credentials via the secure single sign-on service. This system is
                    restricted to authorised officers and staff of the Housing &amp; Urban Development Department.
                  </p>
                </header>

                {errorInfo && (
                  <div
                    role="alert"
                    className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
                    <div className="space-y-1">
                      <p className="font-semibold">{errorInfo.title}</p>
                      <p>{errorInfo.body}</p>
                    </div>
                  </div>
                )}

                <LoginGrid />

                <footer className="space-y-3 border-t border-slate-100 pt-6 text-xs leading-relaxed text-slate-500">
                  <p>
                    By continuing, you acknowledge that access is monitored and must comply with applicable Government
                    of India and State IT policies.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="font-medium text-slate-600">Need help? Contact your departmental IT / SSO administrator.</p>
                    <p className="text-[10px] font-semibold text-slate-400">Version {currentVersion}</p>
                  </div>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
