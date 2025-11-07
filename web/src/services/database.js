// Serviço para comunicação com o banco de dados via Netlify Functions

const API_BASE = "/.netlify/functions";

/**
 * Salva um resultado no banco de dados
 */
export async function saveResult(result, gameType = "double") {
  try {
    const response = await fetch(`${API_BASE}/save-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, gameType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao salvar resultado");
    }

    return await response.json();
  } catch (error) {
    console.error("Erro ao salvar resultado:", error);
    throw error;
  }
}

/**
 * Busca os últimos resultados do banco de dados
 */
export async function getResults(gameType = "double", limit = 5000) {
  try {
    const response = await fetch(
      `${API_BASE}/get-results?gameType=${gameType}&limit=${limit}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao buscar resultados");
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Erro ao buscar resultados:", error);
    throw error;
  }
}

/**
 * Salva um sinal no banco de dados
 */
export async function saveSignal(signal, gameType = "double") {
  try {
    const response = await fetch(`${API_BASE}/save-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal, gameType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao salvar sinal");
    }

    return await response.json();
  } catch (error) {
    console.error("Erro ao salvar sinal:", error);
    throw error;
  }
}

/**
 * Busca o histórico de sinais do banco de dados
 */
export async function getSignals(gameType = "double", limit = 2000) {
  try {
    const response = await fetch(
      `${API_BASE}/get-signals?gameType=${gameType}&limit=${limit}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao buscar sinais");
    }

    const data = await response.json();
    return data.signals || [];
  } catch (error) {
    console.error("Erro ao buscar sinais:", error);
    throw error;
  }
}

/**
 * Salva o sinal ativo atual no banco de dados
 */
export async function saveActiveSignal(signal, gameType = "double") {
  try {
    const response = await fetch(`${API_BASE}/active-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal, gameType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao salvar sinal ativo");
    }

    return await response.json();
  } catch (error) {
    console.error("Erro ao salvar sinal ativo:", error);
    throw error;
  }
}

/**
 * Busca o sinal ativo atual do banco de dados
 */
export async function getActiveSignal(gameType = "double") {
  try {
    const response = await fetch(
      `${API_BASE}/active-signal?gameType=${gameType}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao buscar sinal ativo");
    }

    const data = await response.json();
    return data.signal || null;
  } catch (error) {
    console.error("Erro ao buscar sinal ativo:", error);
    throw error;
  }
}
