import { getCarouselConfig } from '../config';
import { CarouselResponse } from '../types';

export async function generateCarousel(code: string, templateId?: string): Promise<CarouselResponse[]> {
  const config = getCarouselConfig();
  const webhookUrl = config.webhook.generateCarousel;

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

export async function searchImages(keyword: string): Promise<string[]> {
  const config = getCarouselConfig();
  const webhookUrl = config.webhook.searchImages;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyword }),
    });

    if (!response.ok) {
      throw new Error('Failed to search images');
    }

    const data = await response.json();
    if (data) {
      const imageUrls = [
        data.imagem_fundo,
        data.imagem_fundo2,
        data.imagem_fundo3,
        data.imagem_fundo4,
        data.imagem_fundo5,
        data.imagem_fundo6,
      ].filter(Boolean);
      return imageUrls;
    }
    return [];
  } catch (error) {
    console.error('Error searching images:', error);
    throw error;
  }
}
