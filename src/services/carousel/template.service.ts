import { getCarouselConfig } from '../../config/carousel';

export class TemplateService {
  private cache: Map<string, string[]> = new Map();

  async fetchTemplate(templateId: string): Promise<string[]> {
    if (this.cache.has(templateId)) {
      console.log(`Using cached template ${templateId}`);
      return this.cache.get(templateId)!;
    }

    const config = getCarouselConfig();
    const MINIO_ENDPOINT = config.minio.endpoint;
    const MINIO_BUCKET = config.minio.bucket;
    const TOTAL_SLIDES = config.templates.totalSlides;

    const slides: string[] = [];
    const errors: string[] = [];

    console.log(`🔍 Fetching template "${templateId}" from MinIO...`);
    console.log(`📦 MinIO Config:`, { MINIO_ENDPOINT, MINIO_BUCKET, TOTAL_SLIDES });
    console.log(`🎯 Template path will be: ${MINIO_ENDPOINT}/${MINIO_BUCKET}/template${templateId}/`);

    for (let i = 1; i <= TOTAL_SLIDES; i++) {
      const url = `${MINIO_ENDPOINT}/${MINIO_BUCKET}/template${templateId}/Slide ${i}.html`;
      console.log(`📥 Fetching slide ${i}:`, url);

      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
        });

        console.log(`Slide ${i} response:`, response.status, response.ok);

        if (!response.ok) {
          throw new Error(`Failed to fetch slide ${i}: ${response.statusText}`);
        }

        const html = await response.text();
        console.log(`Slide ${i} loaded successfully, length: ${html.length}`);
        slides.push(html);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error loading slide ${i}:`, error);
        errors.push(`Slide ${i}: ${errorMsg}`);
      }
    }

    if (errors.length > 0) {
      console.error('Failed to load slides:', errors);
      throw new Error(`Failed to load some slides:\n${errors.join('\n')}`);
    }

    console.log(`All ${TOTAL_SLIDES} slides loaded successfully for template ${templateId}`);
    this.cache.set(templateId, slides);
    return slides;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCachedTemplate(templateId: string): string[] | null {
    return this.cache.get(templateId) || null;
  }
}

export const templateService = new TemplateService();
