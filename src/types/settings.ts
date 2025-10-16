export interface Niche {
  id: string;
  name: string;
  price: number;
  access: boolean;
}

export interface UserSettings {
  id: string;
  email: string;
  name: string;
  business_name: string | null;
  business_website: string | null;
  business_instagram_username: string | null;
  current_feed_niche: string;
  niches: Niche[];
}