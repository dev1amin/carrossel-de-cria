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

  private replaceBackgroundImages(html: string, imageUrl: string): string {
    let result = html;

    result = result.replace(
      /background-image\s*:\s*url\s*\(\s*['"]?[^)'"]*['"]?\s*\)/gi,
      `background-image: url('${imageUrl}')`
    );

    result = result.replace(
      /background\s*:\s*url\s*\(\s*['"]?[^)'"]*['"]?\s*\)/gi,
      `background: url('${imageUrl}')`
    );

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
      return match.replace(
        /<img([^>]*)\bsrc\s*=\s*["'][^"']*["']/i,
        `<img$1src="${imageUrl}"`
      );
    });

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
    }

    return rendered;
  }

  renderAllSlides(templateSlides: string[], data: CarouselData): string[] {
    return templateSlides.map((slide, index) => this.renderSlide(slide, data, index));
  }
}

export const templateRenderer = new TemplateRenderer();
