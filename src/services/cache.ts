interface CachedData<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

const CACHE_KEYS = {
  FEED: 'feed_data_cache',
  SETTINGS: 'settings_data_cache',
  GALLERY: 'gallery_data_cache'
} as const;

const CACHE_EXPIRY = {
  FEED: 2 * 60 * 1000,     // 2 minutos para o feed
  SETTINGS: 5 * 60 * 1000, // 5 minutos para as configurações
  GALLERY: 60 * 60 * 1000  // 1 hora para a galeria
} as const;

const DEFAULT_EXPIRY = 5 * 60 * 1000; // 5 minutos em milissegundos (fallback)

export class CacheService {
  static getExpiryTime(key: string): number {
    return key in CACHE_EXPIRY 
      ? CACHE_EXPIRY[key as keyof typeof CACHE_EXPIRY] 
      : DEFAULT_EXPIRY;
  }
  static setItem<T>(key: string, data: T, expiresIn?: number): void {
    const expiry = expiresIn || CacheService.getExpiryTime(key);
    const cachedData: CachedData<T> = {
      data,
      timestamp: Date.now(),
      expiresIn: expiry
    };
    localStorage.setItem(key, JSON.stringify(cachedData));
  }

  static getItem<T>(key: string): T | null {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    try {
      const parsedCache: CachedData<T> = JSON.parse(cached);
      const now = Date.now();
      const isExpired = now - parsedCache.timestamp > parsedCache.expiresIn;

      if (isExpired) {
        localStorage.removeItem(key);
        return null;
      }

      return parsedCache.data;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  static clearItem(key: string): void {
    localStorage.removeItem(key);
  }
}

export { CACHE_KEYS };