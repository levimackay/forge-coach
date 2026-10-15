import type { Metadata } from "next";
import { HistoryScreen } from "@/components/train/history-screen";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return <HistoryScreen />;
}
