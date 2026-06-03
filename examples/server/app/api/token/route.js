import { createCipheriv } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// CORS headers for cross-origin access
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Headers": "Content-Type",
};

// ========== Token Generation Utility Functions ==========

const makeNonce = () => {
  const min = -2147483648;
  const max = 2147483647;
  return Math.ceil(min + (max - min) * Math.random());
};

const makeRandomIv = () => {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const out = [];
  for (let i = 0; i < 16; i += 1) {
    out.push(chars.charAt(Math.floor(Math.random() * chars.length)));
  }
  return out.join("");
};

const getAlgorithm = (key) => {
  const length = Buffer.from(key).length;
  if (length === 16) return "aes-128-cbc";
  if (length === 24) return "aes-192-cbc";
  if (length === 32) return "aes-256-cbc";
  throw new Error(`Invalid ServerSecret length: ${length}`);
};

const aesEncrypt = (plainText, key, iv) => {
  const cipher = createCipheriv(getAlgorithm(key), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
  return Uint8Array.from(encrypted).buffer;
};

// Generate ZEGO Token (version 04)
const generateToken04 = (appId, userId, secret, effectiveTimeInSeconds, payload = "") => {
  if (!appId || typeof appId !== "number") {
    throw new Error("Invalid appId");
  }
  if (!userId) {
    throw new Error("Invalid userId");
  }
  if (!secret || secret.length !== 32) {
    throw new Error("ServerSecret must be a 32-character string");
  }

  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload,
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const encryptBuf = aesEncrypt(plainText, secret, iv);

  const b1 = new Uint8Array(8);
  const b2 = new Uint8Array(2);
  const b3 = new Uint8Array(2);
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);

  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
  ]);

  return `04${Buffer.from(buf).toString("base64")}`;
};

// ========== HTTP Route Handlers ==========

export const OPTIONS = async () => {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
};

// GET /api/token?userId=xxx - Generate ZEGO RTC Token
export const GET = async (request) => {
  // Read APP_ID and SERVER_SECRET with fallback from environment variables
  const appId = Number(process.env.APP_ID || process.env.ZEGO_APPID || 0);
  const serverSecret = process.env.SERVER_SECRET || process.env.ZEGO_SERVER_SECRET || "";
  const tokenExpireSeconds = Number(process.env.TOKEN_EXPIRE_SECONDS || 3600);
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400, headers: corsHeaders });
  }

  const token = generateToken04(appId, userId, serverSecret, tokenExpireSeconds, "");
  return NextResponse.json({ token }, { headers: corsHeaders });
};
