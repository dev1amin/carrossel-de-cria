import React from 'react';

interface SlideData {
  title?: string;
  subtitle?: string;
  imagem_fundo?: string;
  imagem_fundo2?: string;
  imagem_fundo3?: string;
  thumbnail_url?: string;
  [key: string]: any;
}

interface SlideRendererProps {
  slideContent: string;
  className?: string;
}

const SlideRenderer: React.FC<SlideRendererProps> = ({ slideContent, className = '' }) => {
  // Tenta fazer parse do JSON
  let slideData: SlideData | null = null;
  let isHTML = false;

  try {
    // Tenta parsear como JSON
    slideData = JSON.parse(slideContent);
  } catch {
    // Se falhar, é HTML
    isHTML = true;
  }

  // Se for HTML, renderiza com iframe para isolamento TOTAL
  if (isHTML || !slideData) {
    // Injeta estilos para zoom e remover overflow
    const htmlWithZoom = slideContent.replace(
      '</head>',
      `<style>
        main.slide { zoom: 0.3; }
        html, body { 
          margin: 0; 
          padding: 0; 
          overflow: hidden !important;
          width: 100%;
          height: 100%;
        }
      </style></head>`
    );

    // Log para debug: confirma que cada slide está isolado
    console.log('🎨 Renderizando slide HTML com iframe (isolado)');

    return (
      <iframe
        srcDoc={htmlWithZoom}
        className={className}
        style={{ 
          width: '100%', 
          height: '100%',
          border: 'none',
          display: 'block',
          overflow: 'hidden'
        }}
        sandbox="allow-same-origin allow-scripts"
        title="Slide preview"
        scrolling="no"
      />
    );
  }

  // Se for JSON, renderiza como card visual
  const backgroundImage = slideData.imagem_fundo || slideData.imagem_fundo2 || slideData.imagem_fundo3;
  const isVideo = backgroundImage?.includes('.mp4');

  return (
    <div className={`relative w-full h-full flex flex-col justify-end p-8 ${className}`}>
      {/* Background */}
      {backgroundImage && (
        <div className="absolute inset-0">
          {isVideo ? (
            <video
              src={backgroundImage}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img
              src={backgroundImage}
              alt={slideData.title || 'Slide background'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {/* Overlay escuro para melhor legibilidade */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>
      )}

      {/* Conteúdo */}
      <div className="relative z-10 text-white">
        {slideData.title && (
          <h2 className="text-3xl font-bold mb-3 leading-tight drop-shadow-lg">
            {slideData.title}
          </h2>
        )}
        {slideData.subtitle && (
          <p className="text-lg opacity-90 leading-relaxed drop-shadow-md">
            {slideData.subtitle}
          </p>
        )}
      </div>

      {/* Thumbnail (se existir e não for o background principal) */}
      {slideData.thumbnail_url && slideData.thumbnail_url !== backgroundImage && (
        <div className="absolute top-4 right-4 w-20 h-20 rounded-lg overflow-hidden border-2 border-white/20">
          <img
            src={slideData.thumbnail_url}
            alt="Thumbnail"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
};

export default SlideRenderer;
