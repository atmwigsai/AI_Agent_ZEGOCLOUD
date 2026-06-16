import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ========== Instance State (in-memory) ==========
// Track created instance IDs for cleanup
const createdInstances = new Map(); // agentInstanceId -> { createdAt, roomId }

// ========== ZEGO AI Agent API Request Utility ==========

const getAppId = () => Number(process.env.APP_ID || process.env.ZEGO_APPID || 0);
const getServerSecret = () => process.env.SERVER_SECRET || process.env.ZEGO_SERVER_SECRET || "";

// VAD turn-taking: cho khách thời gian ngừng giữa câu mà không bị cắt sớm.
// SilenceSegmentation = im lặng bao lâu (ms) mới coi là "nói xong" (default ZEGO = 500).
// PauseInterval phải > SilenceSegmentation để bật gộp nhiều câu vào cùng một lượt.
const getVadConfig = () => ({
  TurnDetectConfig: {
    SilenceSegmentation: Number(process.env.VAD_SILENCE_MS || 1000),
    PauseInterval: Number(process.env.VAD_PAUSE_MS || 1500),
  },
});

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

// ========== HTTP Route Handlers ==========

export const OPTIONS = async () => {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
};

// POST /api/instance - Create digital human agent instance
export const POST = async (request) => {
  try {
    const body = await request.json();
    const agentId = body.agentId || "ai_avatar_agent_v4";
    const userId = body.userId;
    const roomId = body.roomId;
    const agentStreamId = body.agentStreamId;
    const agentUserId = body.agentUserId;
    const userStreamId = body.userStreamId;
    const digitalHumanId = body.digitalHumanId || process.env.DIGITAL_HUMAN_ID || "c4b56d5c-db98-4d91-86d4-5a97b507da97";

    if (!userId || !roomId || !agentStreamId || !agentUserId || !userStreamId) {
      return NextResponse.json({
        code: -1,
        message: "Missing required parameters: userId, roomId, agentStreamId, agentUserId, userStreamId",
      }, { status: 400, headers: corsHeaders });
    }

    // Create digital human agent instance
    const result = await sendAgentRequest("CreateDigitalHumanAgentInstance", {
      AgentId: agentId,
      UserId: userId,
      RTC: {
        RoomId: roomId,
        AgentStreamId: agentStreamId,
        AgentUserId: agentUserId,
        UserStreamId: userStreamId,
      },
      DigitalHuman: {
        DigitalHumanId: digitalHumanId,
        ConfigId: "web",
        EncodeCode: "H264",
      },
      MessageHistory: {
        SyncMode: 1,
        Messages: [],
        WindowSize: 10,
      },
      // Barge-in: ngắt ngay khi khách nói chen ngang (0 = interrupt immediately)
      AdvancedConfig: {
        InterruptMode: 0,
      },
      VAD: getVadConfig(),
    });

    if (result.Code === 0) {
      const instanceId = result.Data?.AgentInstanceId;
      if (instanceId) {
        createdInstances.set(instanceId, { createdAt: Date.now(), roomId });
      }
      return NextResponse.json({
        code: 0,
        message: "Digital human agent instance created",
        data: {
          agentInstanceId: instanceId,
          digitalHumanConfig: result.Data?.DigitalHumanConfig,
          agentStreamId,
          agentUserId,
        },
      }, { headers: corsHeaders });
    }

    // Handle concurrent limit error (410001031 or 410000011)
    if (result.Code === 410001031 || result.Code === 410000011) {
      console.log(`[AgentAPI] Concurrent limit reached, attempting cleanup of ${createdInstances.size} stale instances...`);
      // Try to delete all tracked instances to free up slots
      const deletePromises = [];
      for (const [id] of createdInstances) {
        deletePromises.push(
          sendAgentRequest("DeleteAgentInstance", { AgentInstanceId: id })
            .then(r => {
              if (r.Code === 0) {
                createdInstances.delete(id);
                console.log(`[AgentAPI] Cleaned up stale instance: ${id}`);
              }
            })
            .catch(() => {})
        );
      }
      await Promise.all(deletePromises);

      // Retry creation after cleanup
      const retryResult = await sendAgentRequest("CreateDigitalHumanAgentInstance", {
        AgentId: agentId,
        UserId: userId,
        RTC: {
          RoomId: roomId,
          AgentStreamId: agentStreamId,
          AgentUserId: agentUserId,
          UserStreamId: userStreamId,
        },
        DigitalHuman: {
          DigitalHumanId: digitalHumanId,
          ConfigId: "web",
          EncodeCode: "H264",
        },
        MessageHistory: {
          SyncMode: 1,
          Messages: [],
          WindowSize: 10,
        },
        // Barge-in: ngắt ngay khi khách nói chen ngang (0 = interrupt immediately)
        AdvancedConfig: {
          InterruptMode: 0,
        },
        VAD: getVadConfig(),
      });

      if (retryResult.Code === 0) {
        const instanceId = retryResult.Data?.AgentInstanceId;
        if (instanceId) {
          createdInstances.set(instanceId, { createdAt: Date.now(), roomId });
        }
        return NextResponse.json({
          code: 0,
          message: "Digital human agent instance created (after cleanup)",
          data: {
            agentInstanceId: instanceId,
            digitalHumanConfig: retryResult.Data?.DigitalHumanConfig,
            agentStreamId,
            agentUserId,
          },
        }, { headers: corsHeaders });
      }

      return NextResponse.json({
        code: retryResult.Code,
        message: retryResult.Message || "Concurrent limit reached and retry failed",
      }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({
      code: result.Code,
      message: result.Message || "Create instance failed",
    }, { status: 500, headers: corsHeaders });
  } catch (error) {
    console.error("Create instance error:", error);
    return NextResponse.json({
      code: -1,
      message: error.message || "Internal server error",
    }, { status: 500, headers: corsHeaders });
  }
};

// GET /api/instance - List tracked instances
export const GET = async () => {
  const instances = [];
  for (const [id, meta] of createdInstances) {
    instances.push({ agentInstanceId: id, createdAt: meta.createdAt, roomId: meta.roomId });
  }
  return NextResponse.json({
    code: 0,
    count: instances.length,
    instances,
  }, { headers: corsHeaders });
};

// DELETE /api/instance - Delete one or all agent instances
export const DELETE = async (request) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};

    // Allow DELETE with no body (cleanup all)
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }

    const agentInstanceId = body.agentInstanceId;

    // If no instanceId provided, delete ALL tracked instances
    if (!agentInstanceId) {
      const results = [];
      const deletePromises = [];
      for (const [id] of createdInstances) {
        deletePromises.push(
          sendAgentRequest("DeleteAgentInstance", { AgentInstanceId: id })
            .then(r => {
              createdInstances.delete(id);
              results.push({ agentInstanceId: id, code: r.Code, message: r.Message });
            })
            .catch(e => {
              results.push({ agentInstanceId: id, code: -1, message: e.message });
            })
        );
      }
      await Promise.all(deletePromises);
      return NextResponse.json({
        code: 0,
        message: `Cleaned up ${results.length} instances`,
        results,
      }, { headers: corsHeaders });
    }

    const result = await sendAgentRequest("DeleteAgentInstance", {
      AgentInstanceId: agentInstanceId,
    });

    if (result.Code === 0) {
      createdInstances.delete(agentInstanceId);
      return NextResponse.json({
        code: 0,
        message: "Agent instance deleted",
      }, { headers: corsHeaders });
    }

    // Instance not found (410001002) - treat as already deleted
    if (result.Code === 410001002) {
      createdInstances.delete(agentInstanceId);
      return NextResponse.json({
        code: 0,
        message: "Agent instance already deleted",
      }, { headers: corsHeaders });
    }

    return NextResponse.json({
      code: result.Code,
      message: result.Message || "Delete instance failed",
    }, { status: 500, headers: corsHeaders });
  } catch (error) {
    console.error("Delete instance error:", error);
    return NextResponse.json({
      code: -1,
      message: error.message || "Internal server error",
    }, { status: 500, headers: corsHeaders });
  }
};
