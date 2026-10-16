"use client";

import { Button, ButtonLink } from "@/components/ui/button";

export function OfflineActions() {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" className="bleed" onClick={() => window.location.reload()}>
        Try again
      </Button>
      <ButtonLink href="/today" size="lg" fullWidth>
        Go to Today
      </ButtonLink>
    </div>
  );
}
