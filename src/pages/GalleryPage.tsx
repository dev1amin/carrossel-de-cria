import { useState } from 'react';
import Gallery from '../components/Gallery';
import Navigation from '../components/Navigation';
import { CarouselViewer } from '../../Carousel-Template';
import type { CarouselData } from '../../Carousel-Template';

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
  // Estado preparado para funcionalidade futura de adição de carrosséis
  const [galleryCarousels] = useState<GalleryCarousel[]>([]);
  const [currentSlides, setCurrentSlides] = useState<string[] | null>(null);
  const [currentCarouselData, setCurrentCarouselData] = useState<CarouselData | null>(null);

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