/* eslint-env node */
import process from "node:process";
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

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export async function handler() {
  try {
    const db = await getDb();
    const alertsCol = db.collection("alerts");
    const resultsCol = db.collection("results");
    const outcomesCol = db.collection("signals_outcomes");

    // Buscar alerta atual do Double
    const current = await alertsCol.findOne({ _id: "current_double" });
    const signal = current?.signal || null;
    if (!signal) {
      return json(200, { ok: true, processed: false, reason: "no current signal" });
    }

    const validFor = Number(signal.validFor || 3);
    const targets = Array.isArray(signal.targets) ? signal.targets.map(Number) : [];
    const ts = Number(signal.timestamp || 0);
    if (!ts || targets.length === 0) {
      return json(200, { ok: false, processed: false, error: "invalid signal fields" });
    }

    // Coletar resultados após o timestamp do sinal
    const attempts = await resultsCol
      .find({ kind: "double", timestamp: { $gt: ts } })
      .sort({ timestamp: 1 })
      .limit(validFor)
      .toArray();

    if (!attempts || attempts.length === 0) {
      return json(200, { ok: true, processed: false, reason: "no results yet" });
    }

    // Determinar se houve acerto ou expirou
    let hit = false;
    let hitOnAttempt = null;
    const attemptResults = [];
    for (let i = 0; i < attempts.length; i++) {
      const num = Number(attempts[i]?.number);
      attemptResults.push({ resultNumber: num, hit: targets.includes(num) });
      if (!hit && targets.includes(num)) {
        hit = true;
        hitOnAttempt = i + 1;
        break;
      }
    }

    // Se ainda não completou o número de tentativas e não acertou, aguardar
    if (!hit && attempts.length < validFor) {
      return json(200, { ok: true, processed: false, reason: "awaiting more results" });
    }

    const last = attempts[attempts.length - 1];
    const record = {
      kind: "double",
      hit,
      hitOnAttempt: hit ? hitOnAttempt : null,
      description: signal.description || "",
      confidence: typeof signal.confidence === "number" ? signal.confidence : null,
      timestamp: Date.now(),
      targets,
      resultNumber: Number(last?.number ?? null),
      attempts: attemptResults,
      savedAt: new Date(),
    };

    await outcomesCol.insertOne(record);

    // Marcar alerta como resolvido, limpando o current
    await alertsCol.updateOne(
      { _id: "current_double" },
      { $set: { signal: null, resolvedAt: new Date() } }
    );

    return json(200, { ok: true, processed: true, outcomeSaved: true, hit, hitOnAttempt });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

export default handler;