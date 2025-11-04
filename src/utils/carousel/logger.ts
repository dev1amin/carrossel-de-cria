/**
 * Logger utilities for Carousel Viewer
 */

const LOG = true;

export const log = (...a: any[]) => { 
  if (LOG) console.log('[CV]', ...a); 
};

export const logClick = (...a: any[]) => { 
  if (LOG) console.log('[CV-CLICK]', ...a); 
};

export const logDrag = (...a: any[]) => { 
  if (LOG) console.log('[CV-DRAG]', ...a); 
};

export const logBind = (...a: any[]) => { 
  if (LOG) console.log('[CV-BIND]', ...a); 
};
