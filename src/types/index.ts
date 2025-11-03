export interface Post {
  id?: number; // ID do post da API
  code: string;
  text: string;
  taken_at: number;
  username: string;
  image_url: string;
  likeScore: number;
  playScore: number;
  video_url: string | null;
  like_count: number;
  media_type: number; // 1 = image, 2 = video
  play_count: number;
  commentScore: number;
  overallScore: number;
  recencyScore: number;
  reshareScore: number;
  comment_count: number;
  reshare_count: number;
}

export type SortOption = 'latest' | 'popular' | 'likes' | 'comments' | 'shares';

// Re-export types from other modules
export * from './generatedContent';