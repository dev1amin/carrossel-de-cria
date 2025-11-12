import React, { createContext, useContext, useState, useEffect } from 'react';
import { CarouselTab } from '../carousel';

interface EditorTabsContextType {
  editorTabs: CarouselTab[];
  addEditorTab: (tab: CarouselTab) => void;
  updateEditorTab: (tabId: string, tab: CarouselTab) => void;
  closeEditorTab: (tabId: string) => void;
  closeAllEditorTabs: () => void;
  shouldShowEditor: boolean;
  setShouldShowEditor: (show: boolean) => void;
}

const EditorTabsContext = createContext<EditorTabsContextType | undefined>(undefined);

export const EditorTabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [editorTabs, setEditorTabs] = useState<CarouselTab[]>(() => {
    // Carrega abas do localStorage ao iniciar
    try {
      const saved = localStorage.getItem('editorTabs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [shouldShowEditor, setShouldShowEditor] = useState(false);

  // Persiste abas no localStorage sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem('editorTabs', JSON.stringify(editorTabs));
    } catch (error) {
      console.warn('Erro ao salvar abas no localStorage:', error);
    }
  }, [editorTabs]);

  const addEditorTab = (tab: CarouselTab) => {
    // Verifica se já existe uma aba com este ID
    const existingTab = editorTabs.find(t => t.id === tab.id);
    
    if (existingTab) {
      // Se já existe, atualiza os dados da aba
      console.log('🔄 Aba já existe, atualizando dados:', tab.id);
      setEditorTabs(prev => prev.map(t => t.id === tab.id ? tab : t));
      setShouldShowEditor(true);
      
      // Aguarda o próximo ciclo de renderização para ativar
      requestAnimationFrame(() => {
        console.log('🎯 Ativando aba existente:', tab.id);
        window.dispatchEvent(new CustomEvent('activateTab', { detail: tab.id }));
      });
      return;
    }
    
    // Se não existe, cria nova aba e mostra o editor
    console.log('➕ Criando nova aba:', tab.id);
    setEditorTabs(prev => [...prev, tab]);
    setShouldShowEditor(true);
    
    // IMPORTANTE: Aguarda o React finalizar a renderização usando requestAnimationFrame
    // Isso garante que a nova aba foi adicionada ao DOM antes de ativar
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        console.log('🎯 Ativando nova aba após renderização:', tab.id);
        window.dispatchEvent(new CustomEvent('activateTab', { detail: tab.id }));
      });
    });
  };

  const updateEditorTab = (tabId: string, tab: CarouselTab) => {
    console.log('🔄 Atualizando aba:', tabId);
    setEditorTabs(prev => prev.map(t => t.id === tabId ? tab : t));
  };

  const closeEditorTab = (tabId: string) => {
    setEditorTabs(prev => prev.filter(tab => tab.id !== tabId));
  };

  const closeAllEditorTabs = () => {
    setEditorTabs([]);
    setShouldShowEditor(false);
  };

  return (
    <EditorTabsContext.Provider 
      value={{ 
        editorTabs, 
        addEditorTab,
        updateEditorTab,
        closeEditorTab, 
        closeAllEditorTabs,
        shouldShowEditor,
        setShouldShowEditor
      }}
    >
      {children}
    </EditorTabsContext.Provider>
  );
};

export const useEditorTabs = () => {
  const context = useContext(EditorTabsContext);
  if (!context) {
    throw new Error('useEditorTabs must be used within EditorTabsProvider');
  }
  return context;
};
