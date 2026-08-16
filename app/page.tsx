"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import NocturneRoot from "@/components/nocturne/NocturneRoot";

/**
 * The root redirect.
 *
 * The card below is only on screen for the moment before the replace lands, but
 * it has to be inside a `NocturneRoot` all the same: the token layer is scoped to
 * `.noct`, so outside it `var(--color-bg)` resolves to nothing and the card paints
 * transparent text on a transparent ground. It read as a blank flash rather than
 * as a bug, which is why it survived the whole reskin — found at Gate F by
 * walking every page for a Nocturne scope rather than by looking at any of them.
 */
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <NocturneRoot className="flex h-screen w-full items-center justify-center bg-[var(--color-bg)]">
      <div className="card elev-sm px-6 py-5 text-sm font-medium">Loading HUDD workspace...</div>
    </NocturneRoot>
  );
}
