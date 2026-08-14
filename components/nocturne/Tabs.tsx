"use client";

import { useRef, type ReactNode } from "react";

/**
 * A tab list.
 *
 * The ARIA tabs pattern is one of the few places where correct keyboard
 * behaviour is genuinely non-obvious and genuinely required: arrow keys move
 * between tabs, Home/End jump to the ends, and only the selected tab is in the
 * tab order (roving `tabindex`), so Tab moves out of the tab list into the
 * panel rather than through every tab in turn. All of that is implemented here
 * once so no page has to.
 *
 * The panel itself is the caller's; `panelId` wires `aria-controls` to it and
 * the caller is expected to put `role="tabpanel"` and `aria-labelledby` on the
 * matching element.
 */
export type TabItem = {
  id: string;
  label: ReactNode;
  panelId: string;
};

export type TabsProps = {
  label: string;
  tabs: readonly TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
};

export default function Tabs({ label, tabs, selectedId, onSelect, className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(currentIndex: number, delta: number) {
    const next = (currentIndex + delta + tabs.length) % tabs.length;
    const tab = tabs[next];
    onSelect(tab.id);
    refs.current[tab.id]?.focus();
  }

  return (
    <div className={["ax-tabs", className].filter(Boolean).join(" ")} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = tab.id === selectedId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={tab.id}
            className="ax-tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            // Roving tabindex: exactly one tab is reachable with Tab.
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); move(index, 1); }
              else if (event.key === "ArrowLeft") { event.preventDefault(); move(index, -1); }
              else if (event.key === "Home") { event.preventDefault(); move(0, 0); }
              else if (event.key === "End") { event.preventDefault(); move(tabs.length - 1, 0); }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
