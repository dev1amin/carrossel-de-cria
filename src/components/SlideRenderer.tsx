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
  slideIndex?: number;
  styles?: Record<string, any>; // Estilos salvos do carrossel
}

const SlideRenderer: React.FC<SlideRendererProps> = ({ 
  slideContent, 
  className = '', 
  slideIndex = 0,
  styles = {}
}) => {
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
    const slideStyles = styles[String(slideIndex)] || {};

    // Lista de seletores de fallback por campo
    const selectorListFor = (fieldName: string) => ([
      `#slide-${slideIndex}-${fieldName}`,
      `[data-element="${fieldName}"]`,
      `[data-field="${fieldName}"]`,
      `[data-slot="${fieldName}"]`,
      `[data-name="${fieldName}"]`,
      `[data-key="${fieldName}"]`,
      `[data-bind="${fieldName}"]`,
      `.slide-${slideIndex}-${fieldName}`,
      // Heurísticas por campo comum
      ...(fieldName === 'title' ? ['h1','h2','[class*="title"]'] : []),
      ...(fieldName === 'subtitle' ? ['[class*="sub"]','p'] : []),
    ]).join(', ');

    // 1) CSS com muitos fallbacks
    let customRules: string[] = [];
    Object.entries(slideStyles).forEach(([fieldName, fieldStyles]: [string, any]) => {
      const selector = selectorListFor(fieldName);
      const decls: string[] = [];
      
      // Estilos de texto
      if (fieldStyles.fontSize)   decls.push(`font-size:${fieldStyles.fontSize} !important;`);
      if (fieldStyles.fontWeight) decls.push(`font-weight:${fieldStyles.fontWeight} !important;`);
      if (fieldStyles.textAlign)  decls.push(`text-align:${fieldStyles.textAlign} !important;`);
      if (fieldStyles.color)      decls.push(`color:${fieldStyles.color} !important;`);
      
      if (decls.length) customRules.push(`${selector}{${decls.join('')}}`);
    });

    // Estilos de mídia (imagens/vídeos arrastados)
    const bgStyles = slideStyles['background'];
    if (bgStyles) {
      // Estilos para imagens
      if (bgStyles.objectPosition) {
        customRules.push(`img[data-editable="image"]{object-position:${bgStyles.objectPosition} !important;}`);
        customRules.push(`.img-crop-wrapper img{object-position:${bgStyles.objectPosition} !important;}`);
      }
      
      // Estilos para vídeos
      if (bgStyles.objectPosition) {
        customRules.push(`video[data-editable="video"]{object-position:${bgStyles.objectPosition} !important;}`);
        customRules.push(`.video-container video{object-position:${bgStyles.objectPosition} !important;}`);
      }
      
      // Estilos para backgrounds CSS
      if (bgStyles.backgroundPositionX || bgStyles.backgroundPositionY) {
        const bgPosDecls: string[] = [];
        if (bgStyles.backgroundPositionX) bgPosDecls.push(`background-position-x:${bgStyles.backgroundPositionX} !important;`);
        if (bgStyles.backgroundPositionY) bgPosDecls.push(`background-position-y:${bgStyles.backgroundPositionY} !important;`);
        
        // Aplica em múltiplos seletores que podem ter background
        customRules.push(`[data-editable="background"]{${bgPosDecls.join('')}}`);
        customRules.push(`body{${bgPosDecls.join('')}}`);
        customRules.push(`div[style*="background-image"]{${bgPosDecls.join('')}}`);
        customRules.push(`section[style*="background-image"]{${bgPosDecls.join('')}}`);
      }
    }

    // 2) Plano B JS (aplica inline se CSS não pegar)
    const runtimePatcher = `
(function(){
  const byField = ${JSON.stringify(slideStyles)};
  const pickNodes = (field) => {
    const selectorList = [
      '#slide-${slideIndex}-' + field,
      '[data-element="' + field + '"]',
      '[data-field="' + field + '"]',
      '[data-slot="' + field + '"]',
      '[data-name="' + field + '"]',
      '[data-key="' + field + '"]',
      '[data-bind="' + field + '"]',
      '.slide-${slideIndex}-' + field,
      ${slideIndex === 0 ? '...(field === "title" ? ["h1","h2","[class*=title]"] : []),' : ''}
      ${slideIndex === 0 ? '...(field === "subtitle" ? ["[class*=sub]","p"] : [])' : ''}
    ];
    const selectors = selectorList.flat().join(', ');
    return Array.from(document.querySelectorAll(selectors));
  };
  const applyInline = (el, styles) => {
    if (!el) return;
    if (styles.fontSize)   el.style.setProperty('font-size', styles.fontSize, 'important');
    if (styles.fontWeight) el.style.setProperty('font-weight', styles.fontWeight, 'important');
    if (styles.textAlign)  el.style.setProperty('text-align', styles.textAlign, 'important');
    if (styles.color)      el.style.setProperty('color', styles.color, 'important');
  };
  
  const applyMediaStyles = () => {
    const bgStyles = byField['background'];
    if (!bgStyles) return;
    
    // Aplica object-position em imagens
    if (bgStyles.objectPosition) {
      const imgs = document.querySelectorAll('img[data-editable="image"], .img-crop-wrapper img');
      imgs.forEach(img => {
        img.style.setProperty('object-position', bgStyles.objectPosition, 'important');
      });
      
      // Aplica object-position em vídeos
      const videos = document.querySelectorAll('video[data-editable="video"], .video-container video');
      videos.forEach(video => {
        video.style.setProperty('object-position', bgStyles.objectPosition, 'important');
      });
    }
    
    // Aplica background-position em backgrounds CSS
    if (bgStyles.backgroundPositionX || bgStyles.backgroundPositionY) {
      const bgElements = document.querySelectorAll('[data-editable="background"], body, div, section, header, main, figure, article');
      bgElements.forEach(el => {
        const cs = window.getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') {
          if (bgStyles.backgroundPositionX) {
            el.style.setProperty('background-position-x', bgStyles.backgroundPositionX, 'important');
          }
          if (bgStyles.backgroundPositionY) {
            el.style.setProperty('background-position-y', bgStyles.backgroundPositionY, 'important');
          }
        }
      });
    }
  };
  
  const run = () => {
    Object.entries(byField).forEach(([field, st]) => {
      if (field === 'background') {
        applyMediaStyles();
        return;
      }
      const nodes = pickNodes(field);
      if (!nodes.length) return;
      nodes.forEach(n => applyInline(n, st));
    });
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(run, 0);
  } else {
    document.addEventListener('DOMContentLoaded', run);
  }
  // Retry pós-assets assíncronos do template
  setTimeout(run, 300);
  setTimeout(run, 1000);
})();
`;

    // CSS base + regras customizadas
    const injectedCSS = `
      html,body{margin:0;padding:0;overflow:hidden !important;width:100%;height:100%}
      main.slide{zoom:.3}
      ${customRules.join('\n')}
    `;

    // Injeção robusta de CSS + script
    const injectAssets = (html: string, css: string, js: string) => {
      const styleTag = `<style>${css}</style>`;
      const scriptTag = `<script>${js}<\/script>`;
      if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${styleTag}${scriptTag}</head>`);
      if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${styleTag}${scriptTag}`);
      if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head><meta charset="utf-8">${styleTag}${scriptTag}</head>`);
      if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => `<head><meta charset="utf-8">${styleTag}${scriptTag}</head>${m}`);
      return `<!doctype html><html><head><meta charset="utf-8">${styleTag}${scriptTag}</head><body>${html}</body></html>`;
    };

    const htmlWithStyles = injectAssets(slideContent, injectedCSS, runtimePatcher);

    return (
      <iframe
        srcDoc={htmlWithStyles}
        className={className}
        style={{ width:'100%', height:'100%', border:'none', display:'block', overflow:'hidden' }}
        sandbox="allow-same-origin allow-scripts"
        title="Slide preview"
        scrolling="no"
      />
    );
  }

  // Se for JSON, renderiza como card visual
  const backgroundImage = slideData.imagem_fundo || slideData.imagem_fundo2 || slideData.imagem_fundo3;
  const isVideo = backgroundImage?.includes('.mp4');

  // Estado para controlar se a mídia carregou com sucesso
  const [mediaLoaded, setMediaLoaded] = React.useState(true);
  const [mediaError, setMediaError] = React.useState(false);

  const handleMediaError = () => {
    console.warn('Failed to load media:', backgroundImage);
    setMediaLoaded(false);
    setMediaError(true);
  };

  const handleMediaLoad = () => {
    setMediaLoaded(true);
    setMediaError(false);
  };

  return (
    <div className={`relative w-full h-full flex flex-col justify-end p-8 ${className}`}>
      {/* Background */}
      {backgroundImage && mediaLoaded && !mediaError && (
        <div className="absolute inset-0">
          {isVideo ? (
            <video
              src={backgroundImage}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              onError={handleMediaError}
              onLoadedData={handleMediaLoad}
            />
          ) : (
            <img
              src={backgroundImage}
              alt={slideData.title || 'Slide background'}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={handleMediaError}
              onLoad={handleMediaLoad}
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
            onError={(e) => {
              // Remove o thumbnail se falhar ao carregar
              const target = e.target as HTMLElement;
              const parent = target.parentElement;
              if (parent) parent.style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SlideRenderer;
