import { useState } from "react";
import { manualReset } from "../services/api";

export default function AdminResetPanel() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  const onReset = async () => {
    setLoading(true);
    setMessage("");
    setResult(null);
    const res = await manualReset(user, pass);
    setLoading(false);
    if (res.ok) {
      setMessage("✅ Reset executado com sucesso");
      setResult(res);
    } else {
      setMessage(`❌ ${res.error || "Falha ao executar reset"}`);
    }
  };

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "24px auto",
        border: "1px solid #374151",
        borderRadius: 8,
        padding: 16,
        background: "#1f2937",
        color: "#ecf0f1",
      }}>
      <h2 style={{ marginTop: 0 }}>Área Admin – Reset Manual</h2>
      <p style={{ fontSize: 13, opacity: 0.9 }}>
        Informe usuário e senha para executar o reset dos dados do dia.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Usuário</span>
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="admin"
            style={{ padding: 8, borderRadius: 4, border: "1px solid #374151" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Senha</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="********"
            style={{ padding: 8, borderRadius: 4, border: "1px solid #374151" }}
          />
        </label>

        <button
          onClick={onReset}
          disabled={loading || !user || !pass}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #f59e0b",
            background: loading ? "#6b7280" : "#f59e0b",
            color: "#111827",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}>
          {loading ? "Executando..." : "Executar Reset Agora"}
        </button>

        {message && (
          <div style={{ marginTop: 10, fontSize: 13 }}>{message}</div>
        )}
        {result && (
          <pre
            style={{
              marginTop: 10,
              maxHeight: 240,
              overflow: "auto",
              background: "#111827",
              padding: 12,
              borderRadius: 6,
              border: "1px solid #374151",
            }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}