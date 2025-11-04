import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, X, Eye } from 'lucide-react';
import { GenerationQueueItem } from '../../types/carousel';

interface GenerationQueueProps {
  items: GenerationQueueItem[];
  onRemoveItem?: (id: string) => void;
  onViewCarousel?: (item: GenerationQueueItem) => void;
}

const GenerationQueue: React.FC<GenerationQueueProps> = ({ items, onRemoveItem, onViewCarousel }) => {
  // Estado de minimizado persiste no localStorage
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      const saved = localStorage.getItem('queueMinimized');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Persiste estado de minimizado
  useEffect(() => {
    localStorage.setItem('queueMinimized', JSON.stringify(isMinimized));
  }, [isMinimized]);

  console.log('🔔 GenerationQueue renderizado:', { itemsCount: items.length, isMinimized });
  
  if (items.length === 0) return null;

  const activeItems = items.filter(item => item.status === 'generating');
  const hasActiveItems = activeItems.length > 0;

  const toggleMinimize = () => {
    setIsMinimized((prev: boolean) => !prev);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'generating':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'generating':
        return 'Gerando...';
      case 'completed':
        return 'Concluído';
      case 'error':
        return 'Erro';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'generating':
        return 'bg-blue-500/20 border-blue-500/50';
      case 'completed':
        return 'bg-green-500/20 border-green-500/50';
      case 'error':
        return 'bg-red-500/20 border-red-500/50';
      default:
        return 'bg-gray-500/20 border-gray-500/50';
    }
  };

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      className="fixed left-0 right-0 bg-black/95 backdrop-blur-md border-b border-zinc-800 shadow-2xl"
      style={{ 
        zIndex: 70, // Acima da navegação (z-50), abaixo do header (z-100)
        top: '56px', // 14 * 4 = 56px (altura do header)
        left: '0', // Mobile: começa do início
        marginLeft: window.innerWidth >= 768 ? '64px' : '0' // Desktop: 64px offset (largura da navegação)
      }}
    >
      {/* Container com flex para separar conteúdo (80%) e toggle (20%) */}
      <div className="flex items-stretch">
        {/* Conteúdo principal - 80% */}
        <div className="flex-1" style={{ width: '80%' }}>
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center space-x-3">
              <h3 className="text-white font-semibold text-lg">Fila de Geração</h3>
              <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                {items.length}
              </span>
              {hasActiveItems && (
                <span className="text-blue-400 text-sm">
                  {activeItems.length} em progresso
                </span>
              )}
            </div>

            <AnimatePresence>
              {!isMinimized && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-3"
                >
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {items.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 20, opacity: 0 }}
                        className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(
                          item.status
                        )} transition-all`}
                      >
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(item.status)}
                          <div>
                            <p className="text-white font-medium">{item.templateName}</p>
                            <p className="text-gray-400 text-sm">Post: {item.postCode}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-sm font-medium text-white">
                            {getStatusText(item.status)}
                          </span>
                          {item.status === 'generating' && (
                            <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                                initial={{ width: '0%' }}
                                animate={{ width: '100%' }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                              />
                            </div>
                          )}
                          {item.status === 'completed' && (
                            <div className="flex items-center gap-2">
                              {onViewCarousel && (
                                <button
                                  onClick={() => onViewCarousel(item)}
                                  className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                  title="Visualizar carrossel"
                                >
                                  <Eye className="w-4 h-4 text-white" />
                                </button>
                              )}
                              {onRemoveItem && (
                                <button
                                  onClick={() => onRemoveItem(item.id)}
                                  className="p-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                  title="Remover da fila"
                                >
                                  <X className="w-4 h-4 text-white" />
                                </button>
                              )}
                            </div>
                          )}
                          {item.status === 'error' && onRemoveItem && (
                            <button
                              onClick={() => onRemoveItem(item.id)}
                              className="p-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                              title="Remover da fila"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Toggle minimizar - 20% */}
        <div 
          className="flex items-center justify-center bg-zinc-900/50 border-l border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors"
          style={{ width: '20%', minWidth: '60px', maxWidth: '100px' }}
          onClick={toggleMinimize}
        >
          <button
            className="flex items-center justify-center p-4 w-full h-full"
            aria-label={isMinimized ? "Expandir fila" : "Minimizar fila"}
          >
            {isMinimized ? (
              <ChevronDown className="w-6 h-6 text-white" />
            ) : (
              <ChevronUp className="w-6 h-6 text-white" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default GenerationQueue;
