"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { clearCurrentUser } from "@/lib/auth";

export default function LogoutButton() {
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    try {
      clearCurrentUser();
      await signOut({ redirect: false });
      window.location.assign("/api/auth/keycloak/logout?callbackUrl=%2Flogin");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-secondary)]"
      onClick={handleLogout}
      type="button"
      disabled={pending}
      aria-label="Sign out"
    >
      <LogOut size={14} />
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
