/* eslint-env node */
/* global process, Buffer */
// Função agendada para limpar dados diariamente à meia-noite
import process from "node:process";
import { Buffer } from "node:buffer";
import { connectToDatabase, ensureIndexes } from "./db-utils.js";

// Executa diariamente à meia-noite (UTC). Ajuste se precisar de outro fuso.
export const config = {
  schedule: "0 0 * * *",
};

export const handler = async (event) => {
  try {
    // Autorização somente para invocação HTTP manual
    const isHttp = !!(event && event.httpMethod);
    if (isHttp) {
      const ADMIN_USER = process.env.ADMIN_USER;
      const ADMIN_PASS = process.env.ADMIN_PASS;

      if (!ADMIN_USER || !ADMIN_PASS) {
        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            ok: false,
            error:
              "Variáveis ADMIN_USER e ADMIN_PASS não configuradas no ambiente",
          }),
        };
      }

      // Tenta Authorization: Basic
      const hdrs = event.headers || {};
      const authHeader = hdrs.authorization || hdrs.Authorization || "";
      let user = null;
      let pass = null;
      if (authHeader.startsWith("Basic ")) {
        try {
          const decoded = Buffer.from(authHeader.slice(6), "base64").toString(
            "utf8"
          );
          const [u, p] = decoded.split(":");
          user = u;
          pass = p;
        } catch (e) {
          // Ignora erros de parse do cabeçalho Authorization
          void e;
        }
      }
      // Fallback: query params
      if (!user || !pass) {
        const params = event.queryStringParameters || {};
        user = user || params.user;
        pass = pass || params.pass;
      }
      // Fallback: JSON body
      if ((!user || !pass) && event.body) {
        try {
          const body = JSON.parse(event.body);
          user = user || body.user;
          pass = pass || body.pass;
        } catch (e) {
          // Ignora erros de parse do corpo JSON
          void e;
        }
      }
      if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
        return {
          statusCode: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({ ok: false, error: "Não autorizado" }),
        };
      }
    }

    const { db } = await connectToDatabase();
    await ensureIndexes(db);

    const resultsCollection = db.collection("results");
    const signalsCollection = db.collection("signals");
    const activeSignalsCollection = db.collection("active_signals");

    const delResults = await resultsCollection.deleteMany({});
    const delSignals = await signalsCollection.deleteMany({});
    const delActive = await activeSignalsCollection.deleteMany({});

    const payload = {
      ok: true,
      message: "Reset diário executado",
      deleted: {
        results: delResults?.deletedCount ?? 0,
        signals: delSignals?.deletedCount ?? 0,
        active_signals: delActive?.deletedCount ?? 0,
      },
      ts: Date.now(),
    };

    // Se invocado via HTTP (para testes), retorna resposta JSON
    if (event && event.httpMethod) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(payload),
      };
    }

    // Em execução agendada, apenas log (sem resposta HTTP)
    // eslint-disable-next-line no-console
    console.log("[daily-reset]", payload);
    return payload;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[daily-reset] erro:", error);
    const payload = { ok: false, error: error.message };
    if (event && event.httpMethod) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(payload),
      };
    }
    return payload;
  }
};