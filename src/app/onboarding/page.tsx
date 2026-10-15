import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/train/onboarding-flow";

export const metadata: Metadata = { title: "Set up" };

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
