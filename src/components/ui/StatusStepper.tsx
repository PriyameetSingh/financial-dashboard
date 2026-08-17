"use client";

import React, { useState, useEffect, useRef } from "react";
import { ActionItem, ActionItemStatus } from "@/types";
import clsx from "clsx";

const STATUS_STEPS: ActionItemStatus[] = ["OPEN", "IN_PROGRESS", "PROOF_UPLOADED", "UNDER_REVIEW", "COMPLETED"];

interface StatusStepperProps {
  item: ActionItem;
  className?: string;
}

export default function StatusStepper({ item, className }: StatusStepperProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentStatus = item.status === "OVERDUE" ? "OPEN" : item.status;
  const currentIndex = STATUS_STEPS.indexOf(currentStatus);

  useEffect(() => {
    // Check if the current device/browser supports hover capability
    setIsHoverDevice(window.matchMedia("(hover: hover)").matches);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (isHoverDevice) {
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (isHoverDevice) {
      setIsOpen(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div
      ref={rootRef}
      className={clsx("relative inline-block", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--ax-divider-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold uppercase leading-none tracking-[0.15em] text-[var(--color-text)] hover:border-[var(--color-text)] transition-all focus:outline-none"
      >
        <span
          className={clsx(
            "w-2 h-2 rounded-full animate-pulse",
            item.status === "COMPLETED"
              ? "bg-[var(--ax-status-ok)]"
              : item.status === "OVERDUE"
              ? "bg-[var(--ax-status-critical)]"
              : "bg-[var(--ax-status-warning)]"
          )}
        />
        <span>{item.status.replace(/_/g, " ")}</span>
        <svg
          className={clsx(
            "w-3.5 h-3.5 text-[var(--ax-text-secondary)] transition-transform duration-200",
            isOpen && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={clsx(
            "absolute right-0 bottom-full mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--ax-divider-strong)] bg-[var(--color-surface)] p-3 shadow-xl z-50 transition-all w-max max-w-[85vw] sm:max-w-[400px]"
          )}
        >
          {STATUS_STEPS.map((step, idx) => {
            const isDone = idx <= currentIndex;
            const isCurrent = idx === currentIndex;
            return (
              <div key={step} className="flex items-center">
                <span
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] leading-none whitespace-nowrap",
                    isCurrent
                      ? "border-[var(--ax-status-warning)] bg-[color-mix(in_srgb,_var(--ax-status-warning)_12%,_transparent)] text-[var(--ax-status-warning)]"
                      : isDone
                      ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-surface)]"
                      : "border-[var(--color-divider)] text-[var(--ax-muted)]"
                  )}
                >
                  {step.replace(/_/g, " ")}
                </span>
                {idx < STATUS_STEPS.length - 1 && (
                  <svg
                    className={clsx(
                      "mx-1 w-3 h-3 shrink-0",
                      isDone ? "text-[var(--color-text)]" : "text-[var(--color-divider)]"
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
