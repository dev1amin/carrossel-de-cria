import React from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Calendar } from 'lucide-react';

interface GalleryCarousel {
  id: string;
  postCode: string;
  templateName: string;
  createdAt: number;
  slides: string[];
  carouselData: any;
}

interface GalleryProps {
  carousels: GalleryCarousel[];
  onViewCarousel: (carousel: GalleryCarousel) => void;
}

const Gallery: React.FC<GalleryProps> = ({ carousels, onViewCarousel }) => {
  if (carousels.length === 0) {
    return (
      <div className="min-h-screen bg-black pt-14">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-white mb-8">Galeria</h1>
          <div className="flex flex-col items-center justify-center py-20">
            <ImageIcon className="w-20 h-20 text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">Nenhum carrossel gerado ainda</p>
            <p className="text-gray-500 text-sm mt-2">
              Gere um carrossel a partir do Feed para vê-lo aqui
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pt-14">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Galeria</h1>
          <p className="text-gray-400">
            {carousels.length} {carousels.length === 1 ? 'carrossel' : 'carrosséis'} gerado{carousels.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {carousels.map((carousel, index) => (
            <motion.div
              key={carousel.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 hover:border-gray-700 transition-all cursor-pointer"
              onClick={() => onViewCarousel(carousel)}
            >
              <div className="aspect-[9/16] bg-gray-800 relative overflow-hidden">
                {carousel.slides[0] && (
                  <img
                    src={carousel.slides[0]}
                    alt={`${carousel.templateName} - Slide 1`}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {carousel.slides.length} slides
                </div>
              </div>

              <div className="p-4">
                <h3 className="text-white font-semibold mb-1">{carousel.templateName}</h3>
                <p className="text-gray-400 text-sm mb-3">Post: {carousel.postCode}</p>
                <div className="flex items-center text-gray-500 text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(carousel.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Gallery;
