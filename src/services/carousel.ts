interface CarouselResponse {
  dados_gerais: {
    nome: string;
    arroba: string;
    foto_perfil: string;
    template: string;
  };
  conteudos: Array<{
    title: string;
    subtitle?: string;
    imagem_fundo: string;
    thumbnail_url?: string;
    imagem_fundo2?: string;
    imagem_fundo3?: string;
  }>;
}

export async function generateCarousel(code: string, templateId?: string): Promise<CarouselResponse[]> {
  const webhookUrl = 'https://webhook.workez.online/webhook/generateCarousel';

  const requestBody: { code: string; template?: string } = { code };
  if (templateId) {
    requestBody.template = templateId;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error generating carousel:', error);
    throw error;
  }
}
