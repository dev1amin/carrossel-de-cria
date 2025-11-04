import { getCarouselConfig } from '../../config/carousel';
import { CarouselResponse } from '../../types/carousel';

interface GenerateCarouselParams {
  code: string;
  template?: string;
  jwt_token?: string;
  post_id?: number;
  news_data?: {
    id: string;
    title: string;
    description: string;
    content: string;
    url: string;
    image: string;
    publishedAt: string;
    country: string;
    lang: string;
    niche: string;
    type: 'news';
  };
}

export async function generateCarousel(
  code: string, 
  templateId?: string, 
  jwtToken?: string, 
  postId?: number,
  newsData?: GenerateCarouselParams['news_data']
): Promise<CarouselResponse[]> {
  const config = getCarouselConfig();
  const webhookUrl = config.webhook.generateCarousel;

  const requestBody: GenerateCarouselParams = { code };
  
  if (templateId) {
    requestBody.template = templateId;
  }
  
  if (jwtToken) {
    requestBody.jwt_token = jwtToken;
  }
  
  if (postId !== undefined) {
    requestBody.post_id = postId;
  }

  if (newsData) {
    requestBody.news_data = newsData;
  }

  console.log('📤 generateCarousel request:', requestBody);

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
    console.log('📥 generateCarousel response:', data);
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
