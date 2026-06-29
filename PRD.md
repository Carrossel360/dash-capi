# PRD — Dashboard SaaS para Agências de Marketing Digital

## Visão Geral

Plataforma SaaS white-label para agências de marketing digital gerenciarem múltiplos clientes em um único painel. A agência opera como administrador central e cada cliente tem acesso restrito ao seu próprio workspace com os dados e ferramentas relevantes para ele.

---

## Problema que resolve

Agências de marketing gerenciam campanhas de vários clientes usando ferramentas separadas (Meta Ads, Google Ads, WhatsApp, planilhas). Isso cria:
- Dados fragmentados e sem correlação
- Dificuldade de reportar resultados de forma unificada
- Rastreamento de conversões incompleto (especialmente pós-iOS 14)
- Gestão de leads desconectada das campanhas
- Cliente sem visibilidade do trabalho da agência

---

## Usuários

### Agência (Admin)
- Gerencia todos os clientes
- Configura integrações (Meta CAPI, Google Ads, WhatsApp)
- Acesso total a relatórios e configurações
- Cria workspaces para clientes

### Cliente (Viewer/Attendant/Manager)
- Vê apenas seu próprio workspace
- Acessa relatórios configurados pela agência
- Gerencia leads via CRM e pipeline
- Conecta WhatsApp via QR Code
- Não vê configurações técnicas (tokens, pixels, webhooks)

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS v4 |
| Estado global | Zustand (persistido em localStorage) |
| Backend | Next.js API Routes (serverless) |
| Banco de dados | PostgreSQL via Neon (serverless) |
| ORM | Prisma |
| Auth | JWT (HS256, 7 dias) |
| Deploy | Vercel |
| WhatsApp | UazAPI (não-oficial) |
| Estilo | Dark theme padrão, toggle light/dark, paleta roxa/laranja |

---

## Arquitetura Multi-tenant

- Cada cliente tem um **Workspace** isolado
- Todos os dados são scopados por `workspaceId`
- JWT carrega `{ userId, workspaceId, role }`
- Roles: `admin`, `manager`, `attendant`, `viewer`
- `isAgency: true` distingue o workspace da agência dos clientes
- Agência tem acesso admin a todos os workspaces de clientes

---

## Módulos Implementados

### 1. Autenticação
- Login com e-mail + senha (SHA-256)
- JWT com expiração de 7 dias
- Troca de workspace sem novo login (`/api/auth/switch`)
- Guard no layout do dashboard (aguarda hidratação do Zustand)
- Toggle light/dark persistido em localStorage

### 2. Gestão de Clientes (Admin)
**Rota:** `/clientes`

- Listagem de clientes com stats (leads, eventos CAPI, campanhas)
- Criação de cliente: cria Workspace + usuário de acesso + pipeline padrão
- Página de configuração por cliente com abas:
  - **Geral:** nome, segmento, plano, moeda
  - **Serviços:** toggle dos módulos contratados (Tráfego Pago, Social Media, Google Business, Google Local)
  - **Métricas:** quais métricas Meta Ads e Google Ads aparecem no dashboard do cliente
  - **Meta CAPI:** Pixel ID, Access Token, script de rastreamento, webhook WhatsApp
  - **Google Ads:** Customer ID, Refresh Token
  - **Acesso:** gerenciamento de usuários — criar, alterar role, redefinir senha, remover

### 3. Acesso e Permissões por Cliente
**Rotas:** `/api/clients/[id]/members`, `/api/clients/[id]/members/[userId]`

- Admin/Manager pode adicionar usuários a um workspace
- Criação de usuário com nome + e-mail + senha + role
- Alteração de role via dropdown
- Redefinição de senha inline
- Remoção de membro (não pode remover a si mesmo)
- Roles com cores: Admin (laranja), Gerente (roxo), Atendente (azul), Visualizador (cinza)

### 4. Dashboard Principal
**Rota:** `/dashboard`

- Visão geral com KPIs do workspace ativo
- Funil de conversão configurável por cliente
- Dados de Meta Ads e Google Ads em cards

### 5. Tráfego Pago
**Rota:** `/trafego-pago`

