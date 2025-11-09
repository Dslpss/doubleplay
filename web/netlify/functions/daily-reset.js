/* eslint-env node */
import process from "node:process";
import { Buffer } from "node:buffer";
import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI env var");
  const dbName = process.env.MONGODB_DB || "doubleplay";
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

function json(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

function isAuthorized(headers) {
  const adminUser = process.env.ADMIN_USER || "";
  const adminPass = process.env.ADMIN_PASS || "";
  const auth = headers?.authorization || headers?.Authorization || "";
  if (!auth.startsWith("Basic ")) return false;
  const token = auth.slice(6);
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [user, pass] = decoded.split(":");
    return user === adminUser && pass === adminPass;
  } catch {
    return false;
  }
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, { ok: true });
  try {
    // Proteção simples via Basic Auth
    if (!isAuthorized(event.headers)) {
      return json(401, { ok: false, error: "unauthorized" });
    }

    const db = await getDb();
    const resetResults = String(process.env.RESET_RESULTS_AT_MIDNIGHT || "true").toLowerCase() === "true";

    const outcomesCol = db.collection("signals_outcomes");
    const resultsCol = db.collection("results");

    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Limpar documentos do dia anterior para “reset” de métricas
    // Como TTL mantém 24h, o reset força novo dia “limpo” imediatamente
    const delOutcomes = await outcomesCol.deleteMany({ savedAt: { $lt: midnight } });
    let delResults = { deletedCount: 0 };
    if (resetResults) {
      delResults = await resultsCol.deleteMany({ savedAt: { $lt: midnight } });
    }

    return json(200, {
      ok: true,
      deleted: {
        signals_outcomes: delOutcomes?.deletedCount ?? 0,
        results: delResults?.deletedCount ?? 0,
      },
      resetResults,
      ts: Date.now(),
    });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

export default handler;