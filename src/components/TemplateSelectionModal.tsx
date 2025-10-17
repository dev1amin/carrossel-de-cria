import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TemplateConfig, AVAILABLE_TEMPLATES } from '../types/template';
import { templateService } from '../services/template';

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  postCode: string;
}

const TemplateSelectionModal: React.FC<TemplateSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  postCode
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig>(AVAILABLE_TEMPLATES[0]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedTemplate || !isOpen) return;

      setIsLoadingPreview(true);
      try {
        const slides = await templateService.fetchTemplate(selectedTemplate.id);
        if (slides && slides.length > 0) {
          setPreviewHtml(slides[0]);
        }
      } catch (error) {
        console.error('Failed to load template preview:', error);
        setPreviewHtml(null);
      } finally {
        setIsLoadingPreview(false);
      }
    };

    loadPreview();
  }, [selectedTemplate, isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleGenerate = () => {
    onSelectTemplate(selectedTemplate.id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-gray-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-800">
            <h2 className="text-2xl font-bold text-white">Selecionar Template</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-col md:flex-row h-[calc(90vh-180px)]">
            <div className="w-full md:w-1/3 p-4 overflow-y-auto border-r border-gray-800">
              <div className="space-y-3">
                {AVAILABLE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`w-full p-4 rounded-xl transition-all ${
                      selectedTemplate.id === template.id
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 shadow-lg scale-105'
                        : 'bg-gray-800 hover:bg-gray-750'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <img
                        src={template.thumbnail}
                        alt={template.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div className="flex-1 text-left">
                        <h3 className="text-white font-semibold text-lg">
                          {template.name}
                        </h3>
                        <p className="text-gray-400 text-sm">
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full md:w-2/3 p-6 bg-gray-950 flex items-center justify-center">
              {isLoadingPreview ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
                  <p className="text-gray-400">Carregando preview...</p>
                </div>
              ) : previewHtml ? (
                <div className="w-full h-full flex items-center justify-center overflow-auto">
                  <div className="bg-white rounded-lg shadow-2xl" style={{ width: '400px', height: '600px' }}>
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-full rounded-lg"
                      title={`Preview ${selectedTemplate.name}`}
                      sandbox="allow-scripts"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-center">
                  <p>Preview não disponível</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 border-t border-gray-800">
            <button
              onClick={handleGenerate}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
            >
              <span>Gerar {selectedTemplate.name}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TemplateSelectionModal;
