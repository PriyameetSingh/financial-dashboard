"use client";

import { TextField } from "@/components/nocturne";
import { FISCAL_STARTS, NUMBER_FORMATS } from "@/lib/onboarding/draft";
import type { StepProps } from "../types";

/**
 * Step 3 — how amounts and dates should read.
 *
 * The preview is the point of this step. "Indian grouping" means nothing until
 * you see ₹ 48,12,345 beside ₹ 4,812,345, and getting this wrong is the kind of
 * error that survives into a printed report pack before anyone notices.
 */
const NUMBER_LABELS: Record<(typeof NUMBER_FORMATS)[number], string> = {
  in: "Indian grouping · lakh and crore",
  intl: "International grouping · thousands",
  eu: "European grouping · euro",
};

const FISCAL_LABELS: Record<(typeof FISCAL_STARTS)[number], string> = {
  apr: "1 April — the Indian financial year",
  jan: "1 January — the calendar year",
  jul: "1 July",
};

function preview(format: (typeof NUMBER_FORMATS)[number], fiscal: (typeof FISCAL_STARTS)[number]): string {
  const amount =
    format === "eu" ? "€ 48.12.345" : format === "in" ? "₹ 48,12,345" : "₹ 4,812,345";
  const year =
    fiscal === "apr" ? "FY 2026–27 begins 1 Apr" : fiscal === "jan" ? "FY 2027 begins 1 Jan" : "FY 2026–27 begins 1 Jul";
  return `${amount} · ${year}`;
}

export default function StepLocale({ draft, update }: StepProps) {
  return (
    <div className="ax-wz-fields">
      <TextField
        id="wz-locale"
        label="Language and region"
        value={draft.locale}
        onChange={(event) => update({ locale: event.target.value })}
        spellCheck={false}
        hint="A BCP-47 tag, such as en-IN or hi-IN."
      />

      <TextField
        id="wz-timezone"
        label="Time zone"
        value={draft.timezone}
        onChange={(event) => update({ timezone: event.target.value })}
        spellCheck={false}
        hint="An IANA zone, such as Asia/Kolkata."
      />

      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          How amounts are grouped
        </legend>
        <div className="ax-wz-choices">
          {NUMBER_FORMATS.map((format) => (
            <label className="ax-wz-choice" key={format}>
              <input
                type="radio"
                name="wz-number"
                value={format}
                checked={draft.numberFormat === format}
                onChange={() => update({ numberFormat: format })}
              />
              <span className="ax-wz-choice-title">{NUMBER_LABELS[format]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          Fiscal year starts
        </legend>
        <div className="ax-wz-choices">
          {FISCAL_STARTS.map((fiscal) => (
            <label className="ax-wz-choice" key={fiscal}>
              <input
                type="radio"
                name="wz-fiscal"
                value={fiscal}
                checked={draft.fiscalStart === fiscal}
                onChange={() => update({ fiscalStart: fiscal })}
              />
              <span className="ax-wz-choice-title">{FISCAL_LABELS[fiscal]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="ax-panel">
        <p className="ax-panel-title">This is how figures will read</p>
        <p role="status" style={{ fontSize: 18, fontFamily: "var(--font-heading)", margin: 0 }}>
          {preview(draft.numberFormat, draft.fiscalStart)}
        </p>
      </div>
    </div>
  );
}
