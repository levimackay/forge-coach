"use client";

import { Button, ButtonLink } from "@/components/ui/button";

export function OfflineActions() {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" size="lg" fullWidth onClick={() => window.location.reload()}>
        Try again
      </Button>
      <ButtonLink href="/today" fullWidth>
        Go to Today
      </ButtonLink>
    </div>
  );
}
