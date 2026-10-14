import { createSupabaseMemoryStore } from "@/lib/supabase-memories";
import { memoryMutationHandlers } from "@/lib/memory-api";

const handlers = memoryMutationHandlers(createSupabaseMemoryStore());
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  return handlers.PUT(request, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return handlers.DELETE(request, (await context.params).id);
}
