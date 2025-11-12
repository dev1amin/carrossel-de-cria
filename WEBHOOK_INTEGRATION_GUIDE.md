# Guia Rápido de Integração - Webhook do ChatBot

## 🔗 Endpoint

```
POST https://webhook.workez.online/webhook/mainAgentInsta
```

## 📤 Requisição

### Headers
```http
Content-Type: application/json
```

### Body
```json
{
  "userID": "string",    // ID único do usuário (obrigatório)
  "message": "string"    // Mensagem enviada pelo usuário (obrigatório)
}
```

### Exemplo de Requisição
```javascript
const response = await fetch('https://webhook.workez.online/webhook/mainAgentInsta', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userID: 'user-12345',
    message: 'Quero criar um carrossel sobre receitas veganas'
  })
});
```

## 📥 Resposta

### Formato Padrão
```json
[
  {
    "output": "string"    // Resposta do chatbot
  }
]
```

### Exemplo 1: Resposta Normal
```json
[
  {
    "output": "Ótima ideia! Vou te ajudar a criar um carrossel incrível sobre receitas veganas. Você gostaria de focar em receitas rápidas, saudáveis ou gourmet?"
  }
]
```

### Exemplo 2: Solicitação de Template
```json
[
  {
    "output": "Perfeito! Agora vamos escolher o melhor template para seu carrossel.\n\n```json\n[\n  {\n    \"output\": \"Qual template você quer utilizar?\"\n  },\n  {\n    \"type\": \"template\"\n  }\n]\n```"
  }
]
```

## 🎯 Casos de Uso

### Caso 1: Conversa Inicial
**Requisição:**
```json
{
  "userID": "user-12345",
  "message": "Olá"
}
```

**Resposta:**
```json
[
  {
    "output": "Olá! Sou seu assistente de criação de carrosséis. Como posso ajudar você hoje?"
  }
]
```

### Caso 2: Solicitação de Criação
**Requisição:**
```json
{
  "userID": "user-12345",
  "message": "Preciso de um carrossel educativo sobre história"
}
```

**Resposta:**
```json
[
  {
    "output": "Excelente! Vou criar um carrossel educativo sobre história para você. Qual período histórico você gostaria de abordar?"
  }
]
```

### Caso 3: Trigger de Seleção de Template
**Requisição:**
```json
{
  "userID": "user-12345",
  "message": "Gostaria de focar na história antiga"
}
```

**Resposta:**
```json
[
  {
    "output": "Perfeito! História antiga é fascinante. Agora escolha um template.\n\n```json\n[\n  {\n    \"output\": \"Qual template você quer utilizar?\"\n  },\n  {\n    \"type\": \"template\"\n  }\n]\n```"
  }
]
```

### Caso 4: Resposta à Seleção de Template
**Requisição:**
```json
{
  "userID": "user-12345",
  "message": "Template 6"
}
```

**Resposta:**
```json
[
  {
    "output": "Ótima escolha! O Template 6 é perfeito para conteúdo educativo. Vou começar a gerar seu carrossel sobre história antiga."
  }
]
```

## 🔍 Detecção de Template Trigger

### Padrão a Detectar
```
```json
[
  {
    "output": "..."
  },
  {
    "type": "template"
  }
]
```
```

### Código de Detecção
```typescript
const parseTemplateSelectionTrigger = (response: string) => {
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = response.match(jsonBlockRegex);

  if (match && match[1]) {
    try {
      const jsonContent = JSON.parse(match[1]);
      
      if (Array.isArray(jsonContent)) {
        const hasTemplate = jsonContent.some(
          (item: any) => item.type === 'template'
        );
        
        if (hasTemplate) {
          // Extrai mensagem antes do JSON
          const messageBeforeJson = response.split('```json')[0].trim();
          return {
            message: messageBeforeJson,
            hasTemplateTrigger: true
          };
        }
      }
    } catch (error) {
      console.error('Erro ao parsear JSON:', error);
    }
  }

  return {
    message: response,
    hasTemplateTrigger: false
  };
};
```

## ⚠️ Tratamento de Erros

### Erro de Rede
```typescript
try {
  const responses = await sendChatMessage(userId, message);
} catch (error) {
  console.error('Erro ao enviar mensagem:', error);
  // Exibir mensagem de erro para o usuário
}
```

### Resposta Vazia
```typescript
if (!responses || responses.length === 0) {
  // Tratar caso sem resposta
  console.warn('Resposta vazia do servidor');
}
```

### JSON Inválido no Trigger
```typescript
try {
  const jsonContent = JSON.parse(match[1]);
} catch (error) {
  console.error('JSON inválido na resposta:', error);
  // Continuar sem trigger de template
}
```

## 🧪 Testes de Integração

### Teste Manual com cURL
```bash
curl -X POST https://webhook.workez.online/webhook/mainAgentInsta \
  -H "Content-Type: application/json" \
  -d '{
    "userID": "test-user",
    "message": "Olá, teste de integração"
  }'
