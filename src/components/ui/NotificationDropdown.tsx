'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, Check, Loader2, FileText, 
  TrendingUp, AlertTriangle, MessageSquare, ShieldAlert, X
} from 'lucide-react';
import { withNextBasePath } from "@/lib/next-base-path";
import { authApiBasePath } from "@/lib/auth-api-path";
import { clearCurrentUser } from "@/lib/auth";

interface Notification {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  link: string | null;
  createdAt: string;
}

interface NotificationDropdownProps {
  align?: 'left' | 'right';
}

function formatRelativeTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 0) return 'Just now'; // Handle minor clock drift
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationDropdown({ align = 'right' }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signingOutRef = useRef(false);
  const router = useRouter();

  const redirectToLogout = () => {
    if (signingOutRef.current || typeof window === 'undefined') return;
    signingOutRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearCurrentUser();
    const base = process.env.__NEXT_ROUTER_BASEPATH ?? "";
    const loginPath = base ? `${base}/login` : "/login";
    const callbackUrl = `${loginPath}?error=session_invalidated`;
    window.location.assign(
      `${authApiBasePath()}/keycloak/logout?${new URLSearchParams({ callbackUrl })}`,
    );
  };

  // Fetch notifications from the API
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch(withNextBasePath('/api/v1/notifications'));
      if (res.status === 401) {
        // Session invalidated server-side (e.g. admin reset password). Stop
        // polling and force federated sign-out so the stale cookie is cleared.
        redirectToLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        const unread = (data.notifications || []).filter((n: Notification) => n.status === 'UNREAD').length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Poll for new notifications count every 30 seconds
  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(withNextBasePath(`/api/v1/notifications/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READ' }),
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, status: 'READ' } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch(withNextBasePath('/api/v1/notifications'), { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, status: 'READ' })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    setIsOpen(false);
    
    // Mark as read if currently unread
    if (notification.status === 'UNREAD') {
      try {
        await fetch(withNextBasePath(`/api/v1/notifications/${notification.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'READ' }),
        });
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Error marking notification as read on click:', error);
      }
    }

    // Navigate to link
    if (notification.link) {
      router.push(notification.link);
    }
  };

  // Get icon based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'ACTION_ITEM_ASSIGNED':
      case 'ACTION_ITEM_REASSIGNED':
      case 'ACTION_ITEM_UNASSIGNED':
        return <FileText className="h-4 w-4 text-[var(--text-secondary)]" />;
      case 'ACTION_ITEM_UPDATE':
      case 'ACTION_ITEM_REVIEW_REQUEST':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'ACTION_ITEM_COMPLETED':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'ACTION_ITEM_REJECTED':
        return <X className="h-4 w-4 text-[var(--alert-critical)]" />;
      case 'KPI_ASSIGNED':
      case 'KPI_REASSIGNED':
      case 'KPI_SUBMITTED':
        return <TrendingUp className="h-4 w-4 text-purple-500" />;
      case 'KPI_REVIEW_DECISION':
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'LAPSE_RISK':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'AGENT_ALERT':
        return <ShieldAlert className="h-4 w-4 text-[var(--alert-critical)]" />;
      default:
        return <Bell className="h-4 w-4 text-[var(--text-secondary)]" />;
    }
  };

  // Get border styling based on priority
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'border-l-4 border-l-[var(--alert-critical)]';
      case 'High':
        return 'border-l-4 border-l-orange-500';
      case 'Medium':
        return 'border-l-4 border-l-blue-500';
      default:
        return 'border-l-4 border-l-gray-300';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell trigger button */}
      <button
        onClick={toggleDropdown}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--sidebar-text-primary)] outline-none"
        aria-label="Notifications"
        type="button"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--alert-critical)] text-[9px] font-bold text-white leading-none">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Popover list */}
      {isOpen && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-[60] mt-2 w-80 sm:w-96 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl overflow-hidden`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-bottom pb-2 border-b border-[var(--border)]">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] uppercase tracking-wider text-blue-500 hover:text-blue-600 transition outline-none font-semibold"
                type="button"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List contents */}
          <div className="mt-2 max-h-[350px] overflow-y-auto custom-scrollbar">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)] mt-2">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--text-muted)]">
                No new notifications.
              </div>
            ) : (
              <ul className="space-y-2">
                {notifications.map(item => (
                  <li
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`group relative flex gap-3 rounded-lg border border-[var(--border)] p-3 cursor-pointer transition hover:bg-[var(--bg-card)] ${
                      item.status === 'UNREAD' ? 'bg-[var(--bg-hover)]' : 'bg-transparent'
                    } ${getPriorityStyle(item.priority)}`}
                  >
                    {/* Icon container */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border)]">
                      {getNotificationIcon(item.type)}
                    </div>

                    {/* Content area */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-xs truncate ${item.status === 'UNREAD' ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                          {item.title}
                        </p>
                        <span className="text-[9px] text-[var(--text-muted)] shrink-0">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] line-clamp-2">
                        {item.content}
                      </p>
                    </div>

                    {/* Inline Actions */}
                    {item.status === 'UNREAD' && (
                      <button
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        className="absolute right-2 top-2 p-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition hover:text-green-500"
                        title="Mark as read"
                        type="button"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
