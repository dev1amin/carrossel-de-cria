export interface CarouselConfig {
  webhook: {
    generateCarousel: string;
    searchImages: string;
  };
  minio: {
    endpoint: string;
    bucket: string;
  };
  templates: {
    totalSlides: number;
  };
}

const defaultConfig: CarouselConfig = {
  webhook: {
    generateCarousel: 'https://webhook.workez.online/webhook/generateCarousel',
    searchImages: 'https://webhook.workez.online/webhook/searchImages',
  },
  minio: {
    endpoint: 'https://s3.workez.online',
    bucket: 'carousel-templates',
  },
  templates: {
    totalSlides: 10,
  },
};

let currentConfig: CarouselConfig = { ...defaultConfig };

export const configureCarousel = (config: Partial<CarouselConfig>): void => {
  currentConfig = {
    webhook: { ...currentConfig.webhook, ...config.webhook },
    minio: { ...currentConfig.minio, ...config.minio },
    templates: { ...currentConfig.templates, ...config.templates },
  };
};

export const getCarouselConfig = (): CarouselConfig => currentConfig;

export const resetCarouselConfig = (): void => {
  currentConfig = { ...defaultConfig };
};
