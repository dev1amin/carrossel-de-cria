import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { GenerationQueueItem } from '../types';

interface GenerationQueueProps {
  items: GenerationQueueItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const GenerationQueue: React.FC<GenerationQueueProps> = ({ items, isExpanded, onToggleExpand }) => {
  if (items.length === 0) return null;

  const activeItems = items.filter(item => item.status === 'generating');
  const hasActiveItems = activeItems.length > 0;

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
      className="fixed top-14 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-md border-b border-gray-800 shadow-lg md:left-16 z-99"
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
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
          <button
            onClick={onToggleExpand}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 max-h-64 overflow-y-auto">
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
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default GenerationQueue;
