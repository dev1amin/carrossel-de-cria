export interface NewsItem {
  id: string;
  niche_id: string;
  publishedAt: string;
  title: string;
  description: string;
  content: string;
  url: string;
  image: string;
  country: string;
  lang: string;
  recommend?: boolean; // Recomendado pela IA
  niches: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface NewsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NewsFilters {
  countries: string[];
  languages: string[];
}

export interface NewsResponse {
  success: boolean;
  data: NewsItem[];
  pagination: NewsPagination;
  filters: NewsFilters;
}

export interface NewsQueryParams {
  page?: number;
  limit?: number;
  nicheId?: string;
  country?: string;
  lang?: string;
}
