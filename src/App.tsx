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
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';

// Componente interno para usar o hook da fila
function AppContent() {
  const { generationQueue, removeFromQueue } = useGenerationQueue();
  const { addEditorTab, shouldShowEditor, setShouldShowEditor } = useEditorTabs();

  const handleViewCarousel = (item: GenerationQueueItem) => {
    if (!item.slides || !item.carouselData) {
      console.warn('Item da fila não tem dados de carrossel:', item);
      return;
    }

    const newTab: CarouselTab = {
      id: `queue-${item.id}`,
      slides: item.slides,
      carouselData: item.carouselData,
      title: item.templateName,
    };

    addEditorTab(newTab);
    setShouldShowEditor(true);
  };

  return (
    <>
      {/* Fila global - renderizada fora das rotas */}
      <GenerationQueue 
        items={generationQueue}
        onRemoveItem={removeFromQueue}
        onViewCarousel={handleViewCarousel}
      />
      
      <Routes>
        {/* Rota de Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rota Raiz */}
        <Route path="/" element={<Navigate to="/feed" replace />} />

        {/* Rotas Protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/news" element={<NewsPage />} />
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