import React, { createContext, useContext, useState, useEffect } from 'react';
import type { GenerationQueueItem } from '../carousel';

interface GenerationQueueContextType {
  generationQueue: GenerationQueueItem[];
  addToQueue: (item: GenerationQueueItem) => void;
  updateQueueItem: (id: string, updates: Partial<GenerationQueueItem>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
}

const GenerationQueueContext = createContext<GenerationQueueContextType | undefined>(undefined);

export const GenerationQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [generationQueue, setGenerationQueue] = useState<GenerationQueueItem[]>(() => {
    // Carrega fila do localStorage ao iniciar
    try {
      const saved = localStorage.getItem('generationQueue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persiste fila no localStorage sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem('generationQueue', JSON.stringify(generationQueue));
    } catch (error) {
      console.warn('Erro ao salvar fila no localStorage:', error);
    }
  }, [generationQueue]);

  const addToQueue = (item: GenerationQueueItem) => {
    console.log('➕ Adicionando item à fila:', item.id);
    setGenerationQueue(prev => [...prev, item]);
  };

  const updateQueueItem = (id: string, updates: Partial<GenerationQueueItem>) => {
    console.log('🔄 Atualizando item da fila:', id, updates);
    setGenerationQueue(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const removeFromQueue = (id: string) => {
    console.log('➖ Removendo item da fila:', id);
    setGenerationQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    console.log('🗑️ Limpando toda a fila');
    setGenerationQueue([]);
  };

  return (
    <GenerationQueueContext.Provider
      value={{
        generationQueue,
        addToQueue,
        updateQueueItem,
        removeFromQueue,
        clearQueue,
      }}
    >
      {children}
    </GenerationQueueContext.Provider>
  );
};

export const useGenerationQueue = () => {
  const context = useContext(GenerationQueueContext);
  if (!context) {
    throw new Error('useGenerationQueue must be used within GenerationQueueProvider');
  }
  return context;
};
