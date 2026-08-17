import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { provisionTenant } from "@/lib/onboarding/provision";
import { TOKEN_REJECTED_MESSAGE } from "@/lib/onboarding/token";
import { clientKey, rateLimit } from "@/lib/onboarding/rate-limit";
import type { OnboardingDraft } from "@/lib/onboarding/draft";

/**
 * POST /api/onboarding/provision — create the workspace.
 *
 * The one privileged write in the wizard, and the only endpoint in this
 * application that creates a tenant. Unauthenticated by design and gated by the
 * onboarding token instead; the reasoning for that choice is in
 * `lib/onboarding/token.ts` and should be read before changing anything here.
 *
 * THE AI KEY. It arrives in this request body, is handed to the provisioner,
 * and is written as a secret-class config row. It is never echoed: the response
 * says `llmApiKeySet: true` and nothing more, matching the admin config API,
 * which reports presence and never material. It is also never logged — the
 * rejection path below logs `rejection.kind`, never the body.
 *
 * ERROR SHAPES. Token problems collapse to one message for the reason given in
 * `token.ts`. Field problems are specific, because they are the visitor's own
 * input and being vague about them is just unhelpful. A taken slug is reported
 * as taken and nothing else — which organizations exist is not public.
 */
export const runtime = "nodejs";

/**
 * Tight, because each allowed request opens a transaction that creates a
 * tenant. A legitimate visitor needs one, and perhaps two if they hit a slug
 * collision.
 */
const LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

/** 64 KB. A draft is small; anything larger is not a draft. */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const verdict = rateLimit(`onboarding-provision:${clientKey(request.headers)}`, LIMIT, WINDOW_MS);
  if (!verdict.allowed) {
    return NextResponse.json(
      { ok: false, detail: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, detail: "That request is too large." }, { status: 413 });
  }

  let body: { token?: unknown; draft?: unknown; llmApiKey?: unknown } | null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      // Checked again on the actual bytes: `content-length` is a claim.
      return NextResponse.json({ ok: false, detail: "That request is too large." }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, detail: "Malformed request." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || typeof body.token !== "string" || !body.draft) {
    return NextResponse.json({ ok: false, detail: "Malformed request." }, { status: 400 });
  }

  const llmApiKey =
    typeof body.llmApiKey === "string" && body.llmApiKey.length > 0 ? body.llmApiKey : undefined;

  const outcome = await provisionTenant({
    token: body.token,
    draft: body.draft as OnboardingDraft,
    llmApiKey,
  });

  if (!outcome.ok) {
    const { rejection } = outcome;
    // Logged by KIND only. The body carries an organization's details and
    // possibly an API key; none of it belongs in a log line.
    console.warn(`[onboarding] provisioning rejected: ${rejection.kind}`);

    if (rejection.kind === "token") {
      return NextResponse.json({ ok: false, detail: TOKEN_REJECTED_MESSAGE }, { status: 403 });
    }
    if (rejection.kind === "slug") {
      const detail =
        rejection.detail === "taken"
          ? "That address is already in use. Choose another."
          : rejection.detail === "reserved"
            ? "That address is reserved. Choose another."
            : "Addresses use lowercase letters, numbers and hyphens, 3 to 32 characters.";
      return NextResponse.json({ ok: false, field: "slug", detail }, { status: 409 });
    }
    if (rejection.kind === "field") {
      return NextResponse.json({ ok: false, field: rejection.field, detail: rejection.detail }, { status: 400 });
    }
    if (rejection.kind === "config") {
      return NextResponse.json({ ok: false, detail: rejection.detail }, { status: 400 });
    }
    return NextResponse.json({ ok: false, detail: "Could not create the workspace." }, { status: 500 });
  }

  const { result } = outcome;
  return NextResponse.json(
    {
      ok: true,
      slug: result.slug,
      name: result.name,
      enabledModules: result.enabledModules,
      deniedModules: result.deniedModules,
      // Presence only. The key never crosses this boundary in either direction
      // after it arrives.
      llmApiKeySet: result.llmApiKeySet,
      pending: result.pending,
    },
    { status: 201 },
  );
}
