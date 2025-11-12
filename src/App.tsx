import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { configureCarousel, CarouselEditorTabs, type CarouselTab } from './carousel';
import { EditorTabsProvider, useEditorTabs } from './contexts/EditorTabsContext';
import { GenerationQueueProvider, useGenerationQueue } from './contexts/GenerationQueueContext';
import { GenerationQueue } from './carousel';
import type { GenerationQueueItem } from './carousel';
import LoginPage from './pages/LoginPage';
import FeedPage from './pages/FeedPage';
import NewsPage from './pages/NewsPage';
import GalleryPage from './pages/GalleryPage';
import StatsPage from './pages/StatsPage';
import SettingsPageContainer from './pages/SettingsPageContainer';
import CreateCarouselPage from './pages/CreateCarouselPage';
import CreateBusinessPage from './pages/CreateBusinessPage';
import ChatBotPage from './pages/ChatBotPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';

// Componente interno para usar o hook da fila
function AppContent() {
  const { generationQueue, removeFromQueue } = useGenerationQueue();
  const { 
    editorTabs, 
    addEditorTab, 
    closeEditorTab, 
    closeAllEditorTabs, 
    shouldShowEditor, 
    setShouldShowEditor 
  } = useEditorTabs();

  const handleViewCarousel = (item: GenerationQueueItem) => {
    console.log('👁️ handleViewCarousel chamado:', { 
      id: item.id, 
      hasSlides: !!item.slides, 
      hasCarouselData: !!item.carouselData,
      slidesLength: item.slides?.length,
      item 
    });

    if (!item.slides || !item.carouselData) {
      console.error('❌ Item da fila não tem dados de carrossel:', item);
      alert('Erro: Dados do carrossel não encontrados. Tente gerar novamente.');
      return;
    }

    const newTab: CarouselTab = {
      id: `queue-${item.id}`,
      slides: item.slides,
      carouselData: item.carouselData,
      title: item.templateName,
      generatedContentId: item.generatedContentId, // Passa o ID se existir
    };

    console.log('✅ Abrindo editor GLOBAL na mesma página:', {
      id: newTab.id,
      title: newTab.title,
      slidesLength: newTab.slides.length,
      hasCarouselData: !!newTab.carouselData,
      generatedContentId: newTab.generatedContentId,
      conteudosLength: (newTab.carouselData as any)?.conteudos?.length,
      dadosGerais: (newTab.carouselData as any)?.dados_gerais,
      firstContent: (newTab.carouselData as any)?.conteudos?.[0],
    });
    
    addEditorTab(newTab);
    setShouldShowEditor(true);
  };

  const handleEditorsClosed = () => {
    setShouldShowEditor(false);
  };

  return (
    <>
      {/* Fila global - renderizada fora das rotas */}
      <GenerationQueue 
        items={generationQueue}
        onRemoveItem={removeFromQueue}
        onViewCarousel={handleViewCarousel}
      />

      {/* Editor global - renderizado sobre qualquer página */}
      {shouldShowEditor && editorTabs.length > 0 && (
        <CarouselEditorTabs
          tabs={editorTabs}
          onCloseTab={closeEditorTab}
          onCloseAll={closeAllEditorTabs}
          onEditorsClosed={handleEditorsClosed}
        />
      )}
      
      <Routes>
        {/* Rota de Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rota de Setup de Business */}
        <Route path="/setup-business" element={<CreateBusinessPage />} />

        {/* Rota Raiz */}
        <Route path="/" element={<Navigate to="/feed" replace />} />

        {/* Rotas Protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/create-carousel" element={<CreateCarouselPage />} />
          <Route path="/chatbot" element={<ChatBotPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPageContainer />} />
        </Route>

        {/* Página 404 para rotas não encontradas */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

function App() {
  useEffect(() => {
    configureCarousel({
      webhook: {
        generateCarousel: 'https://webhook.workez.online/webhook/generateCarousel',
        searchImages: 'https://webhook.workez.online/webhook/searchImages',
      },
      minio: {
        endpoint: 'https://s3.workez.online',
        bucket: 'carousel-templates',
      },
      templates: {
        totalSlides: 10,
      },
    });
  }, []);

  return (
    <EditorTabsProvider>
      <GenerationQueueProvider>
        <AppContent />
      </GenerationQueueProvider>
    </EditorTabsProvider>
  );
}

export default App;