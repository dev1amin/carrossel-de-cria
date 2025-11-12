import React, { useState } from 'react';
import { ExternalLink, Sparkles, Newspaper } from 'lucide-react';
import { TemplateSelectionModal } from '../carousel';
import type { NewsItem } from '../types/news';

interface NewsPostCardProps {
  news: NewsItem;
  index: number;
  onGenerateCarousel?: (newsData: NewsItem, templateId: string) => void;
}

const NewsPostCard: React.FC<NewsPostCardProps> = ({ news, index, onGenerateCarousel }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    if (!onGenerateCarousel) return;
    setIsModalOpen(true);
  };

  const handleSelectTemplate = (templateId: string) => {
    if (onGenerateCarousel) {
      onGenerateCarousel(news, templateId);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const getFlagEmoji = (countryCode: string) => {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  const handleOpenOriginal = () => {
    window.open(news.url, '_blank');
  };

  return (
    <div className="relative w-full max-w-[300px] bg-black rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow border border-white/10">
      <div className="px-4 py-3 flex items-center justify-between bg-black border-b border-white/10">
        <div className="flex items-center space-x-4">
          <div className="flex items-center" style={{ color: 'rgb(147, 51, 234)' }}>
            <Newspaper className="w-4 h-4 mr-1" />
            <span className="font-bold text-xs text-white">{news.niches.name}</span>
          </div>
        </div>
        <span className="text-sm text-white/40 font-bold">{formatTimeAgo(news.publishedAt)}</span>
      </div>
      
      <div className="relative w-full" style={{ paddingBottom: '140%' }}>
        {/* News Content */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden bg-black">
          {/* Image */}
          {news.image && (
            <div className="relative w-full h-[200px] overflow-hidden bg-white/5">
              <img
                src={news.image}
                alt={news.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 flex gap-1">
                <span className="px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-xs text-white font-bold">
                  {getFlagEmoji(news.country)} {news.country.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-xs text-white font-bold">
                  {news.lang.toUpperCase()}
                </span>
              </div>
              {news.recommend && (
                <div className="absolute top-2 right-2">
                  <div className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 backdrop-blur-sm rounded-full text-xs text-white font-bold flex items-center gap-1.5 shadow-lg">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Recomendado pela IA</span>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Content */}
          <div 
            className="p-4 h-[calc(100%-200px)] overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#374151 transparent',
            }}
          >
            <style>{`
              div::-webkit-scrollbar {
                width: 2px;
              }
              div::-webkit-scrollbar-track {
                background: transparent;
              }
              div::-webkit-scrollbar-thumb {
                background-color: #374151;
                border-radius: 10px;
              }
              div::-webkit-scrollbar-thumb:hover {
                background-color: #4B5563;
              }
            `}</style>
            <h3 className="text-white font-bold text-base mb-2 line-clamp-3">
              {news.title}
            </h3>
            <p className="text-white/70 text-sm line-clamp-6 mb-3">
              {news.description}
            </p>
            {news.content && (
              <p className="text-white/50 text-xs line-clamp-8">
                {news.content}
              </p>
            )}
          </div>
        </div>

        {/* Buttons Overlay */}
        <button
          onClick={handleOpenOriginal}
          className="absolute top-3 right-1 z-50 bg-black text-white px-3 py-1.5 rounded text-sm flex items-center space-x-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>See Content</span>
        </button>

        <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end space-y-2">
          <div className="bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm flex items-center space-x-2">
            <Newspaper className="w-4 h-4 text-white" />
            <span>#{index + 1}</span>
          </div>
          {onGenerateCarousel && (
            <>
              <button
                onClick={handleOpenModal}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-3 py-1.5 rounded-full text-sm flex items-center space-x-2 transition-all shadow-lg hover:shadow-xl"
              >
                <Sparkles className="w-4 h-4" />
                <span>Gerar</span>
              </button>
              <TemplateSelectionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelectTemplate={handleSelectTemplate}
                postCode={news.id}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewsPostCard;
