import React from 'react';
import { X, ZoomIn, ZoomOut, Download, Save } from 'lucide-react';

interface TopBarProps {
  slidesCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDownload: () => void;
  onClose: () => void;
  onSave?: () => void;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  slidesCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onDownload,
  onClose,
  onSave,
  hasUnsavedChanges = false,
  isSaving = false,
}) => {
  return (
    <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center space-x-4">
        <h2 className="text-white font-semibold">Carousel Editor</h2>
        <div className="text-neutral-500 text-sm">{slidesCount} slides</div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onZoomOut}
          className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={onZoomIn}
          className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-neutral-800 mx-2" />
        {onSave && (
          <button
            onClick={onSave}
            disabled={!hasUnsavedChanges || isSaving}
            className={`px-4 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm font-medium ${
              hasUnsavedChanges && !isSaving
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }`}
            title={hasUnsavedChanges ? 'Save Changes' : 'No changes to save'}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
          </button>
        )}
        <button
          onClick={onDownload}
          className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm"
          title="Download All Slides"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </button>
        <button
          onClick={onClose}
          className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
