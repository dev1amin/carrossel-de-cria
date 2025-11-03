import React from 'react';
import type { NewsFilters as NewsFiltersType } from '../types/news';

interface NewsFiltersProps {
  filters: NewsFiltersType;
  selectedCountry: string;
  selectedLanguage: string;
  onCountryChange: (country: string) => void;
  onLanguageChange: (language: string) => void;
}

const NewsFilters: React.FC<NewsFiltersProps> = ({
  filters,
  selectedCountry,
  selectedLanguage,
  onCountryChange,
  onLanguageChange,
}) => {
  const getFlagEmoji = (countryCode: string) => {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  const getLanguageName = (langCode: string) => {
    const languages: Record<string, string> = {
      pt: 'Português',
      en: 'English',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      it: 'Italiano',
    };
    return languages[langCode] || langCode.toUpperCase();
  };

  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Filtro de País */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-white/60 text-sm mb-2">País</label>
        <select
          value={selectedCountry}
          onChange={(e) => onCountryChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">Todos os países</option>
          {filters.countries.map((country) => (
            <option key={country} value={country} className="bg-black">
              {getFlagEmoji(country)} {country.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Filtro de Idioma */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-white/60 text-sm mb-2">Idioma</label>
        <select
          value={selectedLanguage}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">Todos os idiomas</option>
          {filters.languages.map((lang) => (
            <option key={lang} value={lang} className="bg-black">
              {getLanguageName(lang)}
            </option>
          ))}
        </select>
      </div>

      {/* Botão de Limpar Filtros */}
      {(selectedCountry || selectedLanguage) && (
        <button
          onClick={() => {
            onCountryChange('');
            onLanguageChange('');
          }}
          className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/80 hover:text-white transition-colors"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
};

export default NewsFilters;
