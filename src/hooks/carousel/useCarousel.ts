import { useState } from 'react';
import { CarouselData, GenerationQueueItem } from '../../types/carousel';
import { AVAILABLE_TEMPLATES } from '../../types/carousel';
import { generateCarousel, templateService, templateRenderer } from '../../services/carousel';

export const useCarousel = () => {
  const [generationQueue, setGenerationQueue] = useState<GenerationQueueItem[]>([]);
  const [renderedSlides, setRenderedSlides] = useState<string[] | null>(null);
  const [carouselData, setCarouselData] = useState<CarouselData | null>(null);

  const handleGenerateCarousel = async (code: string, templateId: string) => {
    const template = AVAILABLE_TEMPLATES.find(t => t.id === templateId);
    const queueItem: GenerationQueueItem = {
      id: `${code}-${templateId}-${Date.now()}`,
      postCode: code,
      templateId,
      templateName: template?.name || `Template ${templateId}`,
      status: 'generating',
      createdAt: Date.now(),
    };

    setGenerationQueue(prev => [...prev, queueItem]);

    try {
      console.log(`Generating carousel for post: ${code} with template: ${templateId}`);
      const result = await generateCarousel(code, templateId);
      console.log('Carousel generated successfully:', result);

      if (result && result.length > 0) {
        const carouselData = result[0];
        const responseTemplateId = carouselData.dados_gerais.template;

        console.log(`Fetching template ${responseTemplateId}...`);
        const templateSlides = await templateService.fetchTemplate(responseTemplateId);

        // Configura a compatibilidade do template no renderer
        const templateConfig = AVAILABLE_TEMPLATES.find(t => t.id === responseTemplateId);
        if (templateConfig) {
          templateRenderer.setTemplateCompatibility(templateConfig.compatibility);
          console.log(`Template compatibility set to: ${templateConfig.compatibility}`);
        }

        console.log('Rendering slides with data...');
        const rendered = templateRenderer.renderAllSlides(templateSlides, carouselData);

        setRenderedSlides(rendered);
        setCarouselData(carouselData);

        setGenerationQueue(prev =>
          prev.map(item =>
            item.id === queueItem.id
              ? { ...item, status: 'completed', completedAt: Date.now() }
              : item
          )
        );

        return { rendered, carouselData };
      }
    } catch (error) {
      console.error('Failed to generate carousel:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      setGenerationQueue(prev =>
        prev.map(item =>
          item.id === queueItem.id
            ? { ...item, status: 'error', errorMessage, completedAt: Date.now() }
            : item
        )
      );

      throw error;
    }
  };

  const closeCarousel = () => {
    setRenderedSlides(null);
    setCarouselData(null);
  };

  return {
    generationQueue,
    renderedSlides,
    carouselData,
    handleGenerateCarousel,
    closeCarousel,
  };
};
