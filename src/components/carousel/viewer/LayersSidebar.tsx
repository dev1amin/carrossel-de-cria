import React from 'react';
import { ChevronDown, ChevronRight, Layers as LayersIcon, Image as ImageIcon, Type } from 'lucide-react';
import type { CarouselData, ElementType } from '../../../types/carousel';

interface LayersSidebarProps {
  slides: string[];
  carouselData: CarouselData;
  expandedLayers: Set<number>;
  focusedSlide: number;
  selectedElement: { slideIndex: number; element: ElementType };
  onToggleLayer: (index: number) => void;
  onElementClick: (slideIndex: number, element: ElementType) => void;
  onSlideClick: (index: number) => void;
}

export const LayersSidebar: React.FC<LayersSidebarProps> = ({
  slides,
  carouselData,
  expandedLayers,
  focusedSlide,
  selectedElement,
  onToggleLayer,
  onElementClick,
  onSlideClick,
}) => {
  return (
    <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col shrink-0">
      <div className="h-14 border-b border-neutral-800 flex items-center px-4">
        <LayersIcon className="w-4 h-4 text-neutral-400 mr-2" />
        <h3 className="text-white font-medium text-sm">Layers</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {slides.map((_, index) => {
          const conteudo = (carouselData as any).conteudos[index];
          const isExpanded = expandedLayers.has(index);
          const isFocused = focusedSlide === index;
          return (
            <div key={index} className={`border-b border-neutral-800 ${isFocused ? 'bg-neutral-900' : ''}`}>
              <button
                onClick={() => {
                  onToggleLayer(index);
                  onSlideClick(index);
                }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-900 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-neutral-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-neutral-500" />
                  )}
                  <LayersIcon className="w-3 h-3 text-blue-400" />
                  <span className="text-white text-sm">Slide {index + 1}</span>
                </div>
              </button>
              {isExpanded && conteudo && (
                <div className="ml-3 border-l border-neutral-800">
                  <button
                    onClick={() => onElementClick(index, 'background')}
                    className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                      selectedElement.slideIndex === index && selectedElement.element === 'background'
                        ? 'bg-neutral-800'
                        : ''
                    }`}
                  >
                    <ImageIcon className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-300 text-xs">Background Image/Video</span>
                  </button>
                  <button
                    onClick={() => onElementClick(index, 'title')}
                    className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                      selectedElement.slideIndex === index && selectedElement.element === 'title'
                        ? 'bg-neutral-800'
                        : ''
                    }`}
                  >
                    <Type className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-300 text-xs">Title</span>
                  </button>
                  {conteudo.subtitle && (
                    <button
                      onClick={() => onElementClick(index, 'subtitle')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index && selectedElement.element === 'subtitle'
                          ? 'bg-neutral-800'
                          : ''
                      }`}
                    >
                      <Type className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Subtitle</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
