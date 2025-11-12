# 🤖 Chat de Criação com IA

## Visão Geral

Nova página de chat integrada à plataforma que permite aos usuários conversarem com um chatbot inteligente para criar carrosséis de forma assistida. A interface é inspirada no ChatGPT e oferece uma experiência fluida e intuitiva.

## ✨ Funcionalidades

### 1. **Chat Interativo**
- Interface moderna e responsiva estilo ChatGPT
- Histórico de mensagens com scroll automático
- Indicadores visuais para mensagens do usuário vs. bot
- Timestamps em todas as mensagens
- Estado de "pensando..." durante processamento

### 2. **Integração com API**
- Comunicação com webhook: `https://webhook.workez.online/webhook/mainAgentInsta`
- Envio automático do userID do usuário autenticado
- Tratamento de erros com mensagens amigáveis

### 3. **Seleção Inteligente de Templates**
- Detecção automática quando o bot solicita escolha de template
- Modal de seleção reutilizando componente existente
- Envio automático do template escolhido
- Continuidade natural da conversa

### 4. **Experiência do Usuário**
- Design consistente com o resto da plataforma
- Gradientes roxo/rosa para destaque visual
- Ícones intuitivos (bot e usuário)
- Suporte para Enter (enviar) e Shift+Enter (quebra de linha)
- Proteção por autenticação

## 🚀 Como Usar

### Para Usuários

1. **Acesse o Chat**
   - Clique no ícone do robô (🤖) na barra lateral
   - Ou navegue para `/chatbot`

2. **Inicie uma Conversa**
   - Digite sua mensagem no campo de texto
   - Pressione Enter ou clique no botão de enviar (➤)
   - Aguarde a resposta do bot

3. **Seleção de Template**
   - Quando o bot solicitar, o modal de templates abrirá automaticamente
   - Navegue pelos templates disponíveis
   - Clique em "Selecionar" no template desejado
   - A conversa continuará com sua seleção

### Para Desenvolvedores

#### Estrutura do Projeto

```
src/
├── pages/
│   └── ChatBotPage.tsx          # Componente principal da página
├── services/
│   └── chatbot.ts               # Serviço de comunicação com API
└── components/
    └── Navigation.tsx            # Atualizado com link para chat
```

#### API do Serviço de Chatbot

```typescript
// Enviar mensagem
import { sendChatMessage } from '../services/chatbot';

const response = await sendChatMessage(userId, message);
// Retorna: ChatbotResponse[]

// Parsear resposta para detectar trigger de template
import { parseTemplateSelectionTrigger } from '../services/chatbot';

const { message, hasTemplateTrigger } = parseTemplateSelectionTrigger(response);
```

#### Formato da Requisição

```json
{
  "userID": "user-123",
  "message": "Quero criar um carrossel sobre marketing digital"
}
```

#### Formato da Resposta

**Resposta Normal:**
```json
[
  {
    "output": "Ótima ideia! Vou te ajudar a criar um carrossel incrível sobre marketing digital."
  }
]
```

**Resposta com Trigger de Template:**
```json
[
  {
    "output": "Perfeito! Agora escolha um template.\n\n```json\n[\n  {\n    \"output\": \"Qual template você quer utilizar?\"\n  },\n  {\n    \"type\": \"template\"\n  }\n]\n```"
  }
]
```

## 🎨 Design

### Cores e Estilo

- **Mensagens do Usuário**: Gradiente roxo → rosa (`from-purple-600 to-pink-600`)
- **Mensagens do Bot**: Fundo transparente com borda branca sutil (`bg-white/5 border-white/10`)
- **Fundo**: Gradiente escuro (`from-zinc-950 via-zinc-900 to-zinc-950`)
- **Ícones**: Bot roxo/rosa, Usuário branco

### Componentes Visuais

- Avatar do bot com gradiente
- Avatar do usuário com fundo translúcido
- Mensagens com bordas arredondadas
- Input com foco destacado
- Botão de envio com gradiente

## 🔧 Configuração Técnica

### Dependências

- React 18+
- Lucide React (ícones)
- Framer Motion (animações)
- React Router (navegação)

### Rota

```typescript
// Protegida por autenticação
<Route path="/chatbot" element={<ChatBotPage />} />
```

### Estado do Componente

```typescript
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [inputMessage, setInputMessage] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
```

## 🔐 Autenticação

O sistema obtém automaticamente o `userID` do usuário autenticado:

```typescript
const getUserId = (): string => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    const user = JSON.parse(userStr);
    return user.id || 'anonymous';
  }
  return 'anonymous';
};
```

## 🧪 Testes

Execute o script de teste:

```bash
npm run test:chatbot
```

Ou manualmente:
```bash
ts-node test-chatbot.ts
```

## 📝 Exemplos de Uso

### Exemplo 1: Conversa Simples

**Usuário:** "Olá!"  
**Bot:** "Olá! Sou seu assistente de criação de carrosséis. Como posso ajudar você hoje?"

**Usuário:** "Quero criar um carrossel sobre receitas"  
**Bot:** "Ótima escolha! Vamos criar um carrossel incrível sobre receitas..."

### Exemplo 2: Seleção de Template

**Usuário:** "Crie um carrossel educativo"  
**Bot:** "Perfeito! Agora escolha o template que melhor se adequa..."  
*[Modal de templates abre automaticamente]*

**Usuário:** *[Seleciona Template 6]*  
**Bot:** "Excelente escolha! O Template 6 é ótimo para conteúdo educativo..."

## 🚧 Melhorias Futuras

- [ ] Histórico persistente de conversas
- [ ] Suporte para markdown nas mensagens
- [ ] Anexar imagens ao chat
- [ ] Typing indicator animado
- [ ] Botões de ação rápida
- [ ] Sistema de feedback para respostas
- [ ] Exportar conversa
- [ ] Compartilhar carrosséis criados
- [ ] Sugestões contextuais

## 📚 Documentação Adicional

- [Documentação Completa](./CHATBOT_PAGE_DOCUMENTATION.md)
- [Estrutura do Projeto](./README.md)

## 🤝 Contribuindo

Para adicionar novas funcionalidades ao chat:

1. Modifique `src/services/chatbot.ts` para novas integrações
2. Atualize `src/pages/ChatBotPage.tsx` para novos componentes UI
3. Mantenha a consistência de design com o resto da plataforma
4. Adicione testes quando aplicável

## 📄 Licença

Este componente faz parte da plataforma Workez e segue a mesma licença do projeto principal.
