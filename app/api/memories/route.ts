import { createSupabaseMemoryStore } from "@/lib/supabase-memories";
import { connection } from "next/server";
import { memoryMutationHandlers } from "@/lib/memory-api";

const store = createSupabaseMemoryStore();
const headers = { "Cache-Control": "no-store" };

// The album's existing client contract is a JSON array of SavedMemory records.
// Credentials and database access stay on the server.
export const { POST } = memoryMutationHandlers(store);
export async function GET() {
  await connection();
  try {
    return Response.json(await store.read(), { headers });
  } catch (error) {
    const failure = error instanceof Error ? error : null;
    const cause = failure?.cause;
    console.error("[memories] " + JSON.stringify({
      configurationPresent: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      errorType: failure?.name ?? "Unknown",
      networkCode: cause && typeof cause === "object" && "code" in cause ? cause.code : undefined,
    }));
    return Response.json({ error: "Không thể tải kỷ niệm. Vui lòng tải lại trang để thử lại." }, { status: 503, headers });
  }
}
