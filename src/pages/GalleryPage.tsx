import { useState, useEffect } from 'react';
import Gallery from '../components/Gallery';
import Navigation from '../components/Navigation';
import { CarouselViewer } from '../../Carousel-Template';
import type { CarouselData } from '../../Carousel-Template';
import { CacheService, CACHE_KEYS } from '../services/cache';

interface GalleryCarousel {
  id: string;
  postCode: string;
  templateName: string;
  createdAt: number;
  slides: string[];
  carouselData: CarouselData;
  viewed?: boolean;
}

const GalleryPage = () => {
  const [galleryCarousels, setGalleryCarousels] = useState<GalleryCarousel[]>([]);
  const [currentSlides, setCurrentSlides] = useState<string[] | null>(null);
  const [currentCarouselData, setCurrentCarouselData] = useState<CarouselData | null>(null);

  // Carrega carrosséis do cache ao montar
  useEffect(() => {
    try {
      const cached = CacheService.getItem<GalleryCarousel[]>(CACHE_KEYS.GALLERY);
      if (cached && Array.isArray(cached)) {
        setGalleryCarousels(cached);
      }
    } catch (err) {
      console.warn('Falha ao carregar galeria do cache:', err);
    }
  }, []);

  // Escuta atualizações em tempo real da galeria
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as GalleryCarousel[] | undefined;
        if (detail && Array.isArray(detail)) {
          setGalleryCarousels(detail);
        } else {
          const cached = CacheService.getItem<GalleryCarousel[]>(CACHE_KEYS.GALLERY);
          if (cached) setGalleryCarousels(cached);
        }
      } catch (err) {
        console.warn('Erro no manipulador gallery:updated:', err);
      }
    };
    window.addEventListener('gallery:updated', handler as EventListener);
    return () => window.removeEventListener('gallery:updated', handler as EventListener);
  }, []);

  return (
    <>
      <Navigation />
      {currentSlides && currentCarouselData && (
        <CarouselViewer
          slides={currentSlides}
          carouselData={currentCarouselData}
          onClose={() => {
            setCurrentSlides(null);
            setCurrentCarouselData(null);
          }}
        />
      )}
      <Gallery
        carousels={galleryCarousels}
        onViewCarousel={(carousel) => {
          setCurrentSlides(carousel.slides);
          setCurrentCarouselData(carousel.carouselData);
        }}
      />
    </>
  );
};

export default GalleryPage;