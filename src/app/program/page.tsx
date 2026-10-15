import type { Metadata } from "next";
import { ProgramScreen } from "@/components/train/program-screen";

export const metadata: Metadata = { title: "Program" };

export default function ProgramPage() {
  return <ProgramScreen />;
}
