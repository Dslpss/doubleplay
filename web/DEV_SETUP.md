# Configuração para Desenvolvimento Local

## Problema Resolvido

Os sinais da roleta e do double só apareciam no ambiente Netlify porque dependiam da Edge Function `/events` que faz polling das APIs externas. Agora temos um servidor de desenvolvimento local que replica essa funcionalidade.

## Como Usar

### 1. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

**IMPORTANTE**: Edite o arquivo `.env` e adicione suas credenciais reais do Play na Bet:

```env
PLAYNABETS_USER=seu_email_real@exemplo.com
PLAYNABETS_PASS=sua_senha_real
```

### 2. Instalar Dependências

Se ainda não instalou:

```bash
npm install
```

### 3. Iniciar Aplicação em Desenvolvimento

Você tem três opções:

#### Opção A: Iniciar tudo junto (Recomendado)

```bash
npm run dev:all
```

Isso inicia:

- Servidor de desenvolvimento (porta 3001) - replica a Edge Function do Netlify
- Vite dev server (porta 5173) - frontend React

#### Opção B: Iniciar separadamente

Terminal 1 - Servidor de desenvolvimento:

```bash
npm run dev:server
```

Terminal 2 - Frontend:

```bash
npm run dev
```

### 4. Acessar a Aplicação

Abra o navegador em: http://localhost:5173

## Como Funciona

### Desenvolvimento Local (`npm run dev:all`)

1. O `dev-server.js` roda na porta 3001
2. Ele conecta ao WebSocket do Double e faz polling da API da Roleta
3. Expõe endpoint SSE em `http://localhost:3001/events`
4. O frontend (porta 5173) se conecta ao servidor local através da variável `VITE_SERVER_URL`

### Produção (Netlify)

1. O frontend é servido pelo Netlify
2. A Edge Function `/.netlify/edge-functions/events.js` fornece o endpoint `/events`
3. O frontend se conecta diretamente ao endpoint relativo `/events` (sem VITE_SERVER_URL)

## Variáveis de Ambiente

### Frontend (Vite)

- `VITE_SERVER_URL`: URL do servidor backend
  - **Dev**: `http://localhost:3001`
  - **Prod**: deixe vazio (usa endpoint relativo do Netlify)

### Servidor Local (dev-server.js)

- `DEV_SERVER_PORT`: Porta do servidor (padrão: 3001)
- `PLAYNABETS_USER` / `PLAYNABETS_EMAIL`: Email do Play na Bet
- `PLAYNABETS_PASS` / `PLAYNABETS_PASSWORD`: Senha do Play na Bet
- `PLAYNABETS_WS_URL`: WebSocket do Double
- `PRAGMATIC_BASE`: Base URL da API Pragmatic
- `PRAGMATIC_TABLE_ID` / `ROULETTE_TABLE_ID`: ID da mesa de roleta

## Scripts NPM

- `npm run dev` - Inicia apenas o frontend (Vite)
- `npm run dev:server` - Inicia apenas o servidor de desenvolvimento
- `npm run dev:all` - Inicia servidor + frontend simultaneamente
- `npm run build` - Build de produção
- `npm run preview` - Preview do build de produção

## Troubleshooting

### Sinais não aparecem em dev

1. Verifique se o arquivo `.env` tem suas credenciais corretas
2. Verifique se o servidor está rodando: `npm run dev:server`
3. Verifique o console do navegador para erros de conexão
4. Verifique se `VITE_SERVER_URL=http://localhost:3001` está no `.env`

### Erro 401/403 na roleta

- Suas credenciais podem estar incorretas ou expiradas
- Tente fazer login manualmente no site do Play na Bet

### WebSocket do Double não conecta

- Verifique se `PLAYNABETS_WS_URL` está correto no `.env`
- O WebSocket pode estar temporariamente indisponível

## Produção (Deploy no Netlify)

Para fazer deploy no Netlify:

1. **Configure as variáveis de ambiente no Netlify**:

   - Vá em Site Settings > Environment Variables
   - Adicione as mesmas variáveis do `.env` (exceto `VITE_SERVER_URL`)

2. **Remova `VITE_SERVER_URL` do build de produção**:

   - No Netlify, não configure `VITE_SERVER_URL`
   - O app usará automaticamente o endpoint relativo `/events` da Edge Function

3. **Build e deploy**:
   ```bash
   npm run build
   ```

O Netlify detectará automaticamente o arquivo `netlify.toml` e configurará as Edge Functions.