```

### Teste Manual com JavaScript
```javascript
// No console do navegador
fetch('https://webhook.workez.online/webhook/mainAgentInsta', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userID: 'test-user',
    message: 'Teste'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

## 📊 Monitoramento

### Logs Importantes
```typescript
// Antes de enviar
console.log('Enviando mensagem:', { userId, message });

// Após receber
console.log('Resposta recebida:', responses);

// Detecção de trigger
console.log('Template trigger detectado:', hasTemplateTrigger);

// Erro
console.error('Erro na comunicação:', error);
```

## 🔐 Segurança

### UserID
- Sempre obtenha do localStorage após login
- Nunca permita modificação pelo usuário
- Valide antes de enviar

```typescript
const getUserId = (): string => {
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    throw new Error('Usuário não autenticado');
  }
  
  try {
    const user = JSON.parse(userStr);
    if (!user.id) {
      throw new Error('UserID não encontrado');
    }
    return user.id;
  } catch (error) {
    console.error('Erro ao obter userID:', error);
    throw error;
  }
};
```

## 📝 Checklist de Integração

- [ ] Endpoint correto configurado
- [ ] Headers incluindo Content-Type
- [ ] Body com userID e message
- [ ] Tratamento de resposta
- [ ] Detecção de template trigger
- [ ] Tratamento de erros
- [ ] Logs para debugging
- [ ] Validação de userID
- [ ] Testes manuais realizados
- [ ] Tratamento de timeout

## 🎓 Exemplos Completos

### Exemplo Completo TypeScript
```typescript
import { sendChatMessage, parseTemplateSelectionTrigger } from './services/chatbot';

async function handleUserMessage(message: string) {
  try {
    // 1. Obter userID
    const userId = getUserId();
    
    // 2. Enviar mensagem
    const responses = await sendChatMessage(userId, message);
    
    // 3. Verificar resposta
    if (!responses || responses.length === 0) {
      throw new Error('Resposta vazia');
    }
    
    // 4. Processar resposta
    const botResponse = responses[0].output;
    const { message: displayMessage, hasTemplateTrigger } = 
      parseTemplateSelectionTrigger(botResponse);
    
    // 5. Exibir mensagem
    displayBotMessage(displayMessage);
    
    // 6. Abrir modal se necessário
    if (hasTemplateTrigger) {
      openTemplateModal();
    }
    
  } catch (error) {
    console.error('Erro:', error);
    displayErrorMessage('Desculpe, ocorreu um erro. Tente novamente.');
  }
}
```

## 💡 Dicas

1. **Sempre valide o userID** antes de enviar requisições
2. **Use try/catch** para capturar erros de rede
3. **Implemente timeouts** para requisições longas
4. **Log todas as interações** para debugging
5. **Mantenha o UX fluido** com loading states
6. **Trate edge cases** como respostas vazias
7. **Teste diferentes cenários** de resposta
