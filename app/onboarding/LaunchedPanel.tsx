"use client";

import { Button, Card, InlineAlert, Tag } from "@/components/nocturne";

/**
 * What the visitor sees once the workspace exists.
 *
 * Three jobs, in order of how much they matter:
 *
 *   1. Say the address, because that is the one thing they need to keep.
 *   2. Say what did NOT happen. Modules dropped because the plan does not reach
 *      them, invitations recorded rather than sent, a sample portfolio that
 *      arrives later — all of it stated here rather than discovered on Monday.
 *   3. Offer the way in.
 *
 * The API key is reported as set or not mentioned at all. Its value is not in
 * this response and could not be shown even if this screen wanted to.
 */
export type LaunchResult = {
  ok: true;
  slug: string;
  name: string;
  enabledModules: string[];
  deniedModules: string[];
  llmApiKeySet: boolean;
  pending: string[];
};

export default function LaunchedPanel({
  result,
  platformHref,
  onStartOver,
}: {
  result: LaunchResult;
  platformHref: string;
  onStartOver: () => void;
}) {
  return (
    <div className="ax-lp-shell" style={{ paddingBlock: 72, maxWidth: 720 }}>
      {/* The whole panel replaces the wizard, so the announcement is the page.
          `role="status"` is polite: nothing here needs to interrupt. */}
      <div role="status">
        <p className="ax-section-title">Launched</p>
        <h1 className="ax-lp-h2">{result.name} is live</h1>
        <p className="ax-wz-hint">
          The workspace exists at <strong>{result.slug}.airawat.app</strong> with{" "}
          {result.enabledModules.length} modules switched on.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 28 }}>
        <Card
          kicker="Address"
          title={`${result.slug}.airawat.app`}
          elevation="sm"
          meta={<Tag tone="neutral">{result.enabledModules.length} modules</Tag>}
        >
          Keep this address. It is where your officers sign in, and it cannot be changed.
        </Card>

        {result.deniedModules.length > 0 ? (
          <InlineAlert assertive={false}>
            {result.deniedModules.length} module
            {result.deniedModules.length === 1 ? " was" : "s were"} not switched on because your plan
            does not include {result.deniedModules.length === 1 ? "it" : "them"}:{" "}
            {result.deniedModules.join(", ")}. Upgrading adds{" "}
            {result.deniedModules.length === 1 ? "it" : "them"} without any further setup.
          </InlineAlert>
        ) : null}

        {result.llmApiKeySet ? (
          <Card kicker="AI" title="Your API key is stored" elevation="sm">
            It is held encrypted and is never displayed again, including to your own administrators.
            Replace it any time from the workspace settings.
          </Card>
        ) : null}

        {result.pending.map((note) => (
          <InlineAlert key={note} assertive={false}>
            {note}
          </InlineAlert>
        ))}
      </div>

      <div className="ax-wz-nav">
        <a className="btn btn-primary" href={`https://${result.slug}.airawat.app`}>
          Open the workspace
        </a>
        <a className="btn btn-secondary" href={platformHref}>
          Back to the platform overview
        </a>
        <Button variant="ghost" onClick={onStartOver}>
          Set up another organization
        </Button>
      </div>
    </div>
  );
}
