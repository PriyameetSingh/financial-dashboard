"use client";

import { TextField } from "@/components/nocturne";
import { SECTORS, slugify } from "@/lib/onboarding/draft";
import type { StepProps } from "../types";

/**
 * Step 1 — who the workspace is for.
 *
 * The address is the load-bearing field: it becomes the permanent sign-in URL,
 * so it is derived from the name until the visitor edits it, and thereafter
 * left alone. Silently re-deriving a slug someone has deliberately set is how
 * people end up with an address they did not choose.
 */
const SECTOR_LABELS: Record<(typeof SECTORS)[number], string> = {
  gov: "Government department",
  psu: "Public sector undertaking",
  ent: "Institution or enterprise",
};

export default function StepOrg({ draft, update, showErrors }: StepProps) {
  const nameError = showErrors && draft.orgName.trim().length < 2;
  const slugError = showErrors && !/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(draft.slug);
  // The slug is only auto-derived while it still matches what the current name
  // would produce — the cheapest way to tell "untouched" from "chosen".
  const slugFollowsName = draft.slug === "" || draft.slug === slugify(draft.orgName);

  return (
    <div className="ax-wz-fields">
      <TextField
        id="wz-org-name"
        label="Organization name"
        value={draft.orgName}
        onChange={(event) => {
          const orgName = event.target.value;
          update(slugFollowsName ? { orgName, slug: slugify(orgName) } : { orgName });
        }}
        hint="As it should appear on screens and report packs."
        error={nameError ? "Enter the organization's name." : undefined}
      />

      <TextField
        id="wz-slug"
        label="Workspace address"
        value={draft.slug}
        onChange={(event) => update({ slug: event.target.value.toLowerCase() })}
        spellCheck={false}
        hint={`Your workspace will live at ${draft.slug || "your-address"}.airawat.app. This cannot be changed later.`}
        error={
          slugError
            ? "Use 3 to 32 lowercase letters, numbers and hyphens, starting and ending with a letter or number."
            : undefined
        }
      />

      <TextField
        id="wz-contact"
        label="Contact email"
        type="email"
        value={draft.contactEmail}
        onChange={(event) => update({ contactEmail: event.target.value })}
        hint="Who we reach about this workspace. Optional."
      />

      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          Type of organization
        </legend>
        <div className="ax-wz-choices">
          {SECTORS.map((sector) => (
            <label className="ax-wz-choice" key={sector}>
              <input
                type="radio"
                name="wz-sector"
                value={sector}
                checked={draft.sector === sector}
                onChange={() => update({ sector })}
              />
              <span className="ax-wz-choice-title">{SECTOR_LABELS[sector]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
