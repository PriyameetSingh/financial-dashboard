import { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import GovLoginBranding from "@/components/GovLoginBranding";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";
import { withNextBasePath } from "@/lib/next-base-path";

export const metadata: Metadata = {
  title: "Sign-in problem | HUDD Dashboard",
  description:
    "Something went wrong while signing in to the Housing & Urban Development Department dashboard.",
};

type SearchParams = Promise<{ error?: string }>;

const FRIENDLY_MESSAGES: Record<string, { title: string; body: string }> = {
  OAuthCallbackError: {
    title: "The sign-in service returned an error",
    body: "This usually happens when the sign-in session expired or was replayed — for example after refreshing or going back during login. Please try signing in again.",
  },
  OAuthCreateAccountError: {
    title: "We couldn't complete your sign-in",
    body: "There was a problem creating your account from the sign-in service. Please try again, and contact your IT administrator if it keeps happening.",
  },
  OAuthAccountNotLinked: {
    title: "This account is already linked differently",
    body: "You're signed in with an identity that's linked to a different account. Sign out of the identity provider and try again, or contact your IT administrator.",
  },
  AccessDenied: {
    title: "Access denied",
    body: "You don't have access to this dashboard. If you believe this is a mistake, contact your departmental IT administrator.",
  },
  Configuration: {
    title: "Sign-in is not configured correctly",
    body: "The dashboard's authentication settings have a problem. Please contact your IT administrator.",
  },
  Default: {
    title: "Something went wrong during sign-in",
    body: "We couldn't complete your sign-in. Please try again, and contact your IT administrator if the problem continues.",
  },
};

export default async function AuthErrorPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const message = FRIENDLY_MESSAGES[error ?? ""] ?? FRIENDLY_MESSAGES.Default;
  const loginHref = withNextBasePath("/login");

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
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
                Official portal · Sign-in problem
              </p>
            </div>

            <div className="grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,280px)_1fr] lg:gap-12 lg:py-12">
              <GovLoginBranding />

              <div className="flex min-h-0 flex-col justify-center space-y-8">
                <header className="space-y-4 border-b border-slate-100 pb-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                  </div>
                  <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-[1.65rem]">
                    {message.title}
                  </h1>
                  <p className="text-sm leading-relaxed text-slate-600">{message.body}</p>
                  {error && (
                    <p className="text-[11px] font-mono text-slate-400">
                      Reference code: {error}
                    </p>
                  )}
                </header>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href={loginHref}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try signing in again
                  </Link>
                  <a
                    href={loginHref}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    Back to login
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>

                <footer className="space-y-3 border-t border-slate-100 pt-6 text-xs leading-relaxed text-slate-500">
                  <p>
                    If the problem continues, contact your departmental IT / SSO administrator and
                    share the reference code above.
                  </p>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
