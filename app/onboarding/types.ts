import type { OnboardingDraft } from "@/lib/onboarding/draft";

/**
 * What every step panel receives.
 *
 * In its own module rather than exported from the wizard, so a step can import
 * the type without importing the component that imports the step.
 */
export type StepProps = {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  /** True once the visitor has tried to move on with something invalid. */
  showErrors: boolean;
};
