/**
 * Media utilities for detecting and handling different media types
 */

export const isVideoUrl = (url: string): boolean => 
  /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);

export const isImgurUrl = (url: string): boolean => 
  url.includes('i.imgur.com');

export const isImageUrl = (url: string): boolean =>
  /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
