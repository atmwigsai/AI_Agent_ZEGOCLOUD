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

// Pull the assistant text out of a non-streaming n8n JSON payload.
const extractReply = (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  const d = Array.isArray(parsed) ? parsed[0] : parsed;
  return d?.reply || d?.output || d?.text || d?.message || "";
};

// Parse one line of an n8n streamed response (JSONL or SSE "data:" framing).
// Returns the incremental token text if it's a content "item", else "".
const parseItemLine = (line) => {
  const t = line.replace(/^data:\s*/, "").trim();
  if (!t || t === "[DONE]") return "";
  try {
    const obj = JSON.parse(t);
    if (obj?.type === "item" && typeof obj.content === "string") return obj.content;
  } catch {
    // partial chunk or non-JSONL line — ignore
  }
  return "";
};

// Proxy: receives OpenAI Chat Completions format from ZEGOCLOUD, calls the n8n
// RAG webhook, and re-emits the answer as an OpenAI SSE stream.
//
// If the n8n workflow has streaming enabled (Webhook "Respond" = Streaming
// Response + AI Agent streaming), it returns JSONL/SSE chunks which we forward
// token-by-token so TTS can start on the first words. If n8n still returns a
// single JSON object (streaming off), we fall back to emitting the full reply
// as one chunk — so this is safe to deploy before enabling n8n streaming.
export const POST = async (request) => {
  try {
    const body = await request.json();
    const messages = body.messages || [];

    // Extract last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userMessage = lastUserMsg?.content || "";

    // Extract sessionId from ZEGOCLOUD agent info (injected when AddAgentInfo: true)
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
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        sessionId,
        message: userMessage,
        imageUrl: null,
      }),
    });

    if (!n8nResponse.ok) {
      const errText = await n8nResponse.text().catch(() => "");
      throw new Error(`n8n returned ${n8nResponse.status}: ${errText.substring(0, 200)}`);
    }

    const id = `chatcmpl-${crypto.randomBytes(12).toString("hex")}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model || "n8n-rag";

    // Non-streaming path (e.g. curl tests with stream:false): aggregate everything.
    if (body.stream === false) {
      const raw = await n8nResponse.text();
      let replyText = "";
      let sawItem = false;
      for (const line of raw.split("\n")) {
        const content = parseItemLine(line);
        if (content) {
          replyText += content;
          sawItem = true;
        }
      }
      if (!sawItem) replyText = extractReply(raw);
      console.log(`[LLM Proxy] (non-stream) reply="${replyText.substring(0, 80)}..."`);

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
    }

    // Streaming path: forward n8n items as OpenAI chat.completion.chunk events.
    const encoder = new TextEncoder();
    const sse = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
    const chunk = (delta, finish = null) =>
      sse({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }],
      });

    const stream = new ReadableStream({
      async start(controller) {
        // First chunk: role
        controller.enqueue(chunk({ role: "assistant" }));

        const reader = n8nResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let raw = "";
        let sawItem = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            raw += text;
            buffer += text;
            let nl;
            while ((nl = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              const content = parseItemLine(line);
              if (content) {
                sawItem = true;
                controller.enqueue(chunk({ content }));
              }
            }
          }
          // Flush any trailing partial line
          if (buffer.trim()) {
            const content = parseItemLine(buffer);
            if (content) {
              sawItem = true;
              controller.enqueue(chunk({ content }));
            }
          }
          // Fallback: n8n wasn't streaming (single JSON object) — emit it all at once.
          if (!sawItem) {
            const replyText = extractReply(raw);
            if (replyText) controller.enqueue(chunk({ content: replyText }));
          }
        } catch (e) {
          console.error("[LLM Proxy] stream error:", e.message);
        }

        controller.enqueue(chunk({}, "stop"));
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
  } catch (error) {
    console.error("[LLM Proxy] Error:", error.message);
    return NextResponse.json(
      { error: { message: error.message || "Internal server error" } },
      { status: 500, headers: corsHeaders }
    );
  }
};
