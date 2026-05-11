import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ========== ZEGO AI Agent API Request Utility ==========

// Read APP_ID and SERVER_SECRET with fallback from environment variables
const getAppId = () => Number(process.env.APP_ID || process.env.ZEGO_APPID || 0);
const getServerSecret = () => process.env.SERVER_SECRET || process.env.ZEGO_SERVER_SECRET || "";

// Generate MD5 signature for ZEGO AI Agent API
const generateSignature = (appId, serverSecret, signatureNonce, timestamp) => {
  return crypto
    .createHash("md5")
    .update(`${appId}${signatureNonce}${serverSecret}${timestamp}`)
    .digest("hex");
};

// Send request to ZEGO AI Agent API
const sendAgentRequest = async (action, body) => {
  const appId = getAppId();
  const serverSecret = getServerSecret();
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureNonce = crypto.randomBytes(8).toString("hex");
  const signature = generateSignature(appId, serverSecret, signatureNonce, timestamp);

  const url = new URL("https://aigc-aiagent-api.zegotech.cn/");
  url.searchParams.set("Action", action);
  url.searchParams.set("AppId", appId.toString());
  url.searchParams.set("SignatureNonce", signatureNonce);
  url.searchParams.set("Timestamp", timestamp.toString());
  url.searchParams.set("Signature", signature);
  url.searchParams.set("SignatureVersion", "2.0");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  return result;
};

// ========== Agent State (in-memory) ==========

// Track registered agents to avoid duplicate registration
const registeredAgents = new Set();

// ========== HTTP Route Handlers ==========

export const OPTIONS = async () => {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
};

// POST /api/agent - Register AI Agent
export const POST = async (request) => {
  try {
    const body = await request.json();
    const agentId = body.agentId || "ai_avatar_agent";
    const agentName = body.agentName || "AI Avatar";

    // Skip if already registered
    if (registeredAgents.has(agentId)) {
      return NextResponse.json({
        code: 0,
        message: "Agent already registered",
        agentId,
      }, { headers: corsHeaders });
    }

    // Register agent with ZEGO AI Agent API
    const result = await sendAgentRequest("RegisterAgent", {
      AgentId: agentId,
      Name: agentName,
      LLM: {
        Url: process.env.LLM_URL || "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        ApiKey: process.env.LLM_API_KEY || "",
        Model: process.env.LLM_MODEL || "doubao-1-5-pro-32k-250115",
        SystemPrompt: process.env.LLM_SYSTEM_PROMPT || "You are a friendly AI avatar assistant. Answer concisely.",
      },
      TTS: {
        Vendor: "ByteDance",
        Params: {
          app: {
            appid: process.env.TTS_APP_ID || "",
            token: process.env.TTS_TOKEN || "",
            cluster: "volcano_tts",
          },
          audio: {
            voice_type: process.env.TTS_VOICE_TYPE || "zh_female_wanwanxiaohe_moon_bigtts",
          },
        },
      },
      ASR: {
        Vendor: "Tencent",
      },
    });

    if (result.Code === 0 || result.Code === 410001008) {
      // 410001008 = agent already exists, treat as success
      registeredAgents.add(agentId);
      return NextResponse.json({
        code: 0,
        message: "Agent registered successfully",
        agentId,
      }, { headers: corsHeaders });
    }

    return NextResponse.json({
      code: result.Code,
      message: result.Message || "Register agent failed",
    }, { status: 500, headers: corsHeaders });
  } catch (error) {
    console.error("Register agent error:", error);
    return NextResponse.json({
      code: -1,
      message: error.message || "Internal server error",
    }, { status: 500, headers: corsHeaders });
  }
};
