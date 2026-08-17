"use client";

import { TextField } from "@/components/nocturne";
import { AI_MODES } from "@/lib/onboarding/draft";
import type { StepProps } from "../types";

/**
 * Step 5 — how the assistant runs.
 *
 * THE KEY. `aiKey` is held by the wizard, not by the draft, and it is the one
 * field on this screen that is not part of what gets saved for later. A
 * credential written to `localStorage` stays there until somebody clears it,
 * which on a shared desktop in a government office is not a theoretical
 * exposure. The field says so, because a visitor who saves and resumes needs to
 * know why one box is empty again.
 *
 * The key is `type="password"` and `autoComplete="off"`: not to hide it from
 * its owner, but so it is not painted on a projector during the setup meeting
 * this wizard is likely to be run in.
 */
const MODE_COPY: Record<
  (typeof AI_MODES)[number],
  { title: string; body: string }
> = {
  managed: {
    title: "Hosted by Airawat",
    body: "We run the models. Nothing to configure, and no key to look after.",
  },
  byok: {
    title: "Your own key",
    body: "You bring an API key from your provider. Usage is billed to you directly.",
  },
  selfhost: {
    title: "Inside your network",
    body: "Point at a model you run yourself. Nothing leaves your environment.",
  },
};

export default function StepAi({
  draft,
  update,
  showErrors,
  aiKey,
  setAiKey,
}: StepProps & { aiKey: string; setAiKey: (value: string) => void }) {
  const keyError = showErrors && draft.aiMode === "byok" && aiKey.trim().length < 12;
  const endpointError = showErrors && draft.aiMode === "selfhost" && !/^https?:\/\/\S+$/.test(draft.aiEndpoint);

  return (
    <div className="ax-wz-fields">
      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          Where the models run
        </legend>
        <div className="ax-wz-choices">
          {AI_MODES.map((mode) => (
            <label className="ax-wz-choice" key={mode}>
              <input
                type="radio"
                name="wz-ai-mode"
                value={mode}
                checked={draft.aiMode === mode}
                onChange={() => update({ aiMode: mode })}
              />
              <span className="ax-wz-choice-title">{MODE_COPY[mode].title}</span>
              <span className="ax-wz-choice-body">{MODE_COPY[mode].body}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {draft.aiMode === "byok" ? (
        <TextField
          id="wz-ai-key"
          label="API key"
          type="password"
          value={aiKey}
          onChange={(event) => setAiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          hint="Stored encrypted and never shown again — not to us, and not back to you. It is also not saved with the rest of your answers, so if you finish this later you will need to paste it again."
          error={keyError ? "Paste the API key from your provider." : undefined}
        />
      ) : null}

      {draft.aiMode === "selfhost" ? (
        <TextField
          id="wz-ai-endpoint"
          label="Model endpoint"
          type="url"
          value={draft.aiEndpoint}
          onChange={(event) => update({ aiEndpoint: event.target.value })}
          spellCheck={false}
          hint="The address of your own inference server, reachable from this workspace."
          error={endpointError ? "Enter the endpoint URL, starting with http:// or https://." : undefined}
        />
      ) : null}

      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          Data controls
        </legend>
        <div style={{ display: "grid", gap: 8 }}>
          <div className="ax-toggle-row">
            <span className="ax-toggle-label" id="wz-ai-region-label">
              Keep processing in region
              <span className="ax-toggle-hint">Requests do not leave the country this workspace is hosted in.</span>
            </span>
            <button
              type="button"
              role="switch"
              className="ax-switch"
              aria-checked={draft.aiRegionLocal}
              aria-labelledby="wz-ai-region-label"
              onClick={() => update({ aiRegionLocal: !draft.aiRegionLocal })}
            />
          </div>
          <div className="ax-toggle-row">
            <span className="ax-toggle-label" id="wz-ai-redact-label">
              Redact names before sending
              <span className="ax-toggle-hint">Officer and citizen names are removed from prompts.</span>
            </span>
            <button
              type="button"
              role="switch"
              className="ax-switch"
              aria-checked={draft.aiRedactNames}
              aria-labelledby="wz-ai-redact-label"
              onClick={() => update({ aiRedactNames: !draft.aiRedactNames })}
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
