import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const getAppId = () => Number(process.env.APP_ID || process.env.ZEGO_APPID || 0);
const getServerSecret = () => process.env.SERVER_SECRET || process.env.ZEGO_SERVER_SECRET || "";

const generateSignature = (appId, serverSecret, signatureNonce, timestamp) => {
  return crypto
    .createHash("md5")
    .update(`${appId}${signatureNonce}${serverSecret}${timestamp}`)
    .digest("hex");
};

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
  console.log(`[AgentAPI] Action=${action} Code=${result.Code} Message=${result.Message}`);
  return result;
};

export const OPTIONS = async () => {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
};

// POST /api/chat - Send text directly to the agent (bypasses ASR)
export const POST = async (request) => {
  try {
    const body = await request.json();
    const agentInstanceId = body.agentInstanceId;
    const text = body.text;

    if (!agentInstanceId || !text) {
      return NextResponse.json({
        code: -1,
        message: "Missing required parameters: agentInstanceId, text",
      }, { status: 400, headers: corsHeaders });
    }

    const result = await sendAgentRequest("SendAgentInstanceLLM", {
      AgentInstanceId: agentInstanceId,
      Text: text,
      AddQuestionToHistory: true,
      AddAnswerToHistory: true,
    });

    if (result.Code === 0) {
      return NextResponse.json({
        code: 0,
        message: "Text sent to agent",
      }, { headers: corsHeaders });
    }

    return NextResponse.json({
      code: result.Code,
      message: result.Message || "Send text failed",
    }, { status: 500, headers: corsHeaders });
  } catch (error) {
    console.error("Send chat error:", error);
    return NextResponse.json({
      code: -1,
      message: error.message || "Internal server error",
    }, { status: 500, headers: corsHeaders });
  }
};
