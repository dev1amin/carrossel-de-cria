export type QueueStatus = 'generating' | 'completed' | 'error';

export interface GenerationQueueItem {
  id: string;
  postCode: string;
  templateId: string;
  templateName: string;
  status: QueueStatus;
  createdAt: number;
  completedAt?: number;
  errorMessage?: string;
  slides?: string[];
  carouselData?: any;
}