- Métricas Meta Ads: gasto, impressões, alcance, CPC, CPM, CTR, cliques, conversas, leads
- Métricas Google Ads: gasto, cliques, impressões, CTR, CPC, conversões, ROAS
- Métricas visíveis configuráveis por cliente (admin escolhe o que o cliente vê)
- Dados manuais quando API não está conectada

### 6. CRM / Pipeline
**Rota:** `/pipeline` (Kanban), `/clientes` (lista de leads)

- Kanban drag-and-drop com HTML5 API
- Estágios configuráveis por workspace
- Gatilhos CAPI por estágio (ao mover lead, dispara evento)
- Leads com: nome, telefone, e-mail, origem, estágio, tags
- Integração com conversas WhatsApp

### 7. Meta Conversions API (CAPI)
**Pipeline:** Tracker → Collect → Queue → Cron → Meta Graph API

- **Tracker script** (`/api/t/[workspaceId]`): snippet JS servido por CDN. Captura:
  - `PageView`
  - `Lead` (submit de formulário)
  - `WhatsAppClick` (clique em link wa.me)
  - Cliques em telefone
- **Endpoint de coleta** (`/api/collect`): sem auth, CORS aberto, salva `TrackerEvent` e enfileira `CAPIEvent`
- **Cron** (`/api/cron/capi`): Vercel cron a cada minuto, flush de até 50 eventos queued
  - SHA-256 hash de e-mail e telefone antes de enviar ao Meta
  - Retry até 3 tentativas, marca `failed` depois
  - Score de qualidade de match (0–10) baseado nos campos presentes
- **Fontes de evento:** `site` (tracker), `crm` (mudança de estágio), `whatsapp`, `manual`

### 8. Conversas / Atendimento WhatsApp
**Rota:** `/conversas`

- Inbox de conversas por workspace
- Mensagens inbound/outbound
- Suporte a texto, áudio, imagem, vídeo, documento
- Download de mídia criptografada via UazAPI (`/message/download`)
- Associação automática de conversa ao lead pelo telefone
- Tags de suporte configuráveis
- Status: aberta / em atendimento / resolvida

### 9. WhatsApp — UazAPI
**Rotas:** `/api/workspace/whatsapp`

- **Admin:** configura URL do servidor, Admin Token, nome da instância
- **Criar instância** via API (`POST /instance/create`) sem precisar entrar no painel UazAPI
- **Cliente:** vê apenas status de conexão + botão Gerar QR Code
- Status: conectado / desconectado / desconhecido
- Webhook UazAPI recebe mensagens em tempo real

### 10. Eventos CAPI
**Rota:** `/events`

- Lista de eventos com status (queued / sent / failed)
- Filtros por status e tipo
- Detalhes do evento (payload, resposta do Meta, tentativas)

### 11. Social Media
**Rota:** `/social-media`

- Métricas de Instagram/Facebook
- Dados manuais ou via API

### 12. Google Business / Google Local
**Rotas:** `/google-business`, `/google-local`

- Visualizações no Maps, avaliações, estrelas médias
- Dados manuais ou via API

### 13. Gestão de Tarefas (ClickUp-like)
**Rota:** `/tarefas` (admin/manager apenas)

**Hierarquia:** Space → Folder → List → Task → Subtask

- Criação de Spaces com cor e ícone
- Criação de Folders dentro de Spaces
- Criação de Lists (projetos) dentro de Spaces ou Folders
- **Kanban** drag-and-drop por status (A fazer, Em andamento, Em revisão, Concluído)
- **List view** tabulada
- **Modal de criação de tarefa:**
  - Status, prioridade, responsável, lista
  - Data de início e prazo
  - Descrição
  - Subtarefas inline
  - Tags
  - Campos personalizados (texto, número, data, select, checkbox, URL)
- **Painel lateral de detalhes:** edição inline, comentários, progresso de subtarefas
- Campos personalizados por Space (definição + valores por tarefa)

### 14. Configurações do Workspace (cliente)
**Rota:** `/settings`

**Visão do cliente (viewer/attendant):**
- Pipeline — leitura dos estágios
- Equipe — lista de membros com roles
- WhatsApp — status + QR Code apenas

**Visão admin/manager:**
- Meta CAPI — Pixel, token, script
- Contas de Anúncios — IDs Meta/Instagram/Google
- Pipeline — edição de estágios e gatilhos CAPI
- Equipe — lista de membros
- WhatsApp — configuração completa UazAPI + criação de instância + webhook

