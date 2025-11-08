// Serviço de banco de dados LOCAL usando IndexedDB (navegador)
// Substitui MongoDB - Funciona 100% offline

const DB_NAME = "DoublePlayDB";
const DB_VERSION = 1;

// Stores (tabelas)
const STORES = {
  DOUBLE_SIGNALS: "double_signals",
  ROULETTE_SIGNALS: "roulette_signals",
  ACTIVE_SIGNALS: "active_signals",
};

/**
 * Inicializa o banco de dados IndexedDB
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Criar stores se não existirem
      if (!db.objectStoreNames.contains(STORES.DOUBLE_SIGNALS)) {
        const store = db.createObjectStore(STORES.DOUBLE_SIGNALS, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("hit", "hit", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ROULETTE_SIGNALS)) {
        const store = db.createObjectStore(STORES.ROULETTE_SIGNALS, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("hit", "hit", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ACTIVE_SIGNALS)) {
        db.createObjectStore(STORES.ACTIVE_SIGNALS, { keyPath: "gameType" });
      }
    };
  });
}

/**
 * Salva um sinal no banco local
 */
export async function saveSignal(signal, gameType = "double") {
  try {
    const db = await initDB();
    const storeName =
      gameType === "double" ? STORES.DOUBLE_SIGNALS : STORES.ROULETTE_SIGNALS;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);

      const signalData = {
        ...signal,
        timestamp: signal.timestamp || Date.now(),
        gameType,
      };

      const request = store.add(signalData);

      request.onsuccess = () => {
        console.log(`✅ Sinal salvo no IndexedDB (${gameType})`);
        resolve({ success: true, id: request.result });
      };

      request.onerror = () => {
        console.error("❌ Erro ao salvar sinal:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("❌ Erro ao salvar sinal:", error);
    // Não falha silenciosamente - apenas loga
    return { success: false, error: error.message };
  }
}

/**
 * Busca sinais do banco local
 */
export async function getSignals(gameType = "double", limit = 2000) {
  try {
    const db = await initDB();
    const storeName =
      gameType === "double" ? STORES.DOUBLE_SIGNALS : STORES.ROULETTE_SIGNALS;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const index = store.index("timestamp");

      // Buscar em ordem decrescente (mais recentes primeiro)
      const request = index.openCursor(null, "prev");
      const signals = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && signals.length < limit) {
          signals.push(cursor.value);
          cursor.continue();
        } else {
          resolve(signals);
        }
      };

      request.onerror = () => {
        console.error("❌ Erro ao buscar sinais:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("❌ Erro ao buscar sinais:", error);
    return []; // Retorna array vazio em caso de erro
  }
}

/**
 * Salva o sinal ativo atual
 */
export async function saveActiveSignal(signal, gameType = "double") {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.ACTIVE_SIGNALS], "readwrite");
      const store = transaction.objectStore(STORES.ACTIVE_SIGNALS);

      if (signal === null) {
        // Remover sinal ativo
        const request = store.delete(gameType);
        request.onsuccess = () => {
          resolve({ success: true });
        };
        request.onerror = () => reject(request.error);
      } else {
        // Salvar sinal ativo
        const request = store.put({ gameType, signal, timestamp: Date.now() });
        request.onsuccess = () => {
          resolve({ success: true });
        };
        request.onerror = () => reject(request.error);
      }
    });
  } catch (error) {
    console.error("❌ Erro ao salvar sinal ativo:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Busca o sinal ativo atual
 */
export async function getActiveSignal(gameType = "double") {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.ACTIVE_SIGNALS], "readonly");
      const store = transaction.objectStore(STORES.ACTIVE_SIGNALS);
      const request = store.get(gameType);

      request.onsuccess = () => {
        const data = request.result;
        resolve(data ? data.signal : null);
      };

      request.onerror = () => {
        console.error("❌ Erro ao buscar sinal ativo:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("❌ Erro ao buscar sinal ativo:", error);
    return null;
  }
}

/**
 * Limpa todos os dados (útil para reset/debug)
 */
export async function clearAllData() {
  try {
    const db = await initDB();

    const storeNames = [
      STORES.DOUBLE_SIGNALS,
      STORES.ROULETTE_SIGNALS,
      STORES.ACTIVE_SIGNALS,
    ];

    const transaction = db.transaction(storeNames, "readwrite");

    for (const storeName of storeNames) {
      transaction.objectStore(storeName).clear();
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log("🗑️ Todos os dados foram limpos do IndexedDB");
        resolve({ success: true });
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("❌ Erro ao limpar dados:", error);
    throw error;
  }
}
