"use client";

import { Button } from "@/components/nocturne";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { tierDisplayName, type CodeGrant } from "../CodeGate";

/**
 * Step 8 — everything, with a way back to each of it.
 *
 * Every row names the step that owns it and offers a button to go there, which
 * is the whole job of a review screen: not to summarise, but to make correcting
 * something cheap enough that people actually read it.
 *
 * The AI key appears as "set" or "not set". It is never rendered, not even the
 * value the visitor typed a minute ago on this same page — the rule is that the
 * key crosses no boundary it does not have to, and a review screen is a
 * boundary. It is also the same rule the admin config API follows for the
 * identical key, so what a tenant admin sees later matches this.
 */
const NUMBER_LABELS: Record<string, string> = {
  in: "Indian grouping (lakh, crore)",
  intl: "International grouping",
  eu: "European grouping",
};

const AI_LABELS: Record<string, string> = {
  managed: "Hosted by Airawat",
  byok: "Your own key",
  selfhost: "Inside your network",
};

export default function StepReview({
  draft,
  grant,
  aiKeySet,
  onEdit,
}: {
  draft: OnboardingDraft;
  grant: CodeGrant;
  aiKeySet: boolean;
  onEdit: (step: number) => void;
}) {
  const chosen = draft.moduleCodes.filter((code) => grant.modules.includes(code));

  const rows: readonly { label: string; value: string; step: number }[] = [
    { label: "Organization", value: draft.orgName || "—", step: 0 },
    { label: "Address", value: `${draft.slug || "—"}.airawat.app`, step: 0 },
    { label: "Contact", value: draft.contactEmail || "Not given", step: 0 },
    {
      label: "Branding",
      value: `${draft.logoFileName ? `${draft.logoFileName} · ` : "No logo yet · "}${draft.brandColor}`,
      step: 1,
    },
    {
      label: "Locale",
      value: `${draft.locale} · ${NUMBER_LABELS[draft.numberFormat]} · ${draft.timezone}`,
      step: 2,
    },
    {
      label: "Plan and modules",
      value: `${tierDisplayName(grant.tier)} · ${chosen.length} optional module${chosen.length === 1 ? "" : "s"} switched on`,
      step: 3,
    },
    {
      label: "AI setup",
      value: [
        AI_LABELS[draft.aiMode],
        draft.aiMode === "byok" ? (aiKeySet ? "key set" : "key missing") : null,
        draft.aiMode === "selfhost" ? draft.aiEndpoint : null,
        draft.aiRegionLocal ? "in region" : null,
        draft.aiRedactNames ? "names redacted" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      step: 4,
    },
    {
      label: "Starter data",
      value:
        draft.starterData === "sample"
          ? "Sample portfolio requested — loaded after launch"
          : "Empty workspace",
      step: 5,
    },
    {
      label: "People",
      value: (() => {
        const filled = draft.invites.filter((invite) => invite.email.trim()).length;
        return filled === 0
          ? "Nobody added yet"
          : `${filled} invitation${filled === 1 ? "" : "s"} recorded — sent once your identity provider is connected`;
      })(),
      step: 6,
    },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--space-6)" }}>
      <div className="ax-wz-review">
        {rows.map((row) => (
          <div className="ax-wz-review-row" key={row.label}>
            <span className="ax-wz-review-label">{row.label}</span>
            <span className="ax-wz-review-value">{row.value}</span>
            <Button variant="ghost" onClick={() => onEdit(row.step)} aria-label={`Change ${row.label}`}>
              Change
            </Button>
          </div>
        ))}
      </div>
      <p className="ax-wz-hint" style={{ fontSize: 13 }}>
        Launching creates the workspace and spends your onboarding code. Everything above stays
        editable afterwards, from the workspace&rsquo;s own settings.
      </p>
    </div>
  );
}
