import { Metadata } from "next";
import GovLoginBranding from "@/components/GovLoginBranding";
import LoginGrid from "@/components/LoginGrid";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";

export const metadata: Metadata = {
  title: "Secure Login | HUDD Dashboard",
  description:
    "Official access portal for the Housing & Urban Development Department, Government of Odisha — authenticated entry only.",
};

export default function Page() {
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

                <LoginGrid />

                <footer className="space-y-3 border-t border-slate-100 pt-6 text-xs leading-relaxed text-slate-500">
                  <p>
                    By continuing, you acknowledge that access is monitored and must comply with applicable Government
                    of India and State IT policies.
                  </p>
                  <p className="font-medium text-slate-600">Need help? Contact your departmental IT / SSO administrator.</p>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
