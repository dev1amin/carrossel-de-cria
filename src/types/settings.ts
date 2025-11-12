export interface Niche {
  id: string;
  name: string;
  slug: string;
  segment_id: string;
}

export interface Influencer {
  influencer_id: string;
  instagram_username: string;
  display_name: string;
  added_at: string;
}

export interface Business {
  id: string;
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

export interface UserSettings {
  id: string;
  email: string;
  name: string;
  created_at: string;
  selected_business_id: string;
  business: Business;
  niche: string | null;
  niches: string[];
  influencers: Influencer[];
}