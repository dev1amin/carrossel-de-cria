/**
 * Serviço de integração com o chatbot
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatbotResponse {
  output: string;
}

export interface TemplateSelectionTrigger {
  output: string;
  type: 'template';
}

/**
 * Envia mensagem para o chatbot e retorna a resposta
 */
export const sendChatMessage = async (
  userId: string,
  message: string
): Promise<ChatbotResponse[]> => {
  const webhookUrl = 'https://webhook.workez.online/webhook/mainAgentInsta';

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userID: userId,
        message: message,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao enviar mensagem: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Resposta bruta do webhook:', data);
    
    // Se a resposta for um objeto com "output", converte para array
    if (data && typeof data === 'object' && 'output' in data) {
      return [data as ChatbotResponse];
    }
    
    // Se já for um array, retorna como está
    if (Array.isArray(data)) {
      return data;
    }
    
    // Caso contrário, retorna em um array
    return [data];
  } catch (error) {
    console.error('Erro ao comunicar com o chatbot:', error);
    throw error;
  }
};

/**
 * Verifica se a resposta contém um trigger de seleção de template
 */
export const parseTemplateSelectionTrigger = (
  response: string
): { message: string; hasTemplateTrigger: boolean } => {
  // Procura por código JSON dentro de ```json ... ```
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = response.match(jsonBlockRegex);

  if (match && match[1]) {
    try {
      const jsonContent = JSON.parse(match[1]);
      
      // Verifica se é um array e se contém o tipo "template"
      if (Array.isArray(jsonContent)) {
        const hasTemplate = jsonContent.some(
          (item: any) => item.type === 'template'
        );
        
        if (hasTemplate) {
          // Extrai a mensagem antes do bloco JSON
          const messageBeforeJson = response.split('```json')[0].trim();
          return {
            message: messageBeforeJson,
            hasTemplateTrigger: true,
          };
        }
      }
    } catch (error) {
      console.error('Erro ao parsear JSON da resposta:', error);
    }
  }

  return {
    message: response,
    hasTemplateTrigger: false,
  };
};

/**
 * Verifica se a resposta contém dados de carrossel gerado
 */
export const parseCarouselData = (
  response: string
): { message: string; hasCarousel: boolean; carouselData: any } => {
  // Primeiro tenta com markdown ```json
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const matchMarkdown = response.match(jsonBlockRegex);

  if (matchMarkdown && matchMarkdown[1]) {
    try {
      const jsonContent = JSON.parse(matchMarkdown[1]);
      
      if (jsonContent.dados_gerais) {
        const messageBeforeJson = response.split('```json')[0].trim();
        return {
          message: messageBeforeJson,
          hasCarousel: true,
          carouselData: jsonContent,
        };
      }
    } catch (error) {
      console.error('Erro ao parsear JSON com markdown:', error);
    }
  }

  // Tenta detectar JSON direto (sem markdown) que começa com { e contém "dados_gerais"
  try {
    // Procura por um objeto JSON que comece com { e termine com }
    const directJsonRegex = /\{[\s\S]*"dados_gerais"[\s\S]*\}/;
    const matchDirect = response.match(directJsonRegex);
    
    if (matchDirect) {
      const jsonContent = JSON.parse(matchDirect[0]);
      
      if (jsonContent.dados_gerais) {
        // Extrai mensagem antes do JSON (se houver)
        const messageBeforeJson = response.substring(0, response.indexOf('{')).trim();
        return {
          message: messageBeforeJson,
          hasCarousel: true,
          carouselData: jsonContent,
        };
      }
    }
  } catch (error) {
    console.error('Erro ao parsear JSON direto:', error);
  }

  return {
    message: response,
    hasCarousel: false,
    carouselData: null,
  };
};

/**
 * Gera um ID único para mensagens
 */
export const generateMessageId = (): string => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
