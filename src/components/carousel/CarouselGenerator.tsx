import React, { useState } from 'react';
import CarouselViewer from './viewer/CarouselViewer';
import TemplateSelectionModal from './TemplateSelectionModal';
import GenerationQueue from './GenerationQueue';
import { useCarousel } from '../../hooks/carousel';

export interface CarouselGeneratorProps {
  onGenerateClick: (postCode: string) => void;
  renderTrigger?: (props: { onClick: () => void }) => React.ReactNode;
  postCode: string;
}

const CarouselGenerator: React.FC<CarouselGeneratorProps> = ({
  onGenerateClick,
  renderTrigger,
  postCode
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQueueExpanded, setIsQueueExpanded] = useState(true);

  const {
    generationQueue,
    renderedSlides,
    carouselData,
    handleGenerateCarousel,
    closeCarousel,
  } = useCarousel();

  const handleOpenModal = () => {
    setIsModalOpen(true);
    if (onGenerateClick) {
      onGenerateClick(postCode);
    }
  };

  const handleSelectTemplate = async (templateId: string) => {
    try {
      await handleGenerateCarousel(postCode, templateId);
    } catch (error) {
      console.error('Error generating carousel:', error);
    }
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ onClick: handleOpenModal })
      ) : (
        <button
          onClick={handleOpenModal}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-2 rounded-lg transition-all shadow-lg"
        >
          Gerar Carrossel
        </button>
      )}

      <TemplateSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        postCode={postCode}
      />

      {generationQueue.length > 0 && (
        <GenerationQueue
          items={generationQueue}
          isExpanded={isQueueExpanded}
          onToggleExpand={() => setIsQueueExpanded(!isQueueExpanded)}
        />
      )}

      {renderedSlides && carouselData && (
        <CarouselViewer
          slides={renderedSlides}
          carouselData={carouselData}
          onClose={closeCarousel}
        />
      )}
    </>
  );
};

export default CarouselGenerator;
