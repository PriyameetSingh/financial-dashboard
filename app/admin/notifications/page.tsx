'use client';

import React, { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { Permission } from '@/lib/auth';
import { useRequireAnyPermission } from '@/src/lib/route-guards';
import SearchableUserSelector from '@/src/components/ui/SearchableUserSelector';
import {
  Loader2, Save, Send, AlertTriangle,
  Play, Pause, Check, Clock, ShieldAlert, Settings
} from 'lucide-react';
import type { SessionUser } from '@/types';
import { withNextBasePath } from '@/lib/next-base-path';
import { fetchDirectoryUsers } from '@/src/lib/directory-users';
import ToggleSwitch from "@/src/components/ui/ToggleSwitch";

export default function AdminNotificationsPage() {
  // Route Guard: requires MANAGE_NOTIFICATION_CONFIG
  const sessionUser = useRequireAnyPermission(
    [Permission.MANAGE_NOTIFICATION_CONFIG],
    '/dashboard'
  );

  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<SessionUser[]>([]);

  // Loading & Action states
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendingManual, setSendingManual] = useState(false);
  const [manualError, setManualError] = useState('');

  // Manual notification form state
  const [manualForm, setManualForm] = useState({
    recipientUserId: '',
    title: '',
    content: '',
    priority: 'Medium',
    link: ''
  });

  // Fetch configs and user directory
  const loadData = async () => {
    try {
      setLoadingConfig(true);

      const configRes = await fetch(withNextBasePath('/api/v1/admin/notification-config'), { credentials: 'include' });
      if (configRes.ok) {
        const data = await configRes.json();
        setConfigs(data.configs || {});
      }

      const roster = await fetchDirectoryUsers();
      setUsers(roster);
    } catch (e) {
      console.error('Error loading admin notification data:', e);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    if (sessionUser) {
      loadData();
    }
  }, [sessionUser]);

  if (!sessionUser) return null;

  // Toggle individual config flags
  const handleToggle = (key: string) => {
    setConfigs(prev => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true'
    }));
  };

  // Update text values (like quiet hours time inputs)
  const handleTextChange = (key: string, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Submit global configurations updates
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingConfig(true);
      setConfigSuccess(false);
      const res = await fetch(withNextBasePath('/api/v1/admin/notification-config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || configs);
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving configs:', error);
    } finally {
      setSavingConfig(false);
    }
  };

  // Fast pause handlers
  const handlePauseNotifications = async (hours: number) => {
    const pauseUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    const updated = {
      ...configs,
      SYSTEM_NOTIFICATIONS_ENABLED: 'true',
      SYSTEM_NOTIFICATIONS_DISABLED_UNTIL: pauseUntil.toISOString()
    };

    try {
      setSavingConfig(true);
      const res = await fetch(withNextBasePath('/api/v1/admin/notification-config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs);
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error pausing notifications:', error);
    } finally {
      setSavingConfig(false);
    }
  };

  // Resume notifications handler
  const handleResumeNotifications = async () => {
    const updated = {
      ...configs,
      SYSTEM_NOTIFICATIONS_ENABLED: 'true',
      SYSTEM_NOTIFICATIONS_DISABLED_UNTIL: ''
    };

    try {
      setSavingConfig(true);
      const res = await fetch(withNextBasePath('/api/v1/admin/notification-config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs);
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error resuming notifications:', error);
    } finally {
      setSavingConfig(false);
    }
  };

  // Send manual notification form submission
  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    setSendSuccess(false);

    if (!manualForm.recipientUserId) {
      setManualError('Please select a recipient.');
      return;
    }
    if (!manualForm.title.trim() || !manualForm.content.trim()) {
      setManualError('Title and message are required.');
      return;
    }

    try {
      setSendingManual(true);
      const res = await fetch(withNextBasePath('/api/v1/notifications/send-manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm),
        credentials: 'include'
      });

      if (res.ok) {
        setSendSuccess(true);
        setManualForm({
          recipientUserId: '',
          title: '',
          content: '',
          priority: 'Medium',
          link: ''
        });
        setTimeout(() => setSendSuccess(false), 4000);
      } else {
        const data = await res.json();
        setManualError(data.detail || 'Failed to send notification.');
      }
    } catch (error) {
      console.error('Error sending manual notification:', error);
      setManualError('Failed to send due to network issue.');
    } finally {
      setSendingManual(false);
    }
  };

  // Helper to check if system is currently paused/disabled
  const getSystemStatus = () => {
    if (configs.SYSTEM_NOTIFICATIONS_ENABLED === 'false') {
      return { label: 'Globally Disabled', color: 'text-[var(--ax-status-critical)] ax-fill-critical/10 border-[var(--ax-status-critical)]/20' };
    }
    const disabledUntilStr = configs.SYSTEM_NOTIFICATIONS_DISABLED_UNTIL;
    if (disabledUntilStr) {
      const until = new Date(disabledUntilStr);
      if (!isNaN(until.getTime()) && until > new Date()) {
        return {
          label: `Paused until ${until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          color: 'ax-tone-warning ax-fill-warning/10 border-[var(--ax-status-warning)]/20'
        };
      }
    }
    return { label: 'Active', color: 'ax-tone-ok ax-fill-ok/10 border-[var(--ax-status-ok)]/20' };
  };

  const statusInfo = getSystemStatus();

  return (
    <AppShell title="Notification Controls">
      {loadingConfig ? (
        <div className="flex h-[60vh] flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--ax-muted)]" />
          <span className="text-sm text-[var(--ax-muted)] mt-2">Loading configuration settings...</span>
        </div>
      ) : (
        <div className="space-y-6 px-6 py-6 max-w-7xl mx-auto">
          {/* Header section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ax-muted)]">Administration</p>
              <h1 className="text-2xl font-semibold text-[var(--color-text)]">Notification Center</h1>
              <p className="mt-1 text-sm text-[var(--ax-muted)]">
                Manage global notification toggles, quiet hour schedules, and custom alerts.
              </p>
            </div>

            {/* Status indicator */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${statusInfo.color}`}>
              <span className="h-2 w-2 rounded-full bg-current" />
              Status: {statusInfo.label}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">

            {/* Column 1: System Settings */}
            <div className="space-y-6">

              {/* Master Control Panel */}
              <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 space-y-4">
                <h3 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 ax-tone-warning" />
                  Service Master Controls
                </h3>
                <p className="text-xs text-[var(--ax-muted)]">
                  Deactivate or pause notifications globally during high-load operations or system testing.
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  {/* Master Toggle */}
                  <button
                    onClick={() => {
                      setConfigs(prev => ({
                        ...prev,
                        SYSTEM_NOTIFICATIONS_ENABLED: prev.SYSTEM_NOTIFICATIONS_ENABLED === 'true' ? 'false' : 'true'
                      }));
                    }}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition outline-none ${configs.SYSTEM_NOTIFICATIONS_ENABLED === 'true'
                      ? 'bg-[var(--color-text)] text-[var(--color-bg)] border-[var(--color-text)]'
                      : 'ax-fill-critical/10 border-[var(--ax-status-critical)]/20 text-[var(--ax-status-critical)]'
                      }`}
                    type="button"
                  >
                    {configs.SYSTEM_NOTIFICATIONS_ENABLED === 'true' ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        Kill All Notifications
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Enable Master Service
                      </>
                    )}
                  </button>

                  {/* Temporary Pauses */}
                  {configs.SYSTEM_NOTIFICATIONS_ENABLED === 'true' && (
                    <>
                      {configs.SYSTEM_NOTIFICATIONS_DISABLED_UNTIL ? (
                        <button
                          onClick={handleResumeNotifications}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--color-divider)] text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-divider)] transition outline-none"
                          type="button"
                        >
                          <Play className="h-3.5 w-3.5 ax-tone-ok" />
                          Resume Now
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handlePauseNotifications(1)}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--color-divider)] text-[var(--ax-text-secondary)] hover:bg-[var(--color-surface)] transition outline-none"
                            type="button"
                          >
                            Pause 1 Hr
                          </button>
                          <button
                            onClick={() => handlePauseNotifications(4)}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--color-divider)] text-[var(--ax-text-secondary)] hover:bg-[var(--color-surface)] transition outline-none"
                            type="button"
                          >
                            Pause 4 Hrs
                          </button>
                          <button
                            onClick={() => handlePauseNotifications(24)}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--color-divider)] text-[var(--ax-text-secondary)] hover:bg-[var(--color-surface)] transition outline-none"
                            type="button"
                          >
                            Pause 24 Hrs
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Quiet Hours Settings */}
              <form onSubmit={handleSaveConfig} className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 space-y-4">
                <h3 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
                  <Clock className="h-5 w-5 ax-tone-accent" />
                  Quiet Hours (Sleep Mode)
                </h3>
                <p className="text-xs text-[var(--ax-muted)]">
                  Route non-urgent alerts to storage during quiet hours. High-priority and Critical alerts bypass sleep mode.
                </p>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)]">
                  <div>
                    <div className="text-xs font-medium text-[var(--color-text)]">Enable Sleep Mode</div>
                    <div className="text-[10px] text-[var(--ax-muted)] mt-0.5">Enforce sleep hours for channels</div>
                  </div>
                  {/* The shared switch, not a hand-rolled one. Both of the
                      toggles on this screen were bare `<button>`s: no
                      `role="switch"`, no `aria-checked`, and a visible label in
                      a sibling div that nothing associated them with — so a
                      screen reader announced twelve identical unnamed buttons. */}
                  <ToggleSwitch
                    checked={configs.QUIET_HOURS_ENABLED === 'true'}
                    onChange={() => handleToggle('QUIET_HOURS_ENABLED')}
                    label="Enable Sleep Mode"
                  />
                </div>

                {configs.QUIET_HOURS_ENABLED === 'true' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--ax-muted)] font-semibold mb-1">
                        Quiet Hours Start
                      </label>
                      <input
                        type="text"
                        value={configs.QUIET_HOURS_START || ''}
                        onChange={e => handleTextChange('QUIET_HOURS_START', e.target.value)}
                        placeholder="17:30"
                        className="w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--ax-muted)] font-semibold mb-1">
                        Quiet Hours End
                      </label>
                      <input
                        type="text"
                        value={configs.QUIET_HOURS_END || ''}
                        onChange={e => handleTextChange('QUIET_HOURS_END', e.target.value)}
                        placeholder="10:00"
                        className="w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--color-text)] text-[var(--color-bg)] px-4 py-2 text-xs font-semibold hover:opacity-95 transition disabled:opacity-50 outline-none"
                  >
                    {savingConfig ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Settings
                  </button>
                  {configSuccess && (
                    <span className="flex items-center gap-1 text-xs ax-tone-ok font-medium">
                      <Check className="h-3.5 w-3.5" />
                      Settings Saved!
                    </span>
                  )}
                </div>
              </form>

              {/* Event Trigger Toggles */}
              <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 space-y-4">
                <h3 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
                  <Settings className="h-5 w-5 ax-tone-accent" />
                  Automated Event Triggers
                </h3>
                <p className="text-xs text-[var(--ax-muted)]">
                  Toggle which system workflows trigger automated alerts to performers and reviewers.
                </p>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {[
                    { key: 'TRIGGER_ACTION_ITEM_ASSIGNED', label: 'Action Item: Assign', desc: 'When performer is assigned a task' },
                    { key: 'TRIGGER_ACTION_ITEM_REASSIGNED', label: 'Action Item: Reassign', desc: 'When performers are reassigned' },
                    { key: 'TRIGGER_ACTION_ITEM_UNASSIGNED', label: 'Action Item: Unassign', desc: 'When performer is unassigned' },
                    { key: 'TRIGGER_ACTION_ITEM_UPDATE', label: 'Action Item: Updates', desc: 'Broadcast notes to concerned owners' },
                    { key: 'TRIGGER_ACTION_ITEM_REVIEW_REQUEST', label: 'Action Item: Review request', desc: 'When submitted for reviewer approval' },
                    { key: 'TRIGGER_ACTION_ITEM_COMPLETED', label: 'Action Item: Completed', desc: 'When review is approved' },
                    { key: 'TRIGGER_ACTION_ITEM_REJECTED', label: 'Action Item: Rejected', desc: 'When revision is requested' },
                    { key: 'TRIGGER_KPI_ASSIGNED', label: 'KPI: Assignment', desc: 'When creator assigns performers/reviewers' },
                    { key: 'TRIGGER_KPI_REASSIGNED', label: 'KPI: Reassignment', desc: 'When performer groups change' },
                    { key: 'TRIGGER_KPI_SUBMITTED', label: 'KPI: Submission', desc: 'When data is submitted' },
                    { key: 'TRIGGER_KPI_REVIEW_DECISION', label: 'KPI: Review Decision', desc: 'When approved/rejected' }
                  ].map(trigger => (
                    <div key={trigger.key} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)]">
                      <div>
                        <div className="text-xs font-medium text-[var(--color-text)]">{trigger.label}</div>
                        <div className="text-[10px] text-[var(--ax-muted)] mt-0.5">{trigger.desc}</div>
                      </div>
                      <ToggleSwitch
                        checked={configs[trigger.key] === 'true'}
                        onChange={() => handleToggle(trigger.key)}
                        label={trigger.label}
                      />
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--color-text)] text-[var(--color-bg)] px-4 py-2 text-xs font-semibold hover:opacity-95 transition disabled:opacity-50 outline-none"
                  type="button"
                >
                  {savingConfig ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save Toggles
                </button>
              </div>

            </div>

            {/* Column 2: Manual Notification Sender */}
            <div>
              <form onSubmit={handleSendManual} className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 space-y-4">
                <h3 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
                  <Send className="h-5 w-5 ax-tone-ok" />
                  Manual Notification Dispatcher
                </h3>
                <p className="text-xs text-[var(--ax-muted)]">
                  Send a custom dashboard alert to a specific officer immediately.
                </p>

                {manualError && (
                  <div className="p-3 text-xs text-[var(--ax-status-critical)] ax-fill-critical/10 border border-[var(--ax-status-critical)]/20 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {manualError}
                  </div>
                )}

                {/* Recipient Search selector */}
                <div>
                  <SearchableUserSelector
                    users={users}
                    value={manualForm.recipientUserId}
                    onChange={(val) => setManualForm(prev => ({ ...prev, recipientUserId: val }))}
                    label="Recipient Officer"
                    placeholder="Search and select recipient..."
                    required
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--ax-muted)] font-semibold mb-1">
                    Notification Title
                  </label>
                  <input
                    type="text"
                    value={manualForm.title}
                    onChange={e => setManualForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter short title..."
                    className="w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none"
                    required
                  />
                </div>

                {/* Content Message Body */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--ax-muted)] font-semibold mb-1">
                    Message Body
                  </label>
                  <textarea
                    value={manualForm.content}
                    onChange={e => setManualForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Write details of the alert..."
                    rows={4}
                    className="w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none resize-none"
                    required
                  />
                </div>

                {/* Priority Selection */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--ax-muted)] font-semibold mb-1">
                    Alert Priority
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {['Low', 'Medium', 'High', 'Critical'].map(level => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setManualForm(prev => ({ ...prev, priority: level }))}
                        className={`py-2 text-xs rounded-lg border font-semibold outline-none transition ${manualForm.priority === level
                          ? 'bg-[var(--color-text)] text-[var(--color-bg)] border-[var(--color-text)]'
                          : 'border-[var(--color-divider)] text-[var(--ax-text-secondary)] bg-[var(--color-surface)] hover:bg-[var(--color-divider)]'
                          }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Navigation Link */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--ax-muted)] font-semibold mb-1">
                    Action Link (Optional Relative URL)
                  </label>
                  <input
                    type="text"
                    value={manualForm.link}
                    onChange={e => setManualForm(prev => ({ ...prev, link: e.target.value }))}
                    placeholder="e.g. /my-tasks"
                    className="w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={sendingManual}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--color-text)] text-[var(--color-bg)] px-4 py-2 text-xs font-semibold hover:opacity-95 transition disabled:opacity-50 outline-none"
                  >
                    {sendingManual ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Dispatch Alert
                  </button>
                  {sendSuccess && (
                    <span className="flex items-center gap-1 text-xs ax-tone-ok font-medium">
                      <Check className="h-3.5 w-3.5" />
                      Alert Sent successfully!
                    </span>
                  )}
                </div>
              </form>
            </div>

          </div>
        </div>
      )}
    </AppShell>
  );
}
