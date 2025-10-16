interface CarouselData {
  dados_gerais: {
    nome: string;
    arroba: string;
    foto_perfil: string;
    template: string;
  };
  conteudos: Array<{
    title: string;
    subtitle?: string;
    imagem_fundo: string;
    thumbnail_url?: string;
    imagem_fundo2?: string;
    imagem_fundo3?: string;
  }>;
}

export class TemplateRenderer {
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

  private replaceBackgroundImages(html: string, imageUrl: string): string {
    let result = html;

    if (this.isVideoUrl(imageUrl)) {
      result = result.replace(
        /background-image\s*:\s*url\s*\(\s*['"]?[^)'"]*['"]?\s*\)/gi,
        `background-image: none`
      );

      result = result.replace(
        /background\s*:\s*url\s*\(\s*['"]?[^)'"]*['"]?\s*\)/gi,
        `background: none`
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
        /background-image\s*:\s*url\s*\(\s*['"]?[^)'"]*['"]?\s*\)/gi,
        `background-image: url('${imageUrl}')`
      );

      result = result.replace(
        /background\s*:\s*url\s*\(\s*['"]?[^)'"]*['"]?\s*\)/gi,
        `background: url('${imageUrl}')`
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

  private replaceTextBoxImages(html: string, imageUrl: string): string {
    let result = html;

    const textBoxRegex = /<div[^>]*class\s*=\s*["'][^"']*text-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

    result = result.replace(textBoxRegex, (match) => {
      if (this.isVideoUrl(imageUrl)) {
        return match.replace(
          /<img([^>]*)\bsrc\s*=\s*["'][^"']*["']/i,
          (imgMatch, attrs) => {
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

    if (this.isVideoUrl(imageUrl)) {
      result = result.replace(
        new RegExp(placeholderUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        imageUrl
      );
      result = result.replace(
        /<img([^>]*)src="[^"]*Santos-Neymar[^"]*"/gi,
        (match, attrs) => {
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
      rendered = rendered.replace(/\{\{title\}\}/g, conteudo.title || '');
      rendered = rendered.replace(/\{\{subtitle\}\}/g, conteudo.subtitle || '');

      const bgUrl = conteudo.imagem_fundo || '';
      rendered = rendered.replace(/\{\{bg\}\}/g, bgUrl);
      rendered = this.replaceBackgroundImages(rendered, bgUrl);
      rendered = this.replaceTextBoxImages(rendered, bgUrl);
      rendered = this.replacePlaceholderImages(rendered, bgUrl);
    }

    return rendered;
  }

  renderAllSlides(templateSlides: string[], data: CarouselData): string[] {
    return templateSlides.map((slide, index) => this.renderSlide(slide, data, index));
  }
}

export const templateRenderer = new TemplateRenderer();
