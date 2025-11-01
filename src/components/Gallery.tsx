import { motion } from 'framer-motion';
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, Edit, Image } from 'lucide-react';
import Header from './Header';
import { SortOption } from '../types';

interface GalleryCarousel {
  id: string;
  postCode: string;
  templateName: string;
  createdAt: number;
  slides: string[];
  carouselData: any;
  viewed?: boolean;
}

interface GalleryProps {
  carousels: GalleryCarousel[];
  onViewCarousel: (carousel: GalleryCarousel) => void;
}

interface GalleryItemProps {
  carousel: GalleryCarousel;
  onViewCarousel: (carousel: GalleryCarousel) => void;
  onDownload: (carousel: GalleryCarousel) => void;
}

const EmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center h-[50vh] text-zinc-400">
      <Image className="w-16 h-16 mb-4 opacity-50" />
      <p className="text-lg">Nenhum carrossel foi gerado ainda, pipipip</p>
    </div>
  );
};

const Gallery: React.FC<GalleryProps> = ({ carousels, onViewCarousel }) => {
  const [activeSort, setActiveSort] = useState<SortOption>('latest');
  const [unviewedCarousels, setUnviewedCarousels] = useState<Set<string>>(new Set());
  
  // Atualizar unviewedCarousels quando novos carrosséis forem adicionados
  useEffect(() => {
    const newUnviewed = new Set<string>();
    carousels.forEach(carousel => {
      if (!unviewedCarousels.has(carousel.id) && !carousel.viewed) {
        newUnviewed.add(carousel.id);
      }
    });
    if (newUnviewed.size > 0) {
      setUnviewedCarousels(prev => new Set([...prev, ...newUnviewed]));
    }
  }, [carousels]);

  const handleSearch = (term: string) => {
    // Implementar busca se necessário
    console.log('Search:', term);
  };

  const handleSortChange = (sort: SortOption) => {
    setActiveSort(sort);
    // Implementar ordenação se necessário
  };

  const handleDownload = async (carousel: GalleryCarousel) => {
    // Implemente a lógica de download aqui
    console.log('Download carousel:', carousel.id);
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="relative">
        <Header 
          onSearch={handleSearch}
          activeSort={activeSort}
          onSortChange={handleSortChange}
        />
      </div>
      
      <main className="container mx-auto px-4 pt-20">
        {carousels.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {carousels.map((carousel) => (
              <GalleryItem
                key={carousel.id}
                carousel={carousel}
                onViewCarousel={onViewCarousel}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

const GalleryItem = ({ carousel, onViewCarousel, onDownload }: GalleryItemProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev + 1) % carousel.slides.length);
  };

  const prevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev - 1 + carousel.slides.length) % carousel.slides.length);
  };

  const handleItemClick = () => {
    onViewCarousel(carousel);
  };

  return (
    <motion.div
      className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Carrossel */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1080/1350' }}>
        {/* Container para o slide com pointer-events desativados */}
        <div className="w-full h-full pointer-events-none flex items-center justify-center">
          <div 
            dangerouslySetInnerHTML={{ __html: carousel.slides[currentSlide] }}
            className="w-full h-full transform-gpu"
            style={{
              transform: 'scale(0.25)',
              transformOrigin: 'center center',
              position: 'absolute',
              width: '400%',
              height: '400%',
            }}
          />
        </div>
        
        {/* Botões de navegação com z-index maior */}
        <button
          onClick={prevSlide}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full hover:bg-black/70 z-40"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        
        <button
          onClick={nextSlide}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full hover:bg-black/70 z-40"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        {/* Indicador de slides */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 px-2 py-1 rounded-full text-white text-sm z-40">
          {currentSlide + 1}/{carousel.slides.length}
        </div>

        {/* Overlay para clique no carrossel */}
        <div 
          className="absolute inset-0 cursor-pointer z-30"
          onClick={handleItemClick}
        />
      </div>

      {/* Informações e botões */}
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-white font-medium">{carousel.templateName}</h3>
          <p className="text-zinc-400 text-sm">
            {new Date(carousel.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onDownload(carousel)}
            className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-md text-sm"
          >
            <Download className="w-4 h-4" />
            Baixar
          </button>
          <button
            onClick={() => onViewCarousel(carousel)}
            className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-md text-sm"
          >
            <Edit className="w-4 h-4" />
            Editar
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default Gallery;
