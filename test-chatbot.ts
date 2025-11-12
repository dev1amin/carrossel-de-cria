// Script de teste para o serviço de chatbot
// Execute com: node test-chatbot.js (ou ts-node se estiver configurado)

import { parseTemplateSelectionTrigger } from './src/services/chatbot';

// Teste 1: Resposta normal sem trigger de template
console.log('Teste 1: Resposta normal');
const response1 = 'Olá! Como posso ajudar você hoje?';
const result1 = parseTemplateSelectionTrigger(response1);
console.log('Resultado:', result1);
console.log('Esperado: hasTemplateTrigger = false\n');

// Teste 2: Resposta com trigger de template
console.log('Teste 2: Resposta com trigger de template');
const response2 = `Ótimo! Vamos criar seu carrossel.

\`\`\`json
[
  {
    "output": "Qual template você quer utilizar?"
  },
  {
    "type": "template"
  }
]
\`\`\``;

const result2 = parseTemplateSelectionTrigger(response2);
console.log('Resultado:', result2);
console.log('Esperado: hasTemplateTrigger = true\n');

// Teste 3: Resposta com JSON mas sem type="template"
console.log('Teste 3: JSON sem type template');
const response3 = `Aqui está um exemplo:

\`\`\`json
[
  {
    "output": "Exemplo de resposta"
  }
]
\`\`\``;

const result3 = parseTemplateSelectionTrigger(response3);
console.log('Resultado:', result3);
console.log('Esperado: hasTemplateTrigger = false\n');

console.log('Todos os testes concluídos!');
