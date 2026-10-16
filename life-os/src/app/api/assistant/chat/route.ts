import { z } from "zod";
import { getUserOrNull } from "@/lib/auth/session";
import { runTurn, type AgentEvent } from "@/lib/assistant/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

const body = z.object({ conversationId: z.string().nullish(), message: z.string().trim().min(1).max(20_000) });

/** Streams the assistant turn as Server-Sent Events. */
export async function POST(request: Request) {
  if (!(await getUserOrNull())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // client went away; the turn still completes and is saved
        }
      };
      await runTurn({ conversationId: parsed.data.conversationId, text: parsed.data.message, emit });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