### 15. Campanhas
**Rota:** `/campanhas`

- Listagem e criação de campanhas
- Associação a canais (Meta, Google, etc.)

---

## Rastreamento de Conversões — Estado Atual e Roadmap

### Implementado
- Tracker script captura PageView, Lead, WhatsAppClick
- CAPI envia eventos com hash de e-mail/telefone
- Score de qualidade de match

### A implementar (próxima fase)
- **Captura de `gclid`** no tracker (Google Ads → Landing Page)
- **Captura de UTMs** (utm_source, utm_campaign, utm_medium, utm_content)
- **Injeção em link WhatsApp:** quando usuário clica em `wa.me`, incluir parâmetros no texto da mensagem
- **Extração no webhook UazAPI:** ler `gclid`/UTMs da primeira mensagem e salvar no lead
- **`ctwa_clid`** (Click-to-WhatsApp): a ser verificado via log real de payload UazAPI com anúncio ativo
- **Origem do lead no CRM:** exibir campanha, fonte, gclid no card do lead

---

## Integrações

### Meta Ads
- **Auth:** Access Token por conta de anúncio
- **Dados:** campanhas, conjuntos, anúncios, métricas diárias
- **CAPI:** Graph API v21.0, hash SHA-256 obrigatório

### Google Ads
- **Auth:** OAuth2 (Client ID + Secret + Refresh Token) + Developer Token
- **Nível atual:** Acesso às Análises (relatórios)
- **Próximo:** Acesso Padrão (criar/editar campanhas)
- **Dados:** campanhas, grupos de anúncios, keywords, métricas diárias

### UazAPI (WhatsApp)
- **Tipo:** não-oficial (WhatsApp Web)
- **Uso:** atendimento, recebimento de mensagens, envio
- **Instância por cliente:** criada via `POST /instance/create` com Admin Token
- **Limitação:** `ctwa_clid` pode não estar disponível (a verificar)

### Vercel Cron
- `GET /api/cron/capi` — a cada minuto — secured by `CRON_SECRET`
- Flush de até 50 eventos CAPI queued

---

## Variáveis de Ambiente

```env
DATABASE_URL          # Neon pooled (PgBouncer)
DIRECT_URL            # Neon direct (migrations)
JWT_SECRET            # HS256 signing key
NEXT_PUBLIC_API_URL   # URL pública para o tracker script
CRON_SECRET           # Protege /api/cron/capi
META_TEST_EVENT_CODE  # Opcional, modo de teste Meta CAPI
```

---

## Banco de Dados — Modelos Principais

```
User                  — auth
Workspace             — tenant central
WorkspaceMember       — user ↔ workspace com role
Lead                  — contato/lead do CRM
PipelineStage         — estágios do kanban
CAPIEvent             — fila de eventos para o Meta
TrackerEvent          — eventos brutos do tracker JS
Conversation          — conversa WhatsApp
Message               — mensagem individual
Campaign              — campanha de marketing
TaskSpace             — espaço de tarefas
TaskFolder            — pasta dentro do space
TaskProject           — lista dentro de space/folder
Task                  — tarefa (suporta parentId para subtarefas)
TaskComment           — comentário em tarefa
CustomField           — campo personalizado por space
CustomFieldValue      — valor do campo por tarefa
ManualMetric          — dados manuais de métricas
MetaAdsData           — dados Meta Ads por período
GoogleAdsData         — dados Google Ads por período
GoogleBusinessData    — dados Google Business
SocialMediaData       — dados redes sociais
```

---

## Rotas da API

