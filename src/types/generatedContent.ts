export interface GeneratedContentInfluencer {
  id: string;
  handle: string;
  display_name: string;
  profile_url: string;
}

export interface GeneratedContentSource {
  id: number;
  platform: string;
  product_type: string;
  published_at: string;
  text: string;
  content_url: string;
  like_count: number;
  play_count: number;
  comment_count: number;
  overall_score: number;
  influencer: GeneratedContentInfluencer;
}

export interface GeneratedContentResult {
  slides?: any[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface GeneratedContent {
  id: number;
  user_id: string;
  content_id: number;
  media_type: string;
  provider_type: string;
  result: GeneratedContentResult;
  created_at: string;
  status: 'pending' | 'completed' | 'failed';
  completed_at?: string;
  influencer_content: GeneratedContentSource;
}

export interface GeneratedContentPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GeneratedContentListResponse {
  success: boolean;
  data: GeneratedContent[];
  pagination: GeneratedContentPagination;
}

export interface GeneratedContentResponse {
  success: boolean;
  data: GeneratedContent;
}

export interface GeneratedContentStats {
  total: number;
  by_status: {
    completed: number;
    pending: number;
    failed: number;
  };
  by_media_type: Record<string, number>;
  by_provider: Record<string, number>;
}

export interface GeneratedContentStatsResponse {
  success: boolean;
  data: GeneratedContentStats;
}

export interface GeneratedContentQueryParams {
  page?: number;
  limit?: number;
  media_type?: string;
  provider_type?: string;
}

export interface DeleteGeneratedContentResponse {
  success: boolean;
  message: string;
}

export interface UpdateGeneratedContentRequest {
  result: GeneratedContentResult;
}

export interface UpdateGeneratedContentResponse {
  success: boolean;
  message: string;
  data: GeneratedContent;
}
