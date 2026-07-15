"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import clsx from "clsx";

export interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
  tooltipText?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  className,
  tooltipText,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  // Close dropdown on click outside
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

  // Close tooltip on click outside (useful for mobile)
  useEffect(() => {
    if (!showTooltip) return;
    const handleOutsideTooltipClick = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideTooltipClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideTooltipClick);
    };
  }, [showTooltip]);

  return (
    <div ref={rootRef} className={clsx("relative inline-flex items-center gap-1.5 w-full md:w-auto", className)}>
      <div className="relative flex-1 md:flex-none">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full md:w-auto items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/15 transition-all text-left"
        >
          <span className="truncate">{selectedOption ? selectedOption.label : ""}</span>
          <ChevronDown className={clsx("h-4 w-4 text-[var(--text-muted)] shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <ul
            className="absolute left-0 mt-1 max-h-60 w-full min-w-[160px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl z-40 focus:outline-none"
            role="listbox"
          >
            {options.map((option) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors",
                    option.value === value && "bg-[var(--bg-hover)] font-medium"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tooltipText && (
        <div ref={tooltipRef} className="relative flex items-center shrink-0">
          <button
            type="button"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none p-1 rounded-full hover:bg-[var(--bg-hover)]"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(!showTooltip);
            }}
            aria-label="Filter details"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {showTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl shadow-xl text-xs text-[var(--text-primary)] z-50 whitespace-normal leading-relaxed animate-fade-in">
              {tooltipText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
