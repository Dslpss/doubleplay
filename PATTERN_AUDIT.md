# Auditoria de Padrões da Roleta

## Padrões Detectados (32 total)

### ✅ Configurados Corretamente (com prioridade E descrição)
1. **neighbors_cluster** - Prioridade: 10 ✓ Descrição: ✓
2. **sector_voisins** - Prioridade: 9 ✓ Descrição: ✓
3. **sector_tiers** - Prioridade: 9 ✓ Descrição: ✓
4. **sector_orphelins** - Prioridade: 9 ✓ Descrição: ✓
5. **column_cold** - Prioridade: 6 ✓ Descrição: ✓
6. **dozen_cold** - Prioridade: 6 ✓ Descrição: ✓
7. **red_black_balance** - Prioridade: 5 ✓ Descrição: ✓
8. **column_triple** - Prioridade: 4 ✓ Descrição: ✓
9. **dozen_imbalance** - Prioridade: 4 ✓ Descrição: ✓
10. **highlow_streak** - Prioridade: 3 ✓ Descrição: ✓
11. **parity_streak** - Prioridade: 3 ✓ Descrição: ✓
12. **zero_proximity** - Prioridade: 2 ✓ Descrição: ✓

### ⚠️ SEM PRIORIDADE (usarão default: 1)
13. **alternating_opposite_sectors** - ❌ Prioridade | ❌ Descrição
14. **brother_numbers** - ❌ Prioridade | ❌ Descrição
15. **cobra_bet** - ❌ Prioridade | ❌ Descrição
16. **color_alternation** - ❌ Prioridade | ✓ Descrição
17. **color_streak** - ❌ Prioridade | ✓ Descrição
18. **column_imbalance** - ❌ Prioridade | ❌ Descrição
19. **dormant_numbers** - ❌ Prioridade | ✓ Descrição
20. **hot_numbers** - ❌ Prioridade | ❌ Descrição
21. **mirrored_numbers** - ❌ Prioridade | ❌ Descrição
22. **multiples_of_last** - ❌ Prioridade | ❌ Descrição
23. **neighbors_bet** - ❌ Prioridade | ❌ Descrição
24. **neighbors_last** - ❌ Prioridade | ✓ Descrição
25. **opposite_sector** - ❌ Prioridade | ❌ Descrição
26. **pivot_number** - ❌ Prioridade | ✓ Descrição
27. **quick_repeat** - ❌ Prioridade | ❌ Descrição
28. **repeated_numbers** - ❌ Prioridade | ✓ Descrição
29. **sector_jeu_zero** - ❌ Prioridade | ✓ Descrição
30. **sequential_numbers** - ❌ Prioridade | ❌ Descrição
31. **wheel_cluster_drift** - ❌ Prioridade | ✓ Descrição
32. **zero_then_multiple10** - ❌ Prioridade | ❌ Descrição

### 🔍 Padrões em PATTERN_PRIORITIES mas NÃO detectados
- **hot_numbers_trio** - Prioridade: 8 (nunca é criado no código!)
- **finals_concentration** - Prioridade: 5 (nunca é criado no código!)

## 🚨 Problemas Identificados

### Crítico:
1. **20 padrões sem prioridade** → usarão default 1, muito baixo para passar MIN_CONFIDENCE (6.5)
2. **2 padrões fantasma** (hot_numbers_trio, finals_concentration) → nunca serão emitidos
3. **hot_numbers** existe mas deveria ser **hot_numbers_trio**

### Médio:
4. **13 padrões sem descrição amigável** → mostrarão texto técnico feio
5. **Inconsistência** entre padrões detectados vs configurados

## 💡 Recomendações

### Ação 1: Adicionar prioridades faltantes
```javascript
export const PATTERN_PRIORITIES = {
  // ... existentes ...
  
  // Adicionar:
  hot_numbers: 8, // Números quentes (renomear hot_numbers_trio)
  neighbors_bet: 7, // Vizinhos diretos
  neighbors_last: 7, // Vizinhos do último
  pivot_number: 7, // Número pivô
  wheel_cluster_drift: 6, // Drift de cluster
  sector_jeu_zero: 6, // Setor Jeu Zero
  color_streak: 5, // Sequência de cor
  color_alternation: 5, // Alternância de cor
  dormant_numbers: 5, // Números dormentes
  repeated_numbers: 4, // Repetição
  column_imbalance: 4, // Desequilíbrio coluna
  quick_repeat: 3, // Repetição rápida
  sequential_numbers: 3, // Números sequenciais
  brother_numbers: 2, // Números irmãos
  mirrored_numbers: 2, // Números espelhados
  opposite_sector: 2, // Setor oposto
  cobra_bet: 2, // Aposta cobra
  multiples_of_last: 1, // Múltiplos
  zero_then_multiple10: 1, // Zero → múltiplo 10
  alternating_opposite_sectors: 1, // Alternância setores
};
```

### Ação 2: Adicionar descrições amigáveis
```javascript
const friendlyDescriptions = {
  // ... existentes ...
  
  // Adicionar:
  hot_numbers: "🔥 Número quente detectado! Ele está caindo muito.",
  neighbors_bet: "🎯 Vizinhos diretos! Aposte nos números adjacentes na roda.",
  opposite_sector: "↔️ Setor oposto na roda! Números do lado contrário.",
  brother_numbers: "👯 Números irmãos! Padrão de conexão detectado.",
  mirrored_numbers: "🪞 Números espelhados! Simetria na roda.",
  cobra_bet: "🐍 Aposta Cobra! Padrão em forma de serpente.",
  multiples_of_last: "✖️ Múltiplos do último número! Progressão matemática.",
  sequential_numbers: "🔢 Números em sequência! Padrão consecutivo.",
  quick_repeat: "🔁 Repetição rápida! Número pode sair de novo.",
  column_imbalance: "📊 Coluna desbalanceada! Uma está dominando.",
  zero_then_multiple10: "🟢➡️🔟 Zero seguido de múltiplo de 10! Padrão raro.",
  alternating_opposite_sectors: "↔️🔄 Setores opostos alternando! Padrão complexo.",
};
```

## ✅ Status dos Targets (extractTargetNumbers)

Tipos suportados:
- ✅ numbers
- ✅ color
- ✅ column
- ✅ dozen
- ✅ sector
- ✅ clusters
- ✅ highlow
- ✅ parity

**Todos os tipos necessários estão implementados!**
