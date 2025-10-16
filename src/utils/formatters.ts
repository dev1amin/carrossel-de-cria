import { formatDistanceToNow } from 'date-fns';

/**
 * Format a number for display (e.g., 1200 -> 1.2k)
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

/**
 * Format a timestamp to a relative time string (e.g., "2 days ago")
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format post text to display hashtags in a special style
 */
export function formatPostText(text: string): { parts: Array<{ text: string; isHashtag: boolean }> } {
  const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
  const parts: Array<{ text: string; isHashtag: boolean }> = [];
  
  let lastIndex = 0;
  let match;
  
  while ((match = hashtagRegex.exec(text)) !== null) {
    // Add the text before the hashtag
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isHashtag: false,
      });
    }
    
    // Add the hashtag
    parts.push({
      text: match[0],
      isHashtag: true,
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add any remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isHashtag: false,
    });
  }
  
  return { parts };
}

/**
 * Truncates text to a specified length
 */
export function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength) + '...';
}