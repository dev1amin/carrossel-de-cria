# Fluxo da Página de Chat com Bot

## Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO ACESSA                          │
│                      /chatbot (protegido)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChatBotPage Renderiza                        │
│  • Navigation (sidebar com ícone do bot ativo)                  │
│  • Header simples (título + logo)                               │
│  • Área de mensagens                                            │
│  • Input de texto + botão enviar                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              USUÁRIO DIGITA E ENVIA MENSAGEM                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           1. Adiciona mensagem do usuário ao estado             │
│           2. Exibe indicador "Pensando..."                      │
│           3. Obtém userId do localStorage                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          ENVIA PARA WEBHOOK (chatbot.service.ts)                │
│                                                                 │
│   POST https://webhook.workez.online/webhook/mainAgentInsta    │
│                                                                 │
│   Body: {                                                       │
│     "userID": "user-123",                                       │
│     "message": "Quero criar um carrossel"                       │
│   }                                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RECEBE RESPOSTA                              │
│                                                                 │
│   Response: [                                                   │
│     {                                                           │
│       "output": "Resposta do bot..."                            │
│     }                                                           │
│   ]                                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│        PARSE DA RESPOSTA (parseTemplateSelectionTrigger)        │
│                                                                 │
│   Procura por: ```json ... { "type": "template" } ... ```      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
    ┌────────────────────┐  ┌───────────────────────┐
    │  SEM TRIGGER       │  │   COM TRIGGER         │
    │  "template"        │  │   "template"          │
    └────────┬───────────┘  └──────────┬────────────┘
             │                         │
             ▼                         ▼
┌────────────────────────┐  ┌─────────────────────────────────┐
│  Exibe mensagem        │  │  1. Exibe mensagem              │
│  do bot normalmente    │  │  2. Abre TemplateSelectionModal │
└────────────────────────┘  └──────────┬──────────────────────┘
                                       │
                                       ▼
                          ┌───────────────────────────────────┐
                          │  USUÁRIO SELECIONA TEMPLATE       │
                          │  (ex: Template 6)                 │
                          └──────────┬────────────────────────┘
                                     │
                                     ▼
                          ┌───────────────────────────────────┐
                          │  Envia "Template 6" como          │
                          │  nova mensagem do usuário         │
                          └──────────┬────────────────────────┘
                                     │
                                     ▼
                          ┌───────────────────────────────────┐
                          │  Volta ao fluxo de envio          │
                          │  (POST para webhook)              │
                          └───────────────────────────────────┘
```

## Fluxo de Estados

```
Estado Inicial:
├── messages: [mensagem de boas-vindas]
├── inputMessage: ""
├── isLoading: false
└── isTemplateModalOpen: false

Usuário digita:
├── inputMessage: "texto digitado"

Usuário envia (Enter ou botão):
├── messages: [..., nova mensagem do usuário]
├── inputMessage: ""
├── isLoading: true

Resposta recebida (sem template):
├── messages: [..., resposta do bot]
├── isLoading: false

Resposta recebida (com template):
├── messages: [..., resposta do bot]
├── isLoading: false
└── isTemplateModalOpen: true

Usuário seleciona template:
├── messages: [..., "Template X"]
├── isTemplateModalOpen: false
├── isLoading: true
└── (reinicia o ciclo)
```

## Estrutura de Dados

### ChatMessage
```typescript
interface ChatMessage {
  id: string;                    // "msg_1699564723_abc123"
  role: 'user' | 'assistant';   // Tipo da mensagem
  content: string;              // Texto da mensagem
  timestamp: Date;              // Quando foi enviada
}
```

### Exemplo de Histórico
```typescript
[
  {
    id: "msg_001",
    role: "assistant",
    content: "Olá! Como posso ajudar?",
    timestamp: "2024-01-01T10:00:00Z"
  },
  {
    id: "msg_002",
    role: "user",
    content: "Quero criar um carrossel",
    timestamp: "2024-01-01T10:01:00Z"
  },
  {
    id: "msg_003",
    role: "assistant",
    content: "Ótimo! Escolha um template.",
    timestamp: "2024-01-01T10:01:05Z"
  },
  {
    id: "msg_004",
    role: "user",
    content: "Template 6",
    timestamp: "2024-01-01T10:02:00Z"
  }
]
```

## Componentes React

```
ChatBotPage
├── Navigation (sidebar)
├── Header (custom simples)
├── Main Container
│   ├── Messages Area (scroll)
│   │   ├── MessageBubble (assistant)
│   │   ├── MessageBubble (user)
│   │   ├── MessageBubble (assistant)
│   │   ├── ...
│   │   └── LoadingIndicator (condicional)
│   │
│   └── Input Area
│       ├── TextArea (mensagem)
│       └── SendButton
│
└── TemplateSelectionModal (condicional)
```

## Ciclo de Vida de uma Mensagem

```
1. INPUT DO USUÁRIO
   ↓
2. VALIDAÇÃO (não vazio)
   ↓
3. ADICIONAR AO ESTADO (UI update imediato)
   ↓
4. LIMPAR INPUT
   ↓
5. SET isLoading = true
   ↓
6. CHAMADA API (sendChatMessage)
   ↓
7. AGUARDAR RESPOSTA
   ↓
8. PARSE RESPOSTA (parseTemplateSelectionTrigger)
   ↓
9. ADICIONAR RESPOSTA AO ESTADO
   ↓
10. SE TRIGGER → ABRIR MODAL
    ↓
11. SET isLoading = false
    ↓
12. AUTO-SCROLL PARA FINAL
```

## Tratamento de Erros

```
Erro na Requisição
├── Capturado no try/catch
├── Adiciona mensagem de erro como resposta do bot
├── isLoading = false
└── Usuário pode tentar novamente
```

## Integração com Sistema Existente

```
Sistema de Autenticação
├── ProtectedRoute
└── localStorage.getItem('user')

Sistema de Templates
├── TemplateSelectionModal (reusado)
├── AVAILABLE_TEMPLATES
└── onSelectTemplate handler

Sistema de Navegação
├── Navigation component (atualizado)
└── React Router (/chatbot)
```
