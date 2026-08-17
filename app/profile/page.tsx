"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import RoleBadge from "@/src/components/ui/RoleBadge";
import { withNextBasePath } from "@/lib/next-base-path";
import ConfirmDialog from "@/components/ConfirmDialog";
import { X, Eye, EyeOff } from "lucide-react";

export default function ProfilePage() {
  const user = useRequireAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(withNextBasePath("/api/v1/releases/current"))
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.release?.version) {
          setVersion(data.release.version);
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(() => {
    if (!user) return "HN";
    return user.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("");
  }, [user]);

  const openModal = () => {
    setSuccess("");
    setError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsConfirmOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
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

    setIsConfirmOpen(true);
  };

  const handleConfirmChange = async () => {
    setIsConfirmOpen(false);
    setLoading(true);
    setError("");

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
        setIsModalOpen(false);
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
        <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] text-xl font-semibold text-[var(--color-text)]">
            {initials}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--ax-muted)]">HUDD Officer</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{user.name}</h1>
            <p className="text-sm text-[var(--ax-muted)]">{user.department}</p>
            {user.designationName?.trim() ? (
              <p className="mt-1 text-sm text-[var(--color-text)]">{user.designationName}</p>
            ) : null}
          </div>
          <RoleBadge role={user.role} size="md" />
        </div>

        <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 max-w-xl">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Change Password</h2>
          <p className="mt-1 text-xs text-[var(--ax-muted)]">
            Update your account password. You will continue to remain logged in.
          </p>

          {success && (
            <div className="mt-4 rounded-lg ax-fill-ok/10 border border-[var(--ax-status-ok)]/20 p-3 text-xs ax-tone-ok">
              {success}
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={openModal}
              className="rounded-xl bg-[var(--color-text)] px-4 py-2.5 text-sm font-semibold text-[var(--color-bg)] hover:opacity-90 transition"
            >
              Change Password
            </button>
          </div>
        </div>

        {version && (
          <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 max-w-xl">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Application Version</h2>
            <p className="mt-1 text-xs text-[var(--ax-muted)]">
              HUDD Nexus Dashboard software details and release notes.
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-divider)]/50 pt-4">
              <span className="text-sm font-medium text-[var(--ax-text-secondary)]">Current Release</span>
              <span className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
                v{version}
              </span>
            </div>
            <div className="mt-6">
              <Link
                href="/changelog"
                className="inline-flex items-center text-sm font-semibold text-[var(--color-accent)] hover:underline"
              >
                View release history &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center ax-scrim px-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-8 shadow-2xl">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--ax-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-semibold text-[var(--color-text)]">Change Password</h2>
            <p className="mt-1 text-xs text-[var(--ax-muted)]">
              Update your account password. You will continue to remain logged in.
            </p>

            <form onSubmit={handleFormSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-[color-mix(in_srgb,_var(--ax-status-critical)_10%,_transparent)] border border-[color-mix(in_srgb,_var(--ax-status-critical)_20%,_transparent)] p-3 text-xs text-[var(--ax-status-critical)]">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ax-muted)] mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] pl-4 pr-11 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--ax-muted)] focus:ring-2 focus:ring-[var(--ax-muted)]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--ax-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition"
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ax-muted)] mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] pl-4 pr-11 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--ax-muted)] focus:ring-2 focus:ring-[var(--ax-muted)]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--ax-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ax-muted)] mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] pl-4 pr-11 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--ax-muted)] focus:ring-2 focus:ring-[var(--ax-muted)]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--ax-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-[var(--color-divider)] px-4 py-2.5 text-sm font-semibold text-[var(--ax-muted)] hover:bg-[var(--color-surface)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-[var(--color-text)] px-4 py-2.5 text-sm font-semibold text-[var(--color-bg)] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={isConfirmOpen}
        title="Confirm Password Change"
        message="Are you sure you want to change your password? This action cannot be undone."
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={handleConfirmChange}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </AppShell>
  );
}
