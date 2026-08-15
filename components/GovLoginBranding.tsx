import { HUDD_LOGO_PUBLIC_PATH } from "@/lib/hudd-logo";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantConfig } from "@/lib/tenant-config";

const LOGO_SRC = withNextBasePath(HUDD_LOGO_PUBLIC_PATH);

export default function GovLoginBranding() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 pb-8 text-center lg:pb-0 lg:pr-10"
      style={{ boxShadow: "inset 0 -1px 0 var(--color-divider)" }}
    >
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
        <p className="text-[11px] font-medium" style={{ color: "var(--ax-muted)" }}>
          {tenantConfig().pdfHeaderLine}
        </p>
        <p className="max-w-[16rem] text-sm font-semibold leading-snug">
          Housing &amp; Urban Development Department
        </p>
      </div>
    </div>
  );
}
