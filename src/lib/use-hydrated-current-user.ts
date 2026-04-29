"use client";

import { useEffect, useState } from "react";
import type { MockUser } from "@/types";
import { getCurrentUser, refreshSessionUserFromApi } from "@/lib/auth";

/** Loads `/api/v1/rbac/me` once on mount and returns the current signed-in user (with DB permissions). */
export function useHydratedCurrentUser() {
  const [user, setUser] = useState<MockUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSessionUserFromApi();
      if (!cancelled) setUser(getCurrentUser());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
