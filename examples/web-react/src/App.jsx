import { useState, useRef, useEffect } from "react";
import "./index.css";

// ========== Configuration ==========
const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clientConfig = {
  appId: toNumber(import.meta.env.VITE_APP_ID || window.__ZEGO_APPID__, 0),
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
};

// Generate unique IDs
const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to extract error message from various error types
const getErrorMessage = (error) => {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message && typeof error.message === "string") return error.message;
  if (error.msg && typeof error.msg === "string") return error.msg;
  if (error.errorMessage && typeof error.errorMessage === "string") return error.errorMessage;
  if (error.errorMsg && typeof error.errorMsg === "string") return error.errorMsg;
  if (error.errorCode) return `Error code: ${error.errorCode}`;
  if (error.code) return `Error code: ${error.code}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

function App() {
  // ========== State ==========
  const [status, setStatus] = useState("Ready");
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
    const [roomInfo, setRoomInfo] = useState(null);
  const [agentInstanceId, setAgentInstanceId] = useState(null);
  // Diagnostic subtitles: what ASR heard (user) and what the LLM replied (agent)
  const [userSubtitle, setUserSubtitle] = useState("");
  const [agentSubtitle, setAgentSubtitle] = useState("");

  // Refs for SDK instances
  const engineRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteViewRef = useRef(null);

  // ========== API Calls ==========

  // Get token from server
  const getToken = async (userId) => {
    const response = await fetch(`${clientConfig.apiBaseUrl}/api/token?userId=${userId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Get token failed");
    return data.token;
  };

  // Register agent
  const registerAgent = async () => {
    const response = await fetch(`${clientConfig.apiBaseUrl}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "ai_avatar_agent_v3", agentName: "AI Avatar" }),
    });
    const data = await response.json();
    if (data.code !== 0 && data.code !== undefined) {
      throw new Error(data.message || "Register agent failed");
    }
    return data;
  };

  // Create digital human agent instance
  const createInstance = async (params) => {
    const response = await fetch(`${clientConfig.apiBaseUrl}/api/instance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.message || `Create instance failed (code: ${data.code})`);
    }
    return data.data;
  };

  // Delete agent instance
  const deleteInstance = async (instanceId) => {
    const response = await fetch(`${clientConfig.apiBaseUrl}/api/instance`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentInstanceId: instanceId }),
    });
    const data = await response.json();
    return data;
  };

  // Clean up all existing instances on server
  const cleanupAllInstances = async () => {
    try {
      await fetch(`${clientConfig.apiBaseUrl}/api/instance`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // ignore cleanup errors
    }
  };

  // ========== Start Conversation ==========
  const startConversation = async () => {
    try {
      // Check configuration
      if (!clientConfig.appId) {
        setStatus("Error: VITE_APP_ID not configured");
        return;
      }

      const userId = generateId("user");
      const roomId = generateId("room");
      const userStreamId = generateId("user_stream");
      const agentStreamId = generateId("agent_stream");
      const agentUserId = generateId("agent_user");

      const currentRoom = { userId, roomId, userStreamId, agentStreamId, agentUserId };
      setRoomInfo(currentRoom);

      // Step 0: Clean up any stale instances
      setStatus("Cleaning up...");
      await cleanupAllInstances();

      // Step 1: Register agent (safe to call even if already registered)
      setStatus("Registering AI Agent...");
      await registerAgent();

      // Step 2: Create digital human agent instance
      setStatus("Creating digital human instance...");
      const instanceData = await createInstance({
        agentId: "ai_avatar_agent_v3",
        userId,
        roomId,
        agentStreamId,
        agentUserId,
        userStreamId,
        digitalHumanId: "c4b56d5c-db98-4d91-86d4-5a97b507da97",
      });
      setAgentInstanceId(instanceData.agentInstanceId);

      // Step 3: Get token
      setStatus("Getting token...");
      const token = await getToken(userId);

      // Step 4: Initialize ZEGO Express SDK and login room
      setStatus("Initializing ZEGO Express SDK...");
      const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");
      console.log("[Init] Creating ZegoExpressEngine with appId:", clientConfig.appId);
      const engine = new ZegoExpressEngine(clientConfig.appId, "");
      engineRef.current = engine;
      console.log("[Init] Engine created successfully");

      // Enable room channel messages so we receive ASR/LLM subtitles from the agent
      engine.callExperimentalAPI({ method: "onRecvRoomChannelMessage", params: {} });

      // Listen for agent messages: Cmd 3 = ASR (user speech), Cmd 4 = LLM (agent reply)
      engine.on("recvExperimentalAPI", (result) => {
        const { method, content } = result || {};
        if (method !== "onRecvRoomChannelMessage") return;
        try {
          const msg = JSON.parse(content.msgContent);
          const text = msg?.Data?.Text || "";
          if (msg.Cmd === 3) {
            console.log("[ASR] user said:", text);
            setUserSubtitle(text);
          } else if (msg.Cmd === 4) {
            console.log("[LLM] agent reply:", text);
            setAgentSubtitle(text);
          }
        } catch (e) {
          console.warn("[Subtitle] parse failed:", e);
        }
      });

      // Setup event handlers
      engine.on("roomStreamUpdate", async (roomID, updateType, streamList) => {
        if (updateType === "ADD" && streamList.length > 0) {
          for (const stream of streamList) {
            try {
              // Play agent stream with jitter buffer optimization
              const mediaStream = await engine.startPlayingStream(stream.streamID, {
                jitterBufferTarget: 500,
              });
              if (mediaStream) {
                const remoteView = engine.createRemoteStreamView(mediaStream);
                if (remoteView) {
                  remoteView.play("remote-video", { enableAutoplayDialog: false });
                  remoteViewRef.current = remoteView;
                }
              }
            } catch (err) {
              console.error("Play stream failed:", err);
            }
          }
        } else if (updateType === "DELETE") {
          for (const stream of streamList) {
            engine.stopPlayingStream(stream.streamID);
          }
        }
      });

      engine.on("roomUserUpdate", (roomID, updateType, userList) => {
        console.log("Room user update:", updateType, userList);
      });

      // Login room
      setStatus("Logging into room...");
      console.log("[Init] Logging into room:", roomId, "userId:", userId);
      await engine.loginRoom(roomId, token, {
        userID: userId,
        userName: userId,
      });
      console.log("[Init] Room login successful");

      // Step 5: Create local audio stream and publish
      setStatus("Creating audio stream...");
      console.log("[Init] Creating audio stream...");
      let localStream = null;
      try {
        localStream = await engine.createZegoStream({
          camera: { video: false, audio: true },
        });
        localStreamRef.current = localStream;
        console.log("[Init] Audio stream created successfully");

        await engine.startPublishingStream(userStreamId, localStream, {
          enableAutoSwitchVideoCodec: true,
        });
        console.log("[Init] Publishing stream started");
      } catch (streamError) {
        console.warn("[Init] Audio stream creation failed:", getErrorMessage(streamError));
        // In headless browser environments, audio capture may not be available.
        // Continue without local audio - the AI Avatar will still render its video.
        console.warn("Audio stream unavailable. Voice interaction may not work.");
      }

      setIsConnected(true);
      setStatus("Playing");
    } catch (error) {
      console.error("Start conversation failed:", error);
      setStatus(`Error: ${getErrorMessage(error)}`);
      await cleanup();
    }
  };

  // ========== End Conversation ==========
  const endConversation = async () => {
    try {
      setStatus("Ending conversation...");

      // Delete agent instance
      if (agentInstanceId) {
        await deleteInstance(agentInstanceId).catch(console.error);
      }

      await cleanup();
      setStatus("Ready");
    } catch (error) {
      console.error("End conversation failed:", error);
      setStatus(`Error: ${getErrorMessage(error)}`);
    }
  };

  const cleanup = async () => {
    const engine = engineRef.current;
    const localStream = localStreamRef.current;
    const room = roomInfo;
    const instanceId = agentInstanceId;

    // Delete agent instance first
    if (instanceId) {
      try {
        await deleteInstance(instanceId);
      } catch {
        // ignore cleanup errors
      }
    }

    if (engine) {
      try {
        if (localStream) {
          try { engine.destroyLocalStream(localStream); } catch {}
        }
        if (room) {
          try { engine.stopPublishingStream(room.userStreamId); } catch {}
          try { engine.logoutRoom(room.roomId); } catch {}
        }
        try { engine.destroyEngine(); } catch {}
      } catch {
        // ignore engine cleanup errors
      }
    }

    engineRef.current = null;
    localStreamRef.current = null;
    remoteViewRef.current = null;
    setIsConnected(false);
    setAgentInstanceId(null);
    setRoomInfo(null);
    setIsMicOn(true);
    setUserSubtitle("");
    setAgentSubtitle("");
  };

  // ========== Mic Toggle ==========
  const toggleMic = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const newMicState = !isMicOn;
    engine.muteMicrophone(!newMicState);
    setIsMicOn(newMicState);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // ========== Render ==========
  return (
    <div className="app-container">
      {/* Header */}
      <div className="app-header">
        <h1>Interactive AI Avatar</h1>
        <div className="status-bar">
          <span className={`status-dot ${isConnected ? "connected" : ""}`}></span>
          <span className="status-text">{status}</span>
          {roomInfo && <span className="room-info">Room: {roomInfo.roomId}</span>}
        </div>
      </div>

      {/* Video Container */}
      <div className="video-section">
        <div id="remote-video" className="video-container">
          {!isConnected && (
            <div className="video-placeholder">
              <div className="avatar-icon">&#x1F916;</div>
              <p>Click "Start Conversation" to begin</p>
            </div>
          )}
          {isConnected && (userSubtitle || agentSubtitle) && (
            <div className="subtitles">
              {userSubtitle && <p className="subtitle-user">🧑 {userSubtitle}</p>}
              {agentSubtitle && <p className="subtitle-agent">🤖 {agentSubtitle}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="controls-section">
        <div className="action-buttons">
          <button
            onClick={toggleMic}
            disabled={!isConnected}
            className={`btn btn-mic ${isMicOn ? "mic-on" : "mic-off"}`}
          >
            {isMicOn ? "Mic ON" : "Mic OFF"}
          </button>
          {!isConnected ? (
            <button onClick={startConversation} className="btn btn-start">
              Start Conversation
            </button>
          ) : (
            <button onClick={endConversation} className="btn btn-end">
              End Conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
