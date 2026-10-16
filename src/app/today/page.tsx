import type { Metadata } from "next";
import { TodayScreen } from "@/components/train/today-screen";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayScreen />;
}
