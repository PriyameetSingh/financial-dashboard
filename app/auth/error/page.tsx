import { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import GovLoginBranding from "@/components/GovLoginBranding";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import NationalColourBand from "@/components/NationalColourBand";
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
                Official portal · Sign-in problem
              </p>
            </div>

            <div className="grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,280px)_1fr] lg:gap-12 lg:py-12">
              <GovLoginBranding />

              <div className="flex min-h-0 flex-col justify-center space-y-8">
                <header
                  className="space-y-4 pb-8"
                  style={{ boxShadow: "inset 0 -1px 0 var(--color-divider)" }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{
                      color: "var(--ax-status-warning)",
                      boxShadow: "inset 0 0 0 1px var(--ax-status-warning)",
                    }}
                  >
                    <AlertTriangle className="h-6 w-6" aria-hidden />
                  </div>
                  <h1 style={{ fontSize: 26, margin: 0 }}>{message.title}</h1>
                  <p className="ax-wz-hint" style={{ fontSize: 14 }}>
                    {message.body}
                  </p>
                  {error && (
                    <p className="text-[11px] font-mono" style={{ color: "var(--ax-muted)" }}>
                      Reference code: {error}
                    </p>
                  )}
                </header>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link href={loginHref} className="btn btn-primary px-5 py-3">
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Try signing in again
                  </Link>
                  <a href={loginHref} className="btn btn-secondary px-5 py-3">
                    Back to login
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                </div>

                <footer
                  className="space-y-3 pt-6 text-xs leading-relaxed"
                  style={{ boxShadow: "inset 0 1px 0 var(--color-divider)", color: "var(--ax-muted)" }}
                >
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
    </NocturneRoot>
  );
}
