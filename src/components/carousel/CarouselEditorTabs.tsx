import React, { useState } from 'react';
import { X } from 'lucide-react';
import CarouselViewer from './viewer/CarouselViewer';
import type { CarouselData } from '../../types/carousel';

export interface CarouselTab {
  id: string;
  slides: string[];
  carouselData: CarouselData;
  title: string;
  generatedContentId?: number; // ID do GeneratedContent na API
}

interface CarouselEditorTabsProps {
  tabs: CarouselTab[];
  onCloseTab: (tabId: string) => void;
  onCloseAll: () => void;
  onEditorsClosed?: () => void; // Callback quando todos os editores são fechados
  onSaveSuccess?: () => void; // Callback quando salva com sucesso
}

const CarouselEditorTabs: React.FC<CarouselEditorTabsProps> = ({ tabs, onCloseTab, onCloseAll, onEditorsClosed, onSaveSuccess }) => {
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || '');
  // Estado para controlar quais abas têm o editor aberto
  const [openEditors, setOpenEditors] = useState<Set<string>>(new Set(tabs.map(t => t.id)));

  // Quando uma nova aba é adicionada, ativa ela automaticamente
  React.useEffect(() => {
    if (tabs.length > 0) {
      const lastTab = tabs[tabs.length - 1];
      const currentTabExists = tabs.find(t => t.id === activeTabId);
      
      // Se a aba ativa não existe mais, ativa a última aba
      if (!currentTabExists) {
        console.log('🔄 Ativando última aba:', lastTab.id);
        setActiveTabId(lastTab.id);
        setOpenEditors(prev => new Set(prev).add(lastTab.id));
      }
    }
  }, [tabs, activeTabId]);

  // Adiciona novas abas ao conjunto de editores abertos
  React.useEffect(() => {
    setOpenEditors(prev => {
      const newSet = new Set(prev);
      tabs.forEach(tab => {
        if (!newSet.has(tab.id)) {
          newSet.add(tab.id);
        }
      });
      // Remove abas que não existem mais
      Array.from(newSet).forEach(id => {
        if (!tabs.find(t => t.id === id)) {
          newSet.delete(id);
        }
      });
      return newSet;
    });
  }, [tabs]);

  // Escuta evento para ativar uma aba específica
  React.useEffect(() => {
    const handleActivateTab = (e: Event) => {
      const tabId = (e as CustomEvent).detail as string;
      console.log('📡 Evento activateTab recebido:', tabId);
      if (tabs.find(t => t.id === tabId)) {
        console.log('✅ Ativando aba:', tabId);
        setActiveTabId(tabId);
        // Reabre o editor dessa aba
        setOpenEditors(prev => new Set(prev).add(tabId));
      } else {
        console.log('⚠️ Aba não encontrada:', tabId);
      }
    };
    
    window.addEventListener('activateTab', handleActivateTab as EventListener);
    return () => window.removeEventListener('activateTab', handleActivateTab as EventListener);
  }, [tabs]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isEditorOpen = activeTab ? openEditors.has(activeTab.id) : false;

  // Notifica quando nenhum editor está aberto
  React.useEffect(() => {
    if (openEditors.size === 0 && onEditorsClosed) {
      onEditorsClosed();
    }
  }, [openEditors.size, onEditorsClosed]);

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onCloseTab(tabId);
  };

  const handleCloseEditor = () => {
    if (activeTab) {
      setOpenEditors(prev => {
        const newSet = new Set(prev);
        newSet.delete(activeTab.id);
        return newSet;
      });
    }
  };

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    // Ao clicar em uma aba, abre o editor dela
    setOpenEditors(prev => new Set(prev).add(tabId));
  };

  // Se não há abas, nenhum editor está aberto, ou a aba ativa não tem editor aberto
  // não renderiza o container de abas
  if (tabs.length === 0 || openEditors.size === 0 || !isEditorOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-neutral-900 flex flex-col" 
      style={{ 
        zIndex: 1000, 
        marginTop: '56px', 
        marginLeft: window.innerWidth >= 768 ? '64px' : '0',
        pointerEvents: 'auto'
      }}
    >
      {/* Barra de abas */}
      <div 
        className="bg-neutral-950 border-b border-neutral-800 flex items-center overflow-x-auto" 
        style={{ 
          minHeight: '40px',
          zIndex: 1001,
          position: 'relative',
          pointerEvents: 'auto'
        }}
      >
        <div className="flex items-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`group flex items-center gap-2 px-4 py-2 border-r border-neutral-800 transition-colors ${
                activeTabId === tab.id
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-950 text-neutral-400 hover:bg-neutral-900 hover:text-white'
              }`}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            >
              <span className="text-sm font-medium truncate max-w-[150px]">
                {tab.title}
              </span>
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className={`p-0.5 rounded hover:bg-neutral-800 transition-colors ${
                  activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                aria-label="Fechar aba"
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </button>
          ))}
        </div>
        
        {/* Botão fechar todas as abas */}
        {tabs.length > 1 && (
          <button
            onClick={onCloseAll}
            className="ml-auto px-4 py-2 text-neutral-400 hover:text-white text-xs transition-colors"
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          >
            Fechar todas
          </button>
        )}
      </div>

      {/* Conteúdo da aba ativa */}
      <div className="flex-1 relative overflow-auto" style={{ zIndex: 1 }}>
        {activeTab && isEditorOpen && (
          <CarouselViewer
            slides={activeTab.slides}
            carouselData={activeTab.carouselData}
            onClose={handleCloseEditor}
            generatedContentId={activeTab.generatedContentId}
            onSaveSuccess={onSaveSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default CarouselEditorTabs;
