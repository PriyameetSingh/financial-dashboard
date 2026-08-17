"use client";

import { InlineAlert } from "@/components/nocturne";
import { STARTER_DATA } from "@/lib/onboarding/draft";
import type { StepProps } from "../types";

/**
 * Step 6 — how the workspace looks on day one.
 *
 * STATED PLAINLY: the sample portfolio is not built. The choice is recorded and
 * carried into the launch summary, and an onboarding lead loads the sample data
 * afterwards. The alternative — offering the option and silently creating an
 * empty workspace — is the kind of small dishonesty that costs a customer's
 * trust on their first morning, so the screen says it here and the launch
 * screen says it again.
 */
const OPTIONS: Record<
  (typeof STARTER_DATA)[number],
  { title: string; body: string }
> = {
  empty: {
    title: "Start empty",
    body: "Your workspace opens with nothing in it. You add your own schemes, indicators and people.",
  },
  sample: {
    title: "Start with a sample portfolio",
    body: "A demonstration set of schemes and figures to explore, which you can delete in one action.",
  },
};

export default function StepStarter({ draft, update }: StepProps) {
  return (
    <div className="ax-wz-fields">
      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="ax-sr-only">How the workspace should start</legend>
        <div className="ax-wz-choices">
          {STARTER_DATA.map((option) => (
            <label className="ax-wz-choice" key={option}>
              <input
                type="radio"
                name="wz-starter"
                value={option}
                checked={draft.starterData === option}
                onChange={() => update({ starterData: option })}
              />
              <span className="ax-wz-choice-title">{OPTIONS[option].title}</span>
              <span className="ax-wz-choice-body">{OPTIONS[option].body}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {draft.starterData === "sample" ? (
        <InlineAlert assertive={false}>
          The sample portfolio is loaded by your onboarding lead after launch, not by this step. Your
          workspace is created empty and the request is passed on with it.
        </InlineAlert>
      ) : null}
    </div>
  );
}
