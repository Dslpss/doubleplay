/* eslint-env node */
import { Buffer } from 'node:buffer';
import { MongoClient } from 'mongodb';

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI env var');
  const dbName = process.env.MONGODB_DB || 'doubleplay';
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function isAuthorized(headers) {
  const adminUser = process.env.ADMIN_USER || '';
  const adminPass = process.env.ADMIN_PASS || '';
  const auth = headers?.authorization || headers?.Authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const token = auth.slice(6);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    return user === adminUser && pass === adminPass;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  try {
    if (!isAuthorized(req.headers)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    const db = await getDb();
    const resetResults = String(process.env.RESET_RESULTS_AT_MIDNIGHT || 'true').toLowerCase() === 'true';

    const outcomesCol = db.collection('signals_outcomes');
    const resultsCol = db.collection('results');

    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const delOutcomes = await outcomesCol.deleteMany({ savedAt: { $lt: midnight } });
    let delResults = { deletedCount: 0 };
    if (resetResults) {
      delResults = await resultsCol.deleteMany({ savedAt: { $lt: midnight } });
    }

    res.status(200).json({
      ok: true,
      deleted: {
        signals_outcomes: delOutcomes?.deletedCount ?? 0,
        results: delResults?.deletedCount ?? 0,
      },
      resetResults,
      ts: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}