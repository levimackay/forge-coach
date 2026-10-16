import { notFound } from "next/navigation";

// Development preview harness. The condition is replaced with a literal at build
// time, so production builds contain only the notFound() call.
export default async function DevPage() {
  if (process.env.NODE_ENV === "development") {
    const { DevHarness } = await import("./dev-harness");
    return <DevHarness />;
  }
  notFound();
}
