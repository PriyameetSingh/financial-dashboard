import { HUDD_LOGO_PUBLIC_PATH } from "@/lib/hudd-logo";
import { withNextBasePath } from "@/lib/next-base-path";

const LOGO_SRC = withNextBasePath(HUDD_LOGO_PUBLIC_PATH);

export default function GovLoginBranding() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 border-b border-slate-200 pb-8 text-center lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10">
      <div className="relative w-full max-w-[200px] sm:max-w-[240px]">
        <img
          src={LOGO_SRC}
          alt="Housing and Urban Development Department, Government of Odisha"
          width={240}
          height={260}
          className="h-auto w-full object-contain"
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-slate-600">Government of Odisha</p>
        <p className="max-w-[16rem] text-sm font-semibold leading-snug text-slate-900">
          Housing &amp; Urban Development Department
        </p>
      </div>
    </div>
  );
}
