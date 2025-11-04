import React, { createContext, useContext, useState, useEffect } from 'react';
import { CarouselTab } from '../carousel';

interface EditorTabsContextType {
  editorTabs: CarouselTab[];
  addEditorTab: (tab: CarouselTab) => void;
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
      // Se já existe, ativa essa aba
      console.log('✅ Aba já existe, ativando:', tab.id);
      setShouldShowEditor(true);
      window.dispatchEvent(new CustomEvent('activateTab', { detail: tab.id }));
      return;
    }
    
    // Se não existe, cria nova aba e mostra o editor
    console.log('➕ Criando nova aba:', tab.id);
    setEditorTabs(prev => [...prev, tab]);
    setShouldShowEditor(true);
    
    // Ativa a nova aba automaticamente após um pequeno delay
    // para garantir que o componente foi renderizado
    setTimeout(() => {
      console.log('🎯 Ativando nova aba:', tab.id);
      window.dispatchEvent(new CustomEvent('activateTab', { detail: tab.id }));
    }, 0);
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