```
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/switch

GET    /api/workspace
PATCH  /api/workspace
PATCH  /api/workspace/whatsapp
GET    /api/workspace/whatsapp       — fetch QR code
POST   /api/workspace/whatsapp       — criar instância UazAPI
GET    /api/workspace/members

GET    /api/workspaces               — lista workspaces do usuário

GET    /api/clients
POST   /api/clients
GET    /api/clients/[id]
PATCH  /api/clients/[id]
DELETE /api/clients/[id]
GET    /api/clients/[id]/members
POST   /api/clients/[id]/members
PATCH  /api/clients/[id]/members/[userId]
DELETE /api/clients/[id]/members/[userId]

GET    /api/leads
POST   /api/leads
GET    /api/leads/[id]
PATCH  /api/leads/[id]
PATCH  /api/leads/[id]/stage

GET    /api/stages
POST   /api/stages
PATCH  /api/stages/[id]
DELETE /api/stages/[id]

GET    /api/events                   — CAPI events
GET    /api/cron/capi                — cron flush (CRON_SECRET)

GET    /api/t/[workspaceId]          — serve tracker JS
POST   /api/collect                  — recebe eventos do tracker

GET    /api/conversations
GET    /api/conversations/[id]
GET    /api/conversations/[id]/messages
GET    /api/conversations/[id]/tags
PATCH  /api/conversations/[id]

POST   /api/webhooks/uazapi/[workspaceId]
POST   /api/webhooks/whatsapp/[workspaceId]

GET    /api/tasks/spaces
POST   /api/tasks/spaces
PATCH  /api/tasks/spaces/[id]
DELETE /api/tasks/spaces/[id]
GET    /api/tasks/folders
POST   /api/tasks/folders
PATCH  /api/tasks/folders/[id]
DELETE /api/tasks/folders/[id]
GET    /api/tasks/projects
POST   /api/tasks/projects
GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/[id]
PATCH  /api/tasks/[id]
DELETE /api/tasks/[id]
GET    /api/tasks/[id]/comments
POST   /api/tasks/[id]/comments
GET    /api/tasks/custom-fields
POST   /api/tasks/custom-fields
PATCH  /api/tasks/custom-fields/[id]
DELETE /api/tasks/custom-fields/[id]

GET    /api/trafego/meta
GET    /api/trafego/google
GET    /api/products
GET    /api/deals
```

---

## Roadmap — Próximas Fases

### Fase 2 — Rastreamento Completo
- [ ] Captura de `gclid` + UTMs no tracker script
- [ ] Injeção de parâmetros em links WhatsApp
- [ ] Extração de origem no webhook UazAPI
- [ ] Exibição de campanha/fonte no card do lead no CRM
- [ ] Verificar suporte a `ctwa_clid` na UazAPI

### Fase 3 — Google Ads Real
- [ ] OAuth2 flow para geração de Refresh Token
- [ ] Sincronização de campanhas via Google Ads API
- [ ] Relatórios com dados reais no dashboard

### Fase 4 — Automações
- [ ] Webhooks de entrada de outros canais (formulários, RD Station, etc.)
- [ ] Regras de automação (se lead em estágio X → disparar ação Y)
- [ ] Templates de mensagem WhatsApp
- [ ] Envio em massa / sequências

### Fase 5 — Relatórios Avançados
- [ ] Relatório PDF exportável por cliente
- [ ] Dashboard de comparação de períodos
- [ ] Alertas de anomalia (queda brusca de métricas)
- [ ] Atribuição multi-touch (fbclid + gclid + UTMs correlacionados)

### Fase 6 — Plataforma
- [ ] Solicitar Acesso Padrão Google Ads (criar/editar campanhas)
- [ ] Criação de anúncios via sistema
- [ ] Billing por cliente (planos Starter/Pro/Agency)
- [ ] Onboarding guiado para novos clientes

---

## Decisões de Design Importantes

**Por que `filter: invert(1) hue-rotate(180deg)` para tema claro?**
Permite tema claro sem modificar cada componente. A paleta roxa/laranja sobrevive matematicamente à inversão + rotação de 180°. Imagens e vídeos são re-invertidos.

**Por que HTML5 Drag API em vez de biblioteca?**
Zero dependências, funciona bem para o caso de uso (kanban simples). Evita incompatibilidades com Server Components.

**Por que `connection_limit=1` no Neon?**
Neon fecha conexões idle. Com PgBouncer + `connection_limit=1`, o Prisma não tenta manter um pool grande e evita erros `kind: Closed` nos logs.

**Por que `db:push` em vez de migrations?**
Ambiente de startup em evolução rápida. Sem histórico de migração para manter. Revisitar quando o schema estabilizar.

**Por que CAPI server-side em vez de só Pixel?**
iOS 14+ e ad blockers bloqueiam o Pixel no browser. CAPI server-side não é afetado, garantindo que conversões sejam reportadas ao Meta mesmo sem cookies.
