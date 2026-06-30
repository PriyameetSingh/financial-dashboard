"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, createElement } from "react";
import type { ComponentProps, ComponentType } from "react";
import {
  getCurrentUser,
  hasPermission,
  type SessionUser,
  Permission,
  refreshSessionUserFromApi,
  UserRole,
  canAccessMyTasksHub,
} from "@/lib/auth";
import { fetchActionItems } from "@/src/lib/services/actionItemService";
import { hasPendingAssignedActionItems } from "@/src/lib/actionItemAssignment";

export function useRequireAuth(redirectTo = "/login") {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSessionUserFromApi();
      if (cancelled) return;
      const currentUser = getCurrentUser();
      setUser(currentUser);
      if (!currentUser) {
        router.replace(redirectTo);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  return useMemo(() => user, [user]);
}

export function useRequireRole(roles: UserRole[] = [], redirectTo = "/dashboard") {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const rolesKey = roles.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSessionUserFromApi();
      if (cancelled) return;
      const currentUser = getCurrentUser();
      if (!currentUser) {
        router.replace("/login");
        setUser(null);
        return;
      }
      const allowedRoles = rolesKey ? (rolesKey.split(",") as UserRole[]) : [];
      if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
        router.replace(redirectTo);
        setUser(null);
        return;
      }
      setUser(currentUser);
    })();
    return () => {
      cancelled = true;
    };
  }, [rolesKey, redirectTo, router]);

  return useMemo(() => user, [user]);
}

export function useRequireAnyPermission(permissions: Permission[], redirectTo = "/dashboard") {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const permKey = permissions.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSessionUserFromApi();
      if (cancelled) return;
      const currentUser = getCurrentUser();
      if (!currentUser) {
        router.replace("/login");
        setUser(null);
        return;
      }
      const list = permKey ? (permKey.split(",") as Permission[]) : [];
      const allowed = list.some((p) => hasPermission(currentUser, p));
      if (!allowed) {
        router.replace(redirectTo);
        setUser(null);
        return;
      }
      setUser(currentUser);
    })();
    return () => {
      cancelled = true;
    };
  }, [permKey, redirectTo, router]);

  return useMemo(() => user, [user]);
}

/** /my-tasks — allowed when hub permissions apply, or when the user has pending decision items assigned to them. */
export function useRequireMyTasksHub(redirectTo = "/dashboard") {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSessionUserFromApi();
      if (cancelled) return;
      const currentUser = getCurrentUser();
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      if (canAccessMyTasksHub(currentUser)) {
        setUser(currentUser);
        return;
      }
      try {
        const items = await fetchActionItems();
        if (cancelled) return;
        if (hasPendingAssignedActionItems(items, currentUser)) {
          setUser(currentUser);
          return;
        }
      } catch {
        /* fall through to redirect */
      }
      if (!cancelled) router.replace(redirectTo);
    })();
    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  return useMemo(() => user, [user]);
}

export function withRoleGuard(
  Component: ComponentType<any>,
  roles: UserRole[] = [],
  redirectTo = "/dashboard"
) {
  return function GuardedComponent(props: ComponentProps<ComponentType<any>>) {
    useRequireRole(roles, redirectTo);
    return createElement(Component, props);
  };
}
