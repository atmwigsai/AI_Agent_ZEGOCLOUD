import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const OPTIONS = async () => {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
};

// Proxy: receives OpenAI Chat Completions format from ZEGOCLOUD,
// calls n8n RAG webhook, returns OpenAI-compatible response.
export const POST = async (request) => {
  try {
    const body = await request.json();
    const messages = body.messages || [];

    // Extract last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userMessage = lastUserMsg?.content || "";

    // Extract sessionId from ZEGOCLOUD agent info (injected when AddAgentInfo: true)
    // ZEGOCLOUD injects room_id / user_id as top-level fields alongside messages
    const sessionId =
      body.room_id ||
      body.user_id ||
      body.agent_instance_id ||
      crypto.randomUUID();

    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) {
      throw new Error("N8N_WEBHOOK_URL is not configured");
    }

    console.log(`[LLM Proxy] sessionId=${sessionId} message="${userMessage}"`);

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: userMessage,
        imageUrl: null,
      }),
    });

    const rawText = await n8nResponse.text();
    console.log(`[LLM Proxy] n8n status=${n8nResponse.status} raw="${rawText.substring(0, 200)}"`);

    if (!n8nResponse.ok) {
      throw new Error(`n8n returned ${n8nResponse.status}: ${rawText}`);
    }

    if (!rawText) {
      throw new Error("n8n returned empty response — is the workflow activated in production mode?");
    }

    let n8nData;
    try {
      n8nData = JSON.parse(rawText);
    } catch {
      throw new Error(`n8n returned non-JSON: ${rawText.substring(0, 200)}`);
    }

    // Handle both array response and object response from n8n
    const data = Array.isArray(n8nData) ? n8nData[0] : n8nData;
    const replyText = data?.reply || data?.output || data?.text || data?.message || "";

    console.log(`[LLM Proxy] reply="${replyText.substring(0, 80)}..." stream=${body.stream !== false}`);

    const id = `chatcmpl-${crypto.randomBytes(12).toString("hex")}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model || "n8n-rag";

    // ZEGOCLOUD (and most realtime agents) call the LLM with stream:true and
    // expect an OpenAI-style SSE stream of chat.completion.chunk events.
    // Default to streaming unless the caller explicitly sets stream:false.
    if (body.stream !== false) {
      const encoder = new TextEncoder();
      const sse = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

      const stream = new ReadableStream({
        start(controller) {
          // First chunk: role
          controller.enqueue(
            sse({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
            })
          );
          // Content chunk: the full reply text
          controller.enqueue(
            sse({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { content: replyText }, finish_reason: null }],
            })
          );
          // Final chunk: finish
          controller.enqueue(
            sse({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            })
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming fallback (e.g. curl tests with stream:false)
    return NextResponse.json(
      {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: replyText },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[LLM Proxy] Error:", error.message);
    return NextResponse.json(
      { error: { message: error.message || "Internal server error" } },
      { status: 500, headers: corsHeaders }
    );
  }
};
