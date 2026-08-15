"use client";

import { Button, InlineAlert, TextField } from "@/components/nocturne";
import type { StepProps } from "../types";

/**
 * Step 7 — the first administrators.
 *
 * STUBBED, and visibly. Sending an invitation means creating an account in an
 * identity provider, which is gated behind D1 and is not built. So this step
 * collects the list, the list is carried to the server, and the launch screen
 * reports it as recorded-not-sent. It does not send an email and does not
 * pretend to.
 *
 * The list is still worth collecting now: it is the thing a customer has in
 * front of them during the setup meeting, and asking for it again in a fortnight
 * is how it arrives wrong.
 */
const ROLES = ["Administrator", "Reviewer", "Officer", "Viewer"] as const;

export default function StepPeople({ draft, update, showErrors }: StepProps) {
  const invites = draft.invites.length > 0 ? draft.invites : [{ email: "", role: "Administrator" }];

  function setInvite(index: number, patch: Partial<{ email: string; role: string }>) {
    const next = invites.map((invite, i) => (i === index ? { ...invite, ...patch } : invite));
    update({ invites: next });
  }

  return (
    <div className="ax-wz-fields" style={{ maxWidth: "42rem" }}>
      <InlineAlert assertive={false}>
        Invitations are recorded now and sent once your identity provider is connected. Nobody is
        emailed by this step.
      </InlineAlert>

      <div className="ax-wz-people">
        {invites.map((invite, index) => {
          const invalid =
            showErrors && invite.email.trim() !== "" && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(invite.email);
          return (
            <div className="ax-wz-person" key={index}>
              <TextField
                id={`wz-invite-email-${index}`}
                label={`Email address ${index + 1}`}
                type="email"
                value={invite.email}
                onChange={(event) => setInvite(index, { email: event.target.value })}
                error={invalid ? "That does not look like an email address." : undefined}
              />
              <div className="field">
                <label htmlFor={`wz-invite-role-${index}`}>Role</label>
                {/*
                  A native select, which the UI guidelines normally rule out in
                  favour of the custom control. It is used here on purpose: this
                  is a public, pre-account page that ships no design-system
                  JavaScript, and a scripted dropdown that fails to hydrate on a
                  locked-down government desktop would make the field unusable.
                  A native select always works.
                */}
                <select
                  id={`wz-invite-role-${index}`}
                  className="input"
                  value={invite.role}
                  onChange={(event) => setInvite(index, { role: event.target.value })}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                onClick={() => update({ invites: invites.filter((_, i) => i !== index) })}
                disabled={invites.length === 1}
                aria-label={`Remove ${invite.email || `person ${index + 1}`}`}
              >
                Remove
              </Button>
            </div>
          );
        })}
      </div>

      <div>
        <Button
          variant="secondary"
          onClick={() => update({ invites: [...invites, { email: "", role: "Viewer" }] })}
        >
          Add another person
        </Button>
      </div>
    </div>
  );
}
