import { handleMetadataPreflight, handleProtectedResource } from "@/lib/mcp/endpoint";

export const GET = handleProtectedResource;
export const OPTIONS = handleMetadataPreflight;
