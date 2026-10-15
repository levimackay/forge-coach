import { ForgeMark } from "@/components/ui/icons";

/** Shown while the session and local data are being read. */
export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground" role="status" aria-label="Loading">
      <ForgeMark size={72} className="text-ember motion-safe:animate-pulse" />
    </div>
  );
}
