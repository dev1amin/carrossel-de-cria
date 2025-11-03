import React from 'react';
import type { NewsItem } from '../types/news';

interface NewsCardProps {
  news: NewsItem;
}

const NewsCard: React.FC<NewsCardProps> = ({ news }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `há ${diffMins} min`;
    } else if (diffHours < 24) {
      return `há ${diffHours}h`;
    } else if (diffDays < 7) {
      return `há ${diffDays}d`;
    } else {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }
  };

  const getFlagEmoji = (countryCode: string) => {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  return (
    <article className="bg-white/5 rounded-lg overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-lg hover:shadow-white/5 group">
      {/* Imagem */}
      {news.image && (
        <div className="relative aspect-video overflow-hidden bg-black/20">
          <img
            src={news.image}
            alt={news.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-white/90">
              {getFlagEmoji(news.country)} {news.country.toUpperCase()}
            </span>
            <span className="px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-white/90">
              {news.lang.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-4 space-y-3">
        {/* Niche Badge */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs font-medium">
            {news.niches.name}
          </span>
          <span className="text-white/40 text-xs">
            {formatDate(news.publishedAt)}
          </span>
        </div>

        {/* Título */}
        <h3 className="text-white font-semibold text-lg line-clamp-2 group-hover:text-purple-300 transition-colors">
          {news.title}
        </h3>

        {/* Descrição */}
        <p className="text-white/60 text-sm line-clamp-3">
          {news.description}
        </p>

        {/* Botão de Leia Mais */}
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
        >
          Leia mais
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="group-hover:translate-x-1 transition-transform"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>
    </article>
  );
};

export default NewsCard;
