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

  renderSlide(templateHtml: string, data: CarouselData, slideIndex: number): string {
    let rendered = templateHtml;
    const conteudo = data.conteudos[slideIndex];
    const mesano = this.getCurrentMonthYear();

    rendered = rendered.replace(/\{\{nome\}\}/g, data.dados_gerais.nome);
    rendered = rendered.replace(/\{\{arroba\}\}/g, data.dados_gerais.arroba);
    rendered = rendered.replace(/\{\{mesano\}\}/g, mesano);

    if (conteudo) {
      rendered = rendered.replace(/\{\{title\}\}/g, conteudo.title || '');
      rendered = rendered.replace(/\{\{subtitle\}\}/g, conteudo.subtitle || '');

      const bgUrl = conteudo.imagem_fundo || '';
      rendered = rendered.replace(/\{\{bg\}\}/g, bgUrl);

      rendered = rendered.replace(
        /background-image:\s*url\(['"]?\{\{bg\}\}['"]?\)/gi,
        `background-image: url('${bgUrl}')`
      );

      rendered = rendered.replace(/\{\{avatar\}\}/g, data.dados_gerais.foto_perfil);
      rendered = rendered.replace(
        /<img([^>]*class=["'][^"']*avatar[^"']*["'][^>]*)src=["'][^"']*["']/gi,
        `<img$1src="${data.dados_gerais.foto_perfil}"`
      );
    }

    return rendered;
  }

  renderAllSlides(templateSlides: string[], data: CarouselData): string[] {
    return templateSlides.map((slide, index) => this.renderSlide(slide, data, index));
  }
}

export const templateRenderer = new TemplateRenderer();
