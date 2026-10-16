import type { Metadata } from "next";
import { ScreenBar } from "@/components/shell/screen-bar";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";

export const metadata: Metadata = { title: "Program and settings" };

// Everything that is not Today, Progress or Coach is one tap from here.
export default function MorePage() {
  return (
    <>
      <ScreenBar />
      <h1 className="pb-3 pt-1 text-head">{named("Program and settings")}</h1>
      <ListGroup label="Program and settings" className="border-t border-rule">
        <ListRow title="Program" href="/program" />
        <ListRow title="History" href="/history" />
        <ListRow title="Sleep and body" href="/log" />
        <ListRow title="Settings" href="/settings" />
      </ListGroup>
    </>
  );
}
