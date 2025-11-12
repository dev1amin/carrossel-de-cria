import { CarouselData, TemplateCompatibility } from '../../types/carousel';

/**
 * TemplateRenderer - Serviço de Renderização de Templates de Carrossel
 * 
 * REGRAS IMPORTANTES SOBRE TÍTULOS E SUBTÍTULOS:
 * ================================================
 * 
 * 1. ESTRUTURA DO TEMPLATE:
 *    - Cada template HTML deve ter APENAS UM placeholder {{title}}
 *    - Cada template HTML deve ter APENAS UM placeholder {{subtitle}} (opcional)
 *    - Os estilos (tamanho, peso, cor, etc) são DEFINIDOS NO TEMPLATE
 *    - NÃO podemos alterar ou adicionar estilos durante a renderização
 * 
 * 2. HIERARQUIA OBRIGATÓRIA:
 *    - {{title}} = TÍTULO PRINCIPAL (maior, bold, destaque)
 *    - {{subtitle}} = SUBTÍTULO/TEXTO SECUNDÁRIO (menor, normal, complementar)
 *    - Se houver dois textos, o primeiro DEVE ser title e o segundo DEVE ser subtitle
 *    - NUNCA pode haver dois elementos com estilo de título principal
 * 
 * 3. DADOS DO BACKEND:
 *    - conteudo.title = texto para o título principal
 *    - conteudo.subtitle = texto para o subtítulo (pode ser vazio)
 *    - Se title === subtitle, é um ERRO e será corrigido automaticamente
 * 
 * 4. O QUE ESTE SERVIÇO FAZ:
 *    - Substitui placeholders {{title}} e {{subtitle}} pelos dados recebidos
 *    - Valida se há duplicação de conteúdo (title === subtitle)
 *    - Valida se o template tem estrutura correta (placeholders únicos)
 *    - Substitui imagens e backgrounds
 *    - NÃO modifica estilos CSS do template
 * 
 * 5. O QUE ESTE SERVIÇO NÃO FAZ:
 *    - Não cria novos elementos de título
 *    - Não altera estilos de título/subtítulo
 *    - Não converte title em subtitle ou vice-versa
 *    - Não adiciona classes CSS aos elementos
 */
export class TemplateRenderer {
  private templateCompatibility: TemplateCompatibility = 'video-image';
  
  setTemplateCompatibility(compatibility: TemplateCompatibility): void {
    this.templateCompatibility = compatibility;
  }

