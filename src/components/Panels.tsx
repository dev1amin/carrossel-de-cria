// src/components/CarouselViewer/Panels.tsx
import React from "react";
import {
  Layers as LayersIcon,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Type,
  Upload,
  Search,
  Play,
} from "lucide-react";
import type { CarouselData, ElementType, ElementStyles } from "../../types";

/* ===================== LayersPanel (esquerda) ===================== */
type LayersPanelProps = {
  slides: string[];
  carouselData: CarouselData;
  expandedLayers: Set<number>;
  focusedSlide: number;
  selectedElement: { slideIndex: number; element: ElementType };

  onToggleLayer: (index: number) => void;
  onSlideClick: (index: number) => void;
  onSelectElement: (index: number, element: ElementType) => void;
};

export const LayersPanel: React.FC<LayersPanelProps> = ({
  slides,
  carouselData,
  expandedLayers,
  focusedSlide,
  selectedElement,
  onToggleLayer,
  onSlideClick,
  onSelectElement,
}) => {
  return (
    <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col">
      <div className="h-14 border-b border-neutral-800 flex items-center px-4">
        <LayersIcon className="w-4 h-4 text-neutral-400 mr-2" />
        <h3 className="text-white font-medium text-sm">Layers</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {slides.map((_, index) => {
          const conteudo = carouselData.conteudos[index];
          const isExpanded = expandedLayers.has(index);
          const isFocused = focusedSlide === index;

          return (
            <div
              key={index}
              className={`border-b border-neutral-800 ${
                isFocused ? "bg-neutral-900" : ""
              }`}
            >
              <button
                onClick={() => {
                  onToggleLayer(index);
                  onSlideClick(index);
                }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-900 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-neutral-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-neutral-500" />
                  )}
                  <LayersIcon className="w-3 h-3 text-blue-400" />
                  <span className="text-white text-sm">Slide {index + 1}</span>
                </div>
              </button>

              {isExpanded && conteudo && (
                <div className="ml-3 border-l border-neutral-800">
                  <button
                    onClick={() => onSelectElement(index, "background")}
                    className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                      selectedElement.slideIndex === index &&
                      selectedElement.element === "background"
                        ? "bg-neutral-800"
                        : ""
                    }`}
                  >
                    <ImageIcon className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-300 text-xs">Background</span>
                  </button>

                  <button
                    onClick={() => onSelectElement(index, "title")}
                    className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                      selectedElement.slideIndex === index &&
                      selectedElement.element === "title"
                        ? "bg-neutral-800"
                        : ""
                    }`}
                  >
                    <Type className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-300 text-xs">Title</span>
                  </button>

                  {conteudo.subtitle && (
                    <button
                      onClick={() => onSelectElement(index, "subtitle")}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index &&
                        selectedElement.element === "subtitle"
                          ? "bg-neutral-800"
                          : ""
                      }`}
                    >
                      <Type className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">
                        Subtitle
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ===================== PropertiesPanel (direita) ===================== */
type PropertiesPanelProps = {
  selectedElement: { slideIndex: number; element: ElementType };
  isLoadingProperties: boolean;

  carouselData: CarouselData;

  editedContent: Record<string, any>;
  elementStyles: Record<string, ElementStyles>;

  getElementStyle: (slideIndex: number, element: ElementType) => ElementStyles;
  getEditedValue: (slideIndex: number, field: string, def: any) => any;

  updateEditedValue: (slideIndex: number, field: string, value: any) => void;
  updateElementStyle: (
    slideIndex: number,
    element: ElementType,
    prop: keyof ElementStyles,
    value: string
  ) => void;

  onOpenEditModal: () => void;
  onBackgroundChange: (slideIndex: number, imageUrl: string) => void;

  searchKeyword: string;
  setSearchKeyword: (v: string) => void;
  onSearchImages: () => void;
  isSearching: boolean;
  searchResults: string[];

  onUploadImage: (slideIndex: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadedImages: Record<number, string>;

  isVideoUrl: (u: string) => boolean;
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedElement,
  isLoadingProperties,
  carouselData,
  editedContent,
  elementStyles,
  getElementStyle,
  getEditedValue,
  updateEditedValue,
  updateElementStyle,
  onOpenEditModal,
  onBackgroundChange,
  searchKeyword,
  setSearchKeyword,
  onSearchImages,
  isSearching,
  searchResults,
  onUploadImage,
  uploadedImages,
  isVideoUrl,
}) => {
  const hasSelection = selectedElement.element !== null;

  const renderTextControls = (kind: "title" | "subtitle") => {
    const idx = selectedElement.slideIndex;
    const base = carouselData.conteudos[idx]?.[kind] || "";
    const value =
      editedContent[`${idx}-${kind}`] !== undefined
        ? editedContent[`${idx}-${kind}`]
        : base;

    return (
      <>
        <div>
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Text Content
          </label>
          <textarea
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
            rows={kind === "title" ? 4 : 3}
            value={value}
            onChange={(e) => updateEditedValue(idx, kind, e.target.value)}
          />
        </div>

        <div>
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Font Size
          </label>
          <input
            type="text"
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={getElementStyle(idx, kind).fontSize}
            onChange={(e) => updateElementStyle(idx, kind, "fontSize", e.target.value)}
            placeholder="e.g. 24px, 1.5rem"
          />
        </div>

        <div>
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Font Weight
          </label>
          <select
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={getElementStyle(idx, kind).fontWeight}
            onChange={(e) => updateElementStyle(idx, kind, "fontWeight", e.target.value)}
          >
            <option value="300">Light (300)</option>
            <option value="400">Regular (400)</option>
            <option value="500">Medium (500)</option>
            <option value="600">Semi Bold (600)</option>
            <option value="700">Bold (700)</option>
            <option value="800">Extra Bold (800)</option>
            <option value="900">Black (900)</option>
          </select>
        </div>

        <div>
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Text Align
          </label>
          <select
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={getElementStyle(idx, kind).textAlign}
            onChange={(e) => updateElementStyle(idx, kind, "textAlign", e.target.value)}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="justify">Justify</option>
          </select>
        </div>

        <div>
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Color
          </label>
          <div className="flex space-x-2">
            <input
              type="color"
              className="w-12 h-10 bg-neutral-900 border border-neutral-800 rounded cursor-pointer"
              value={getElementStyle(idx, kind).color}
              onChange={(e) => updateElementStyle(idx, kind, "color", e.target.value)}
            />
            <input
              type="text"
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              value={getElementStyle(idx, kind).color}
              onChange={(e) => updateElementStyle(idx, kind, "color", e.target.value)}
              placeholder="#FFFFFF"
            />
          </div>
        </div>
      </>
    );
  };

  const renderBackgroundControls = () => {
    const idx = selectedElement.slideIndex;
    const conteudo = carouselData.conteudos[idx];
    const currentBg =
      getEditedValue(idx, "background", conteudo?.imagem_fundo || "");

    const makeThumb = (label: string, url: string, isVideo?: boolean) => (
      <div
        className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
          currentBg === url ? "border-blue-500" : "border-neutral-800 hover:border-blue-400"
        }`}
        onClick={() => onBackgroundChange(idx, url)}
      >
        <div className="text-neutral-400 text-xs mb-1 flex items-center justify-between">
          <span>{label}</span>
          {isVideo && <Play className="w-3 h-3" />}
        </div>
        <div className="relative">
          <img
            src={url}
            alt={label}
            className="w-full h-24 object-cover rounded"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
              <Play className="w-8 h-8 text-white" fill="white" />
            </div>
          )}
        </div>
      </div>
    );

    return (
      <>
        <div className="flex items-center justify-between">
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Background
          </label>
          <button
            onClick={() => {
              console.log("[CV][UI] Edit click", { selectedElement });
              onOpenEditModal();
            }}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
            title="Editar enquadramento"
          >
            Editar
          </button>
        </div>

        <div className="space-y-2">
          {conteudo?.imagem_fundo && makeThumb(
            isVideoUrl(conteudo.imagem_fundo) ? "Video 1" : "Image 1",
            isVideoUrl(conteudo.imagem_fundo) && conteudo.thumbnail_url
              ? conteudo.thumbnail_url
              : conteudo.imagem_fundo,
            isVideoUrl(conteudo.imagem_fundo)
          )}

          {conteudo?.imagem_fundo2 &&
            makeThumb("Image 2", conteudo.imagem_fundo2)}

          {conteudo?.imagem_fundo3 &&
            makeThumb("Image 3", conteudo.imagem_fundo3)}

          {uploadedImages[idx] &&
            makeThumb("Image 4 (Uploaded)", uploadedImages[idx])}
        </div>

        {/* Search */}
        <div className="mt-3">
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Search Images
          </label>
          <div className="relative">
            <input
              type="text"
              className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Search for images..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchImages();
              }}
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <button
              onClick={onSearchImages}
              disabled={isSearching || !searchKeyword.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs transition-colors"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((imageUrl, i) => (
                <div
                  key={i}
                  className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                    currentBg === imageUrl
                      ? "border-blue-500"
                      : "border-neutral-800 hover:border-blue-400"
                  }`}
                  onClick={() => onBackgroundChange(idx, imageUrl)}
                >
                  <div className="text-neutral-400 text-xs mb-1">
                    Search Result {i + 1}
                  </div>
                  <img
                    src={imageUrl}
                    alt={`Search result ${i + 1}`}
                    className="w-full h-24 object-cover rounded"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="mt-3">
          <label className="text-neutral-400 text-xs mb-2 block font-medium">
            Upload Image (Image 4)
          </label>
          <label className="flex items-center justify-center w-full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
            <div className="flex flex-col items-center">
              <Upload className="w-6 h-6 text-neutral-500 mb-1" />
              <span className="text-neutral-500 text-xs">Click to upload</span>
            </div>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => onUploadImage(idx, e)}
            />
          </label>
        </div>
      </>
    );
  };

  return (
    <div className="w-80 bg-neutral-950 border-l border-neutral-800 flex flex-col">
      <div className="h-14 border-b border-neutral-800 flex items-center px-4">
        <h3 className="text-white font-medium text-sm">Properties</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!hasSelection ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4">
              <Type className="w-8 h-8 text-neutral-700" />
            </div>
            <h4 className="text-white font-medium mb-2">No Element Selected</h4>
            <p className="text-neutral-500 text-sm mb-1">
              Click on an element in the preview
            </p>
            <p className="text-neutral-500 text-sm">to edit its properties</p>
            <div className="mt-6 space-y-2 text-xs text-neutral-600">
              <p>• Single click to select</p>
              <p>• Double click text to edit inline</p>
              <p>• Press ESC to deselect</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isLoadingProperties ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : selectedElement.element === "background" ? (
              renderBackgroundControls()
            ) : selectedElement.element === "title" ? (
              renderTextControls("title")
            ) : selectedElement.element === "subtitle" ? (
              renderTextControls("subtitle")
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};