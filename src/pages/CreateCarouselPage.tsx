import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, MessageSquare, Instagram, ArrowRight, X } from 'lucide-react';
import Header from '../components/Header';
import Navigation from '../components/Navigation';
import PageTitle from '../components/PageTitle';
import { TemplateSelectionModal } from '../components/carousel';
import { useGenerationQueue } from '../contexts/GenerationQueueContext';
import { generateCarousel, AVAILABLE_TEMPLATES } from '../carousel';
import { templateService } from '../services/carousel';
import type { GenerationQueueItem } from '../carousel';
import { SortOption } from '../types';

const CreateCarouselPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSort, setActiveSort] = useState<SortOption>('popular');
  const [activeModal, setActiveModal] = useState<'instagram' | 'website' | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [pendingInstagramCode, setPendingInstagramCode] = useState<string | null>(null);
  const [pendingWebsiteLink, setPendingWebsiteLink] = useState<string | null>(null);
  const navigate = useNavigate();
  const { addToQueue, updateQueueItem, removeFromQueue } = useGenerationQueue();

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  const handleSortChange = (sort: SortOption) => {
    setActiveSort(sort);
  };

  const handleOpenModal = (type: 'instagram' | 'website') => {
    setActiveModal(type);
    setLinkInput('');
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setLinkInput('');
  };

  // Extrai o código do link do Instagram
  const extractInstagramCode = (url: string): string | null => {
    try {
      // Padrões possíveis:
      // https://www.instagram.com/p/DQoNfU0gDuO/?img_index=1
      // https://www.instagram.com/p/DQ0KlA8j-Zl/
      const match = url.match(/instagram\.com\/p\/([A-Za-z0-9_-]+)/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('Erro ao extrair código do Instagram:', error);
      return null;
    }
  };

  const handleSubmitLink = () => {
    if (!linkInput.trim()) return;

    if (activeModal === 'instagram') {
      // Extrai o código do Instagram
      const code = extractInstagramCode(linkInput);
      
      if (!code) {
        alert('Link do Instagram inválido. Use um link como: https://www.instagram.com/p/CODE/');
        return;
      }
      
      console.log('📸 Código do Instagram extraído:', code);
      setPendingInstagramCode(code);
      handleCloseModal();
      setIsTemplateModalOpen(true);
    } else if (activeModal === 'website') {
      // Salva o link do site e abre modal de template
      console.log('🌐 Link do site:', linkInput);
      setPendingWebsiteLink(linkInput);
      handleCloseModal();
      setIsTemplateModalOpen(true);
    }
  };

  // Handler quando usuário seleciona template
  const handleTemplateSelect = async (templateId: string) => {
    setIsTemplateModalOpen(false);

    const template = AVAILABLE_TEMPLATES.find(t => t.id === templateId);
    const isInstagram = !!pendingInstagramCode;
    const postCode = pendingInstagramCode || pendingWebsiteLink || 'link';

    const queueItem: GenerationQueueItem = {
      id: `${isInstagram ? 'instagram' : 'website'}-${postCode}-${templateId}-${Date.now()}`,
      postCode: postCode,
      templateId,
      templateName: template?.name || `Template ${templateId}`,
      status: 'generating',
      createdAt: Date.now(),
    };

    addToQueue(queueItem);
    console.log('✅ Item adicionado à fila:', queueItem.id);

    try {
      const jwtToken = localStorage.getItem('access_token');

      let result;
      
      if (isInstagram) {
        // Para Instagram: { "code": "DQXOFDtEUdG", "template": "2", "jwt_token": " " }
        console.log(`⏳ Gerando carrossel do Instagram - Code: ${pendingInstagramCode}, Template: ${templateId}`);
        result = await generateCarousel(
          pendingInstagramCode!, 
          templateId, 
          jwtToken || undefined
        );
      } else {
        // Para Website/News: { "template": "6", "jwt_token": " ", "news_data": { "url": "...", "type": "news" } }
        const newsData = {
          id: pendingWebsiteLink!,
          title: '',
          description: '',
          content: '',
          url: pendingWebsiteLink!,
          image: '',
          publishedAt: new Date().toISOString(),
          country: '',
          lang: 'pt',
          niche: '',
          type: 'news' as const,
        };
        
        console.log(`⏳ Gerando carrossel do Website - URL: ${pendingWebsiteLink}, Template: ${templateId}`);
        result = await generateCarousel(
          pendingWebsiteLink!, // code (será ignorado, mas é necessário)
          templateId, 
          jwtToken || undefined,
          undefined, // postId
          newsData // news_data
        );
      }
      console.log('✅ Carousel generated successfully:', result);

      if (!result) {
        console.error('❌ Result é null ou undefined');
        alert('Erro: resposta vazia do servidor');
        removeFromQueue(queueItem.id);
        return;
      }

      const resultArray = Array.isArray(result) ? result : [result];
      console.log('✅ resultArray:', resultArray);

      if (resultArray.length === 0) {
        console.error('❌ Array de resultado vazio');
        alert('Erro: nenhum dado retornado');
        removeFromQueue(queueItem.id);
        return;
      }

      const carouselData = resultArray[0];
      console.log('✅ carouselData extraído:', carouselData);

      // Verifica se há um ID de conteúdo gerado na resposta
      const generatedContentId = (carouselData as any).id || (carouselData as any).content_id || (carouselData as any).generated_content_id;
      console.log('🆔 generatedContentId encontrado:', generatedContentId);

      if (!carouselData || !carouselData.dados_gerais) {
        console.error('❌ Dados inválidos:', { carouselData });
        alert('Erro: formato de dados inválido');
        removeFromQueue(queueItem.id);
        return;
      }

      const responseTemplateId = carouselData.dados_gerais.template;
      console.log(`⏳ Buscando template ${responseTemplateId}...`);
      
      const templateSlides = await templateService.fetchTemplate(responseTemplateId);
      console.log('✅ Template obtido, total de slides:', templateSlides?.length || 0);

      if (!templateSlides || templateSlides.length === 0) {
        console.error('❌ Template inválido ou vazio');
        alert('Erro ao carregar template');
        removeFromQueue(queueItem.id);
        return;
      }

      // IMPORTANTE: Renderiza os templates com os dados do carrossel
      console.log('🎨 Renderizando templates com os dados do carrossel...');
      const { templateRenderer } = await import('../services/carousel');
      const renderedSlides = templateRenderer.renderAllSlides(templateSlides, carouselData);
      console.log('✅ Slides renderizados com dados:', renderedSlides.length);

      // Atualiza item da fila com sucesso (sem criar duplicata)
      // IMPORTANTE: Salva os slides RENDERIZADOS (com dados preenchidos)
      updateQueueItem(queueItem.id, {
        status: 'completed',
        slides: renderedSlides, // slides renderizados ao invés de templates vazios
        carouselData,
        generatedContentId, // Passa o ID se existir
      });
      
      console.log('✅ Fila atualizada com sucesso:', queueItem.id);
      console.log('👁️ Clique no ícone de olho para visualizar o carrossel');

    } catch (error) {
      console.error('❌ Erro ao gerar carrossel:', error);
      alert('Erro ao gerar carrossel. Verifique o console para mais detalhes.');
      removeFromQueue(queueItem.id);
    } finally {
      // Limpa os estados pendentes
      setPendingInstagramCode(null);
      setPendingWebsiteLink(null);
    }
  };

  const handleGoToChat = () => {
    navigate('/chatbot');
  };

  const cards = [
    {
      id: 'instagram',
      title: 'Link do Instagram',
      description: 'Cole o link de um carrossel do Instagram',
      icon: Instagram,
      color: 'from-purple-500 to-pink-500',
      onClick: () => handleOpenModal('instagram'),
    },
    {
      id: 'website',
      title: 'Link de Site',
      description: 'Cole o link de um site para criar carrossel',
      icon: Link2,
      color: 'from-blue-500 to-cyan-500',
      onClick: () => handleOpenModal('website'),
    },
    {
      id: 'chat',
      title: 'Conversar com Agente',
      description: 'Crie carrosséis conversando com IA',
      icon: MessageSquare,
      color: 'from-green-500 to-emerald-500',
      onClick: handleGoToChat,
    },
  ];

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navigation currentPage="chatbot" />
      
      <div className="md:ml-16">
        <Header
          onSearch={handleSearch}
          activeSort={activeSort}
          onSortChange={handleSortChange}
        />

        <PageTitle title="Criar Carrossel" />

        {/* Main Content */}
        <main className="px-6 py-12 min-h-screen flex flex-col justify-center items-center">
            <div className="max-w-6xl mx-auto">
            {/* Grid de Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    onClick={card.onClick}
                    className="group relative bg-white/5 border-2 border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-white/10"
                  >
                    {/* Gradient Background (subtle) */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`} />
                    
                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                      {/* Icon */}
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      
                      {/* Title */}
                      <h3 className="text-xl font-bold text-white">
                        {card.title}
                      </h3>
                      
                      {/* Description */}
                      <p className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                        {card.description}
                      </p>
                      
                      {/* Arrow */}
                      <div className="pt-2">
                        <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Info Text */}
            <div className="mt-12 text-center">
              <p className="text-white/40 text-sm">
                Escolha uma das opções acima para começar a criar seu carrossel
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* Modal de Input de Link */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 relative animate-in fade-in zoom-in duration-200">
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-black/40 hover:text-black transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-6">
              {activeModal === 'instagram' ? (
                <Instagram className="w-8 h-8 text-black" />
              ) : (
                <Link2 className="w-8 h-8 text-black" />
              )}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-black text-center mb-2">
              {activeModal === 'instagram' ? 'Link do Instagram' : 'Link do Site'}
            </h2>

            {/* Description */}
            <p className="text-black/60 text-center mb-6">
              {activeModal === 'instagram' 
                ? 'Cole o link do carrossel do Instagram que você deseja recriar'
                : 'Cole o link do site que você deseja transformar em carrossel'
              }
            </p>

            {/* Input */}
            <div className="space-y-4">
              <input
                type="url"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmitLink();
                  }
                }}
                placeholder={activeModal === 'instagram' 
                  ? 'https://www.instagram.com/p/...'
                  : 'https://exemplo.com/artigo'
                }
                className="w-full px-4 py-3 bg-black/5 border-2 border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent text-black placeholder-black/40"
                autoFocus
              />

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-3 bg-black/5 hover:bg-black/10 text-black rounded-lg font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmitLink}
                  disabled={!linkInput.trim()}
                  className="flex-1 px-4 py-3 bg-black hover:bg-black/90 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Processar Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Template */}
      <TemplateSelectionModal
        isOpen={isTemplateModalOpen}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setPendingInstagramCode(null);
          setPendingWebsiteLink(null);
        }}
        onSelectTemplate={handleTemplateSelect}
        postCode={pendingInstagramCode || pendingWebsiteLink || ''}
      />
    </div>
  );
};

export default CreateCarouselPage;