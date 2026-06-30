"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import RoleBadge from "@/src/components/ui/RoleBadge";
import { withNextBasePath } from "@/lib/next-base-path";

export default function ProfilePage() {
  const user = useRequireAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const initials = useMemo(() => {
    if (!user) return "HN";
    return user.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("");
  }, [user]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(withNextBasePath("/api/v1/profile/change-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Failed to update password");
      } else {
        setSuccess("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <AppShell title="My Profile">
      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-xl font-semibold text-[var(--text-primary)]">
            {initials}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">HUDD Officer</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{user.name}</h1>
            <p className="text-sm text-[var(--text-muted)]">{user.department}</p>
            {user.designationName?.trim() ? (
              <p className="mt-1 text-sm text-[var(--text-primary)]">{user.designationName}</p>
            ) : null}
          </div>
          <RoleBadge role={user.role} size="md" />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 max-w-xl">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Change Password</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Update your account password. You will continue to remain logged in.
          </p>

          <form onSubmit={handlePasswordChange} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg bg-[rgba(255,59,59,0.1)] border border-[rgba(255,59,59,0.2)] p-3 text-xs text-[var(--alert-critical)]">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-500">
                {success}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--text-muted)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--text-muted)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--text-muted)] focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
