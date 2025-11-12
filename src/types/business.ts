export interface Business {
  id: string;
  user_id: string;
  name?: string;
  website?: string;
  instagram_username?: string;
  main_objective?: string;
  mission_short?: string;
  tone_formality: 'formal' | 'neutral' | 'informal';
  tone_emotion: 'rational' | 'balanced' | 'emotional';
  tone_rhythm: 'direct' | 'fluid' | 'narrative';
  keywords_must: string[];
  keywords_avoid: string[];
  language_code: 'pt' | 'en' | 'es' | 'fr';
  writing_notes?: string;
  updated_at: string;
}

export interface CreateBusinessRequest {
  name?: string;
  website?: string;
  instagram_username?: string;
  main_objective?: string;
  mission_short?: string;
  tone_formality?: 'formal' | 'neutral' | 'informal';
  tone_emotion?: 'rational' | 'balanced' | 'emotional';
  tone_rhythm?: 'direct' | 'fluid' | 'narrative';
  keywords_must?: string[];
  keywords_avoid?: string[];
  language_code?: 'pt' | 'en' | 'es' | 'fr';
  writing_notes?: string;
}

export interface BusinessResponse {
  success: boolean;
  message: string;
  data: Business;
}

export interface BusinessListResponse {
  success: boolean;
  data: Business[];
}

export interface BusinessValidationError {
  field: string;
  message: string;
}

export interface BusinessErrorResponse {
  success: false;
  message: string;
  errors?: BusinessValidationError[];
}

export interface FormQuestion {
  key: keyof CreateBusinessRequest;
  question: string;
  type: 'text' | 'select' | 'array_text';
  options: Array<{ label: string; value: string }>;
}