  private getCurrentMonthYear(): string {
    const date = new Date();
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  private isVideoUrl(url: string): boolean {
    return url.toLowerCase().match(/\.(mp4|webm|ogg|mov)(\?|$)/) !== null;
  }

  private canUseVideo(): boolean {
    return this.templateCompatibility === 'video-image';
  }

  private replaceBackgroundImages(html: string, imageUrl: string): string {
    let result = html;

    // Se for vídeo mas o template não suporta, não aplica
    if (this.isVideoUrl(imageUrl) && !this.canUseVideo()) {
      console.warn('Template does not support video backgrounds. Video will not be applied.');
      return html;
    }

    if (this.isVideoUrl(imageUrl)) {
      result = result.replace(
        /background-image\s*:\s*url\s*\(\s*['"]?([^)'"]*)['"]?\s*\)/gi,
        (match, currentUrl) => {
          if (this.isImgurUrl(currentUrl)) {
            return match;
          }
          return `background-image: none`;
        }
      );

      result = result.replace(
        /background\s*:\s*url\s*\(\s*['"]?([^)'"]*)['"]?\s*\)/gi,
        (match, currentUrl) => {
          if (this.isImgurUrl(currentUrl)) {
            return match;
          }
          return `background: none`;
        }
      );

      result = result.replace(
        /<body([^>]*)>/i,
        (match, attrs) => {
          if (!match.includes('data-video-bg')) {
            return `<body${attrs} data-video-bg="${imageUrl}">`;
          }
          return match;
        }
      );
    } else {
      result = result.replace(
        /background-image\s*:\s*url\s*\(\s*['"]?([^)'"]*)['"]?\s*\)/gi,
        (match, currentUrl) => {
          if (this.isImgurUrl(currentUrl)) {
            return match;
          }
          return `background-image: url('${imageUrl}')`;
        }
      );

      result = result.replace(
        /background\s*:\s*url\s*\(\s*['"]?([^)'"]*)['"]?\s*\)/gi,
        (match, currentUrl) => {
          if (this.isImgurUrl(currentUrl)) {
            return match;
          }
          return `background: url('${imageUrl}')`;
        }
      );
    }

    return result;
  }

  private replaceAvatarImages(html: string, avatarUrl: string): string {
    let result = html;

    result = result.replace(
      /<img([^>]*class\s*=\s*["'][^"']*avatar[^"']*["'][^>]*)\bsrc\s*=\s*["'][^"']*["']/gi,
      `<img$1src="${avatarUrl}"`
    );

    result = result.replace(
      /<img([^>]*)\bsrc\s*=\s*["'][^"']*\{\{avatar\}\}[^"']*["']/gi,
      `<img$1src="${avatarUrl}"`
    );

    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private replaceTextBoxImages(html: string, imageUrl: string): string {
    let result = html;

    const textBoxRegex = /<div[^>]*class\s*=\s*["'][^"']*text-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

    result = result.replace(textBoxRegex, (match) => {
      if (this.isVideoUrl(imageUrl)) {
        return match.replace(
          /<img([^>]*)\bsrc\s*=\s*["'][^"']*["']/i,
          (imgMatch) => {
            const classMatch = imgMatch.match(/class\s*=\s*["']([^"']*)["']/);
            const styleMatch = imgMatch.match(/style\s*=\s*["']([^"']*)["']/);
            const className = classMatch ? classMatch[1] : '';
            const style = styleMatch ? styleMatch[1] : '';
            return `<video autoplay loop muted playsinline class="${className}" style="${style}" src="${imageUrl}"></video>`;
          }
        );
      } else {
        return match.replace(
          /<img([^>]*)\bsrc\s*=\s*["'][^"']*["']/i,
          `<img$1src="${imageUrl}"`
        );
      }
    });

    return result;
  }

  private replacePlaceholderImages(html: string, imageUrl: string): string {
    let result = html;

    const placeholderUrl = 'https://admin.cnnbrasil.com.br/wp-content/uploads/sites/12/2025/01/Santos-Neymar-braco-Cruzado.jpg';

    // Se for vídeo mas o template não suporta, não aplica
    if (this.isVideoUrl(imageUrl) && !this.canUseVideo()) {
      return html;
    }

    if (this.isVideoUrl(imageUrl)) {
      result = result.replace(
        new RegExp(placeholderUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        imageUrl
      );
      result = result.replace(
        /<img([^>]*)src="[^"]*Santos-Neymar[^"]*"/gi,
        (match) => {
          const classMatch = match.match(/class\s*=\s*["']([^"']*)["']/);
          const styleMatch = match.match(/style\s*=\s*["']([^"']*)["']/);
          const className = classMatch ? classMatch[1] : '';
          const style = styleMatch ? styleMatch[1] : '';
          return `<video autoplay loop muted playsinline class="${className}" style="${style}" src="${imageUrl}"></video>`;
        }
      );
    } else {
      result = result.replace(
        new RegExp(placeholderUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        imageUrl
      );
    }

    return result;
  }

  private isImgurUrl(url: string): boolean {
    return url.includes('i.imgur.com');
  }

  private replaceAllImages(html: string, imageUrl: string): string {
    let result = html;

    // Se for vídeo mas o template não suporta, não aplica
    if (this.isVideoUrl(imageUrl) && !this.canUseVideo()) {
      return html;
    }

    if (this.isVideoUrl(imageUrl)) {
      result = result.replace(
        /<img([^>]*)\bsrc\s*=\s*["']([^"']*)["']/gi,
        (match, _attrs, currentSrc) => {
          if (match.includes('avatar')) {
            return match;
          }

          if (this.isImgurUrl(currentSrc)) {
            const protectedMatch = match.replace(/<img/, '<img data-protected="true"');
            return protectedMatch;
          }

          const classMatch = match.match(/class\s*=\s*["']([^"']*)["']/);
          const styleMatch = match.match(/style\s*=\s*["']([^"']*)["']/);

          const className = classMatch ? classMatch[1] : '';
          const style = styleMatch ? styleMatch[1] : '';

          return `<div class="video-container" style="position: relative; display: inline-block; ${style}">
            <video class="${className}" style="width: 100%; border-radius: 24px; ${style}" src="${imageUrl}" data-video-src="${imageUrl}"></video>
            <button class="video-play-btn" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 3px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white" style="margin-left: 3px;">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>`;
        }
      );
    } else {
      result = result.replace(
        /<img([^>]*)\bsrc\s*=\s*["']([^"']*)["']/gi,
        (match, _attrs, currentSrc) => {
          if (match.includes('avatar')) {
            return match;
          }

          if (this.isImgurUrl(currentSrc)) {
            if (!match.includes('data-protected')) {
              return match.replace(/<img/, '<img data-protected="true"');
            }
            return match;
          }

          return match.replace(/src\s*=\s*["'][^"']*["']/, `src="${imageUrl}"`);
        }
      );
    }

    return result;
  }

  renderSlide(templateHtml: string, data: CarouselData, slideIndex: number): string {
    let rendered = templateHtml;
    const conteudo = data.conteudos[slideIndex];
    const mesano = this.getCurrentMonthYear();

    rendered = rendered.replace(/\{\{nome\}\}/g, data.dados_gerais.nome);
    rendered = rendered.replace(/\{\{arroba\}\}/g, data.dados_gerais.arroba);
    rendered = rendered.replace(/\{\{mesano\}\}/g, mesano);

    rendered = rendered.replace(/\{\{avatar\}\}/g, data.dados_gerais.foto_perfil);
    rendered = this.replaceAvatarImages(rendered, data.dados_gerais.foto_perfil);

    if (conteudo) {
      // VALIDAÇÃO: Detecta se title e subtitle são iguais (erro comum do backend)
      if (conteudo.title && conteudo.subtitle && conteudo.title === conteudo.subtitle) {
        console.warn(`⚠️ AVISO: Slide ${slideIndex} tem title e subtitle IDÊNTICOS! Isso cria duplicação de títulos.`);
        console.warn(`   Title: "${conteudo.title}"`);
        console.warn(`   Subtitle: "${conteudo.subtitle}"`);
        console.warn(`   💡 CORREÇÃO: Usando apenas o title e limpando subtitle para evitar duplicação.`);
        
        // Corrige automaticamente: usa só o title e limpa o subtitle
        conteudo.subtitle = '';
      }

      // IMPORTANTE: Substituir title e subtitle respeitando os placeholders EXATOS do template
      // O template define os estilos para cada placeholder:
      // - {{title}} deve estar em um elemento com estilo de TÍTULO (maior, bold)
      // - {{subtitle}} deve estar em um elemento com estilo de SUBTÍTULO (menor, normal)
      // NÃO podemos alterar ou adicionar classes/estilos - apenas substituir o conteúdo
      
      // Substitui APENAS os placeholders explícitos do template
      const titleText = conteudo.title || '';
      const subtitleText = conteudo.subtitle || '';
      
      rendered = rendered.replace(/\{\{title\}\}/g, titleText);
      rendered = rendered.replace(/\{\{subtitle\}\}/g, subtitleText);

      // VALIDAÇÃO: Verifica se o template tem estrutura correta
      const titleCount = (templateHtml.match(/\{\{title\}\}/g) || []).length;
      const subtitleCount = (templateHtml.match(/\{\{subtitle\}\}/g) || []).length;
      
      if (titleCount > 1) {
        console.error(`❌ ERRO NO TEMPLATE: Existem ${titleCount} placeholders {{title}}! Deve haver apenas 1.`);
      }
      if (subtitleCount > 1) {
        console.error(`❌ ERRO NO TEMPLATE: Existem ${subtitleCount} placeholders {{subtitle}}! Deve haver apenas 1.`);
      }

      // Seleciona a URL de background apropriada
      let bgUrl = conteudo.imagem_fundo || '';
      
      // Se o background é um vídeo mas o template não suporta vídeos, usa alternativa
      if (bgUrl && this.isVideoUrl(bgUrl) && !this.canUseVideo()) {
        const alternatives = [
          conteudo.imagem_fundo2,
          conteudo.imagem_fundo3
        ].filter((url): url is string => !!url && !this.isVideoUrl(url));
        
        if (alternatives.length > 0) {
          bgUrl = alternatives[0];
          console.log(`🔄 Template doesn't support videos. Using alternative image: ${bgUrl}`);
        } else {
          console.warn(`⚠️ No valid image alternative found for video: ${conteudo.imagem_fundo}`);
          bgUrl = ''; // Não aplica nada se não houver alternativa
        }
      }
      
      rendered = rendered.replace(/\{\{bg\}\}/g, bgUrl);
      rendered = this.replaceBackgroundImages(rendered, bgUrl);
      rendered = this.replaceAllImages(rendered, bgUrl);
      rendered = this.replacePlaceholderImages(rendered, bgUrl);
    }

    return rendered;
  }

  renderAllSlides(templateSlides: string[], data: CarouselData): string[] {
    // Se não há conteúdos, retorna os templates vazios
    if (!data.conteudos || data.conteudos.length === 0) {
      return templateSlides;
    }

    // Renderiza cada conteúdo usando os templates disponíveis
    // Se houver mais conteúdos que templates, reutiliza templates em ciclo
    return data.conteudos.map((_, index) => {
      const templateIndex = index % templateSlides.length;
      return this.renderSlide(templateSlides[templateIndex], data, index);
    });
  }
}

export const templateRenderer = new TemplateRenderer();
