import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CarouselViewerProps {
  slides: string[];
  onClose: () => void;
}

const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrevSlide();
      } else if (e.key === 'ArrowRight') {
        handleNextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide]);

  const handlePrevSlide = () => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : slides.length - 1));
  };

  const handleNextSlide = () => {
    setCurrentSlide((prev) => (prev < slides.length - 1 ? prev + 1 : 0));
  };

  const handleDownload = () => {
    const blob = new Blob([slides[currentSlide]], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slide-${currentSlide + 1}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="absolute top-4 right-4 flex items-center space-x-4">
        <button
          onClick={handleDownload}
          className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors"
          title="Download slide"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-full">
        <span className="font-semibold">
          {currentSlide + 1} / {slides.length}
        </span>
      </div>

      <button
        onClick={handlePrevSlide}
        className="absolute left-8 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition-colors"
        title="Previous (←)"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        onClick={handleNextSlide}
        className="absolute right-8 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition-colors"
        title="Next (→)"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      <div className="w-full max-w-4xl h-[80vh] px-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full bg-white rounded-lg shadow-2xl overflow-hidden"
          >
            <iframe
              srcDoc={slides[currentSlide]}
              className="w-full h-full border-0"
              title={`Slide ${currentSlide + 1}`}
              sandbox="allow-same-origin"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex space-x-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentSlide
                ? 'bg-white w-8'
                : 'bg-white/40 hover:bg-white/60'
            }`}
            title={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default CarouselViewer;
