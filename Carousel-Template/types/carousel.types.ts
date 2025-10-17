export interface CarouselData {
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
    imagem_fundo4?: string;
    imagem_fundo5?: string;
    imagem_fundo6?: string;
  }>;
}

export interface CarouselResponse extends CarouselData {}

export type ElementType = 'title' | 'subtitle' | 'background' | null;

export interface ElementStyles {
  fontSize: string;
  fontWeight: string;
  textAlign: string;
  color: string;
}
