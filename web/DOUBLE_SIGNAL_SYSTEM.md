# Sistema de Sinais Inteligentes do Double

## 📋 Visão Geral

O sistema de sinais do Double agora possui validação completa de sinais com estratégia Martingale, similar ao sistema da roleta. Cada sinal é rastreado por até 3 tentativas e automaticamente limpo ao acertar ou após expirar.

---

## 🎯 Funcionamento

### 1. **Detecção de Padrões**

O sistema analisa os últimos resultados e detecta padrões como:

- **color_streak**: Sequência de 5+ da mesma cor
- **triple_repeat**: 3 resultados iguais seguidos (sugere cor oposta)
- **red_black_balance**: Desequilíbrio entre vermelho/preto nos últimos 20 giros
- **alternation_break**: Alternância prolongada de cores (sugere quebra)
- **two_in_a_row_trend**: Dupla da mesma cor (sugere continuidade)

### 2. **Emissão de Sinal**

Quando um padrão forte é detectado:

- ✅ Gera sinal com confiança (0-10)
- ✅ Define cor alvo (red/black/white)
- ✅ Válido por **3 tentativas** (Martingale)
- ✅ Ativa cooldown para evitar spam

### 3. **Validação por Tentativas**

```javascript
Tentativa 1: Aposta R$ 10
  ├─ Acertou? → ✅ LIMPAR SINAL (WIN)
  └─ Errou? → Continua...

Tentativa 2: Aposta R$ 20 (2x)
  ├─ Acertou? → ✅ LIMPAR SINAL (WIN)
  └─ Errou? → Continua...

Tentativa 3: Aposta R$ 40 (4x)
  ├─ Acertou? → ✅ LIMPAR SINAL (WIN)
  └─ Errou? → ❌ LIMPAR SINAL (LOSS)
```

### 4. **Sistema de Cooldown**

```javascript
WIN:  15 segundos (cooldownMs)
LOSS: 45 segundos (cooldownMs + cooldownAfterLossMs)
```

- Após WIN: aguarda 15s para próximo sinal
- Após LOSS: aguarda 45s (penalidade por perda)

---

## ⚙️ Configurações

### `double.config.js`

```javascript
{
  // Validação
  validForSpins: 3,              // Número de tentativas (Martingale)

  // Cooldowns
  cooldownMs: 15000,             // 15s após WIN
  cooldownAfterLossMs: 30000,    // +30s após LOSS (total: 45s)

  // Martingale
  baseAmount: 10,                // Aposta base (R$)
  martingaleMultiplier: 2,       // Multiplicador (2x, 4x, 8x...)
}
```

---

## 📊 Interface

### Estados do Sinal

#### **Sem Sinal**

```
🔍 Analisando padrões...
Próximo sinal em 3 resultado(s)
```

#### **Sinal Ativo - Primeira Tentativa**

```
🎯 Aposte após o número: [7]
💰 Próxima Aposta (Martingale)
Tentativa 1/3: R$ 10.00
```

#### **Sinal Ativo - Tentativas em Andamento**

```
📊 Tentativa 2/3

#1: Resultado 8 (black) - R$ 10.00 - ❌ LOSS
#2: Resultado 3 (red) - R$ 20.00 - ...

💰 Próxima Aposta (Martingale)
Tentativa 2/3: R$ 20.00
```

#### **Após 3 Tentativas (LOSS)**

```
❌ Nenhum padrão forte detectado
(aguardando cooldown de 45s)
```

---

## 🔄 Fluxo Completo

```
1. DETECÇÃO
   └─> Analisa últimos resultados
   └─> Detecta padrão forte
   └─> Gera sinal (cor + confiança)

2. SINAL ATIVO
   └─> Exibe cor sugerida
   └─> Mostra valor Martingale
   └─> Aguarda próximo resultado

3. VALIDAÇÃO
   └─> Novo resultado chega
   └─> Verifica se acertou
   ├─> ✅ WIN: Limpa sinal + cooldown 15s
   └─> ❌ MISS: Próxima tentativa

4. EXPIRAÇÃO (após 3 tentativas)
   └─> Limpa sinal
   └─> Cooldown 45s
   └─> Volta para DETECÇÃO
```

---

## 🎮 Diferenças vs Sistema Antigo

| Aspecto    | Sistema Antigo    | Sistema Novo               |
| ---------- | ----------------- | -------------------------- |
| Validação  | ❌ Não validava   | ✅ Valida win/loss         |
| Tentativas | ❌ Sem controle   | ✅ 3 tentativas rastreadas |
| Martingale | ❌ Não suportava  | ✅ Valores sugeridos       |
| Cooldown   | ⚠️ Apenas tempo   | ✅ Diferenciado (WIN/LOSS) |
| Limpeza    | ❌ Manual         | ✅ Automática              |
| Histórico  | ❌ Não registrava | ✅ Histórico completo      |

---

## 🧪 Exemplo Prático

### Cenário: Padrão "Trinca Vermelha"

```
Resultados: [1, 2, 3] (3 vermelhos seguidos)
Sinal: "Aposte PRETO" (cor oposta)
```

#### Tentativa 1

- Aposta: R$ 10 no PRETO
- Resultado: `8` (preto) → ✅ **WIN!**
- Ação: Limpa sinal, cooldown 15s

#### Se errasse na Tentativa 1

- Resultado: `3` (vermelho) → ❌ MISS
- Próxima: R$ 20 no PRETO (tentativa 2/3)

#### Se errasse todas as 3

- Tentativa 1: R$ 10 ❌
- Tentativa 2: R$ 20 ❌
- Tentativa 3: R$ 40 ❌
- Ação: Limpa sinal, cooldown **45s**

---

## 📝 Logs de Debug

```javascript
// Detecção
[Double Signal] Analisando 45 resultados
[Double Signal] ✅ Novo sinal: triple_repeat Confiança: 8.2 Cor: black

// Validação
[Double Validation] Novo resultado: 8 black
[Double Signal] ✅ WIN após 1 tentativa(s)

// ou

[Double Validation] Novo resultado: 3 red
[Double Signal] Tentativa 1/3
[Double Validation] Novo resultado: 5 red
[Double Signal] Tentativa 2/3
[Double Validation] Novo resultado: 2 red
[Double Signal] ❌ LOSS após 3 tentativa(s)
```

---

## 🚀 Benefícios

1. ✅ **Sinais Validados**: Rastreia acertos/erros reais
2. ✅ **Gestão de Banca**: Valores Martingale sugeridos
3. ✅ **Sem Spam**: Cooldowns inteligentes evitam sinais excessivos
4. ✅ **Transparência**: Mostra todas as tentativas e resultados
5. ✅ **Aprendizado**: Histórico para análise futura
6. ✅ **UX Melhorada**: Interface clara do status do sinal

---

## ⚠️ Importante

- O sistema **NÃO gera novo sinal** enquanto houver um ativo
- Cooldown após LOSS é **3x maior** que após WIN
- Valores Martingale são **sugestões**, não obrigatórios
- Amostra mínima: **12 resultados** antes do primeiro sinal
