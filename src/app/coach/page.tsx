import type { Metadata } from "next";
import { CoachScreen } from "./coach-screen";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return <CoachScreen />;
}
