# ⚠️ AÇÃO NECESSÁRIA: Configurar Credenciais

## Status Atual

✅ Servidor de desenvolvimento criado e funcionando
✅ Frontend conectando ao servidor local  
⚠️ **Aguardando suas credenciais do Play na Bet**

## O Que Fazer Agora

### 1. Adicione Suas Credenciais

Edite o arquivo `web/.env` e substitua:

```env
PLAYNABETS_USER=seu_email@exemplo.com
PLAYNABETS_PASS=sua_senha
```

Por suas credenciais reais:

```env
PLAYNABETS_USER=seuemail@real.com
PLAYNABETS_PASS=suasenhareal
```

### 2. Reinicie o Servidor de Desenvolvimento

Após adicionar as credenciais, pressione `Ctrl+C` no terminal do servidor e reinicie:

```bash
npm run dev:server
```

### 3. Verifique se Está Funcionando

Os sinais devem começar a aparecer automaticamente na interface!

## Servidores Rodando

- 🔵 **Backend (dev-server)**: http://localhost:3001/events
- 🟢 **Frontend (Vite)**: http://localhost:5173

## Como Funciona Agora

### Antes (só funcionava no Netlify)

```
Frontend → Netlify Edge Function → APIs Externas
```

### Agora (funciona em dev também!)

```
Frontend → dev-server.js local → APIs Externas
```

## Para Parar os Servidores

Pressione `Ctrl+C` em cada terminal.

## Estrutura de Arquivos Criados/Modificados

```
web/
├── dev-server.js          ← NOVO: Servidor local SSE
├── .env                   ← NOVO: Suas credenciais (não commitar!)
├── .env.example          ← Atualizado com todas as variáveis
├── DEV_SETUP.md          ← NOVO: Documentação completa
├── QUICK_START.md        ← Este arquivo
├── package.json          ← Atualizado com novos scripts
└── src/
    └── services/
        └── wsClient.js   ← Atualizado para funcionar em dev/prod
```

## Comandos Disponíveis

- `npm run dev` - Inicia apenas o frontend
- `npm run dev:server` - Inicia apenas o servidor de desenvolvimento
- `npm run dev:all` - Inicia ambos simultaneamente (requer `concurrently`)

## Troubleshooting

### Sinais não aparecem

1. Verifique se suas credenciais estão corretas no `.env`
2. Verifique o console do terminal do servidor para erros
3. Verifique o console do navegador (F12)

### Erro de login

- Credenciais incorretas
- Site do Play na Bet pode estar fora do ar
- Tente fazer login manual no site

### Porta 3001 já em uso

Altere no `.env`:

```env
DEV_SERVER_PORT=3002
```

E também em:

```env
VITE_SERVER_URL=http://localhost:3002
```

## Deploy para Produção (Netlify)

O código já está preparado! No Netlify:

1. Configure as mesmas variáveis de ambiente (exceto `VITE_SERVER_URL`)
2. O app detectará automaticamente que está em produção
3. Usará a Edge Function do Netlify ao invés do servidor local

**Não precisa mudar nada no código!** 🎉

## Deploy para Produção (Vercel)

Você pode publicar somente o frontend na Vercel. Para manter os dados em tempo real, use o SSE fornecido pelo seu backend (por exemplo, o Edge Function do Netlify) via `VITE_SERVER_URL`.

1. No painel da Vercel, crie um novo projeto e importe este repositório.
2. Em Project Settings, defina `Root Directory` como `web/` (ou use o `vercel.json` da raiz, que já aponta para `web/`).
3. Configure:
   - Install Command: `npm i`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Variáveis de ambiente (Production):
   - Opção A (somente Vercel): deixe `VITE_SERVER_URL` vazio; o app usará `/api/events` interno (Edge Function, já configurado).
   - Opção B (backend externo): `VITE_SERVER_URL` = URL base do backend que expõe `/events` (ex.: `https://seu-site-no-netlify.app`).
   - Para funcionalidades de admin/reset: defina `MONGODB_URI`, `MONGODB_DB`, `ADMIN_USER`, `ADMIN_PASS`.
   - Para stream do Double: `PLAYNABETS_WS_URL` se desejar sobrescrever o padrão.
5. O arquivo `web/vercel.json` garante o fallback de SPA (todas as rotas caem em `index.html`).

Observações importantes:
- Sem `VITE_SERVER_URL`, na Vercel, o frontend usa `/api/events` (Edge Function) para o stream em tempo real, com conexão longa e estável.
- Portamos `api/status`, `api/connect` e `api/daily-reset` para Vercel. Login e auto-bet estão como stubs e podem ser ativados depois.
- As rotas `/events` são reescritas automaticamente para `/api/events` pelo `vercel.json`.
- Para `daily-reset`, configure `MONGODB_URI`, `MONGODB_DB`, `ADMIN_USER`, `ADMIN_PASS`.
