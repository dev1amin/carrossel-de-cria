# Página de Criação com ChatBot - Documentação

## Resumo da Implementação

Foi criada uma nova página de chat dentro da plataforma onde os usuários podem conversar com o chatbot para criar carrosséis. A página segue o estilo do ChatGPT e está totalmente integrada com o sistema existente.

## Arquivos Criados

### 1. `/src/services/chatbot.ts`
Serviço responsável pela comunicação com o webhook do chatbot.

**Funções principais:**
- `sendChatMessage(userId, message)`: Envia mensagem para `https://webhook.workez.online/webhook/mainAgentInsta`
- `parseTemplateSelectionTrigger(response)`: Detecta quando o chatbot solicita seleção de template
- `generateMessageId()`: Gera IDs únicos para as mensagens

**Formato da requisição:**
```json
{
  "userID": "user-id-aqui",
  "message": "mensagem do usuário"
}
```

**Formato da resposta:**
```json
[
  {
    "output": "Resposta do chatbot"
  }
]
```

### 2. `/src/pages/ChatBotPage.tsx`
Componente principal da página de chat.

**Características:**
- Interface estilo ChatGPT
- Histórico de mensagens com scroll automático
- Input com suporte para Enter (enviar) e Shift+Enter (nova linha)
- Indicador de "pensando..." enquanto aguarda resposta
- Integração com o sistema de templates existente

**Detecção de Template Selection:**
Quando o chatbot responde com:
```json
{
  "output": "Mensagem do Chatbot. \n\n```json\n[\n  {\n    \"output\": \"Qual template você quer utilizar?\"\n  },\n  {\n    \"type\": \"template\"\n  }\n]\n```"
}
```

O sistema:
1. Extrai a mensagem antes do bloco JSON
2. Exibe a mensagem para o usuário
3. Abre automaticamente o modal de seleção de template

Quando o usuário seleciona um template:
1. Envia "Template X" como mensagem do usuário
2. O chatbot processa e continua a conversa

## Arquivos Modificados

### 3. `/src/App.tsx`
- Adicionado import do `ChatBotPage`
- Criada rota protegida `/chatbot`

### 4. `/src/components/Navigation.tsx`
- Atualizado tipo para incluir `'chatbot'`
- Adicionado botão de navegação com ícone de bot
- Configurado roteamento para `/chatbot`

## Fluxo de Uso

1. **Usuário acessa a página:** Navega pelo menu lateral (ícone do bot)
2. **Inicia conversa:** Digita mensagem e pressiona Enter ou clica no botão de envio
3. **Sistema processa:**
   - Obtém o `userID` do localStorage
   - Envia para o webhook com userID e mensagem
   - Exibe indicador de carregamento
4. **Chatbot responde:**
   - Mensagem é exibida na tela
   - Se contiver trigger de template, abre modal automaticamente
5. **Seleção de template (quando aplicável):**
   - Usuário escolhe template no modal
   - Nome do template é enviado como mensagem
   - Conversa continua normalmente

## Autenticação

O sistema utiliza o `userID` armazenado no localStorage após login:
```typescript
const userStr = localStorage.getItem('user');
const user = JSON.parse(userStr);
const userId = user.id;
```

## Design e UX

- **Cores:** Gradiente roxo/rosa para mensagens do usuário, fundo escuro com bordas sutis para mensagens do bot
- **Ícones:** Bot icon para o assistente, User icon para o usuário
- **Responsividade:** Layout adaptável com sidebar de navegação
- **Feedback:** Timestamps em todas as mensagens, estados de loading claros

## Integração com Sistema Existente

- Utiliza o mesmo `TemplateSelectionModal` do resto da plataforma
- Mantém consistência visual com outras páginas
- Respeita o sistema de autenticação e proteção de rotas
- Compatível com a estrutura de navegação existente

## Próximos Passos Possíveis

1. Persistir histórico de conversas no backend
2. Adicionar suporte para anexar imagens
3. Implementar typing indicator quando o bot está processando
4. Adicionar botões de ação rápida
5. Suporte para markdown nas mensagens
6. Sistema de feedback para respostas do bot
