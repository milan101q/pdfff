import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileUp, 
  Download, 
  Type, 
  Image as ImageIcon, 
  MousePointer2, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Minus,
  Trash2,
  Layers,
  Settings2,
  FileText,
  Undo2,
  Redo2,
  ScanText,
  WholeWord,
  Copy,
  Clipboard
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { PDFEngine, Annotation, PDFPageInfo, TextItem } from '@/src/lib/pdf-engine';
import { cn } from '@/lib/utils';

const engine = new PDFEngine();

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'image'>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<PDFPageInfo | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<Annotation | null>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [detectionMode, setDetectionMode] = useState<'word' | 'sentence'>('word');
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setIsLoading(true);
      setLoadError(null);
      setAnnotations([]);
      setCurrentPage(0);
      
      try {
        const { pageCount } = await engine.load(selectedFile);
        if (pageCount === 0) {
          throw new Error("The selected PDF has no pages or is invalid.");
        }
        setPageCount(pageCount);
      } catch (error) {
        console.error("Error loading PDF:", error);
        setLoadError(error instanceof Error ? error.message : "Failed to load PDF. Please try another file.");
        setFile(null);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const pushToHistory = (newAnnotations: Annotation[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newAnnotations)));
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevAnnotations = history[historyIndex - 1];
      setAnnotations(JSON.parse(JSON.stringify(prevAnnotations)));
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextAnnotations = history[historyIndex + 1];
      setAnnotations(JSON.parse(JSON.stringify(nextAnnotations)));
      setHistoryIndex(historyIndex + 1);
    }
  };

  const updateAnnotationsWithHistory = (newAnnotations: Annotation[]) => {
    setAnnotations(newAnnotations);
    pushToHistory(newAnnotations);
  };

  const copy = useCallback(() => {
    const selected = annotations.find(a => a.id === selectedAnnotationId);
    if (selected) {
      setClipboard(JSON.parse(JSON.stringify(selected)));
    }
  }, [annotations, selectedAnnotationId]);

  const paste = useCallback(() => {
    if (clipboard) {
      const newAnnotation: Annotation = {
        ...JSON.parse(JSON.stringify(clipboard)),
        id: Math.random().toString(36).substr(2, 9),
        pageIndex: currentPage,
        x: clipboard.x + 20,
        y: clipboard.y + 20
      };
      updateAnnotationsWithHistory([...annotations, newAnnotation]);
      setSelectedAnnotationId(newAnnotation.id);
    }
  }, [clipboard, annotations, currentPage, updateAnnotationsWithHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        copy();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        paste();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnotationId && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
          deleteAnnotation(selectedAnnotationId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationId, undo, redo, copy, paste]);

  const renderCurrentPage = useCallback(async () => {
    if (!file || isRendering) return;
    setIsRendering(true);
    try {
      const { canvas, info, textItems } = await engine.renderPage(currentPage, scale, detectionMode);
      setPageInfo(info);
      setTextItems(textItems);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        canvasRef.current.width = canvas.width;
        canvasRef.current.height = canvas.height;
        ctx?.drawImage(canvas, 0, 0);
      }
    } finally {
      setIsRendering(false);
    }
  }, [file, currentPage, scale, detectionMode]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    
    if (activeTool === 'select') {
      setSelectedAnnotationId(null);
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (activeTool === 'text') {
      const newAnnotation: Annotation = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'text',
        pageIndex: currentPage,
        x,
        y,
        content: '',
        fontSize: 16,
        color: '#E2E2E2'
      };
      updateAnnotationsWithHistory([...annotations, newAnnotation]);
      setSelectedAnnotationId(newAnnotation.id);
      setActiveTool('select');
    } else if (activeTool === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const newAnnotation: Annotation = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'image',
              pageIndex: currentPage,
              x,
              y,
              dataUrl,
              width: 150,
              height: 150
            };
            setAnnotations([...annotations, newAnnotation]);
            setSelectedAnnotationId(newAnnotation.id);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      setActiveTool('select');
    }
  };

  const handleTextItemClick = (item: TextItem) => {
    console.log("Text item clicked:", item.str, item.x, item.y);
    // Check if an edit already exists for this item
    const existingEdit = annotations.find(a => a.type === 'edit' && a.x === item.x && a.y === item.y && a.pageIndex === currentPage);
    
    if (existingEdit) {
      setSelectedAnnotationId(existingEdit.id);
    } else {
      const newEdit: Annotation = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'edit',
        pageIndex: currentPage,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        content: item.str,
        originalText: item.str,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        color: '#000000'
      };
      updateAnnotationsWithHistory([...annotations, newEdit]);
      setSelectedAnnotationId(newEdit.id);
    }
    setActiveTool('select');
  };

  const handleDownload = async () => {
    if (!file) return;
    setIsExporting(true);
    try {
      const pdfBytes = await engine.save(annotations);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${file.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCombinePDFs = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length < 2) {
        alert("Please select at least 2 PDF files to combine.");
        return;
      }
      setIsCombining(true);
      try {
        const combinedBytes = await engine.combinePDFs(files);
        const blob = new Blob([combinedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `combined_${new Date().getTime()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Error combining PDFs:", err);
        alert("Failed to combine PDFs. Please check if the files are valid.");
      } finally {
        setIsCombining(false);
      }
    };
    input.click();
  };

  const deleteAnnotation = (id: string) => {
    updateAnnotationsWithHistory(annotations.filter(a => a.id !== id));
    setSelectedAnnotationId(null);
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations(annotations.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const commitAnnotationUpdate = (id: string, updates: Partial<Annotation>) => {
    const newAnnotations = annotations.map(a => a.id === id ? { ...a, ...updates } : a);
    updateAnnotationsWithHistory(newAnnotations);
  };

  const deletePage = async (index: number) => {
    if (pageCount <= 1) return;
    await engine.deletePage(index);
    setPageCount(p => p - 1);
    if (currentPage >= index && currentPage > 0) {
      setCurrentPage(p => p - 1);
    }
    // Update annotations page indices
    updateAnnotationsWithHistory(annotations
      .filter(a => a.pageIndex !== index)
      .map(a => a.pageIndex > index ? { ...a, pageIndex: a.pageIndex - 1 } : a)
    );
  };

  const movePage = async (from: number, to: number) => {
    if (to < 0 || to >= pageCount) return;
    await engine.movePage(from, to);
    setCurrentPage(to);
    // Update annotations page indices
    updateAnnotationsWithHistory(annotations.map(a => {
      if (a.pageIndex === from) return { ...a, pageIndex: to };
      if (from < to && a.pageIndex > from && a.pageIndex <= to) return { ...a, pageIndex: a.pageIndex - 1 };
      if (from > to && a.pageIndex < from && a.pageIndex >= to) return { ...a, pageIndex: a.pageIndex + 1 };
      return a;
    }));
  };

  const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId);

  if (!file) {
    return (
      <div className="min-h-screen bg-bg-deep flex flex-col items-center justify-center p-6 font-sans text-text-main">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full"
        >
          <div className="text-center mb-12">
            <h1 className="text-5xl font-serif italic tracking-tight text-accent mb-4">INSPECTED PDF</h1>
            <p className="text-xl text-text-dim">by Pre Purchase Inspection LLC.</p>
          </div>

          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-lg p-16 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group",
              isDragActive ? "border-accent bg-accent/5" : "border-border-custom bg-bg-panel hover:border-accent hover:bg-bg-card"
            )}
          >
            <input {...getInputProps()} />
            <div className="w-20 h-20 bg-bg-card rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-border-custom">
              <FileUp className="w-10 h-10 text-accent" />
            </div>
            <p className="text-2xl font-semibold text-text-main mb-2">
              {isDragActive ? "Drop your PDF here" : "Upload your PDF"}
            </p>
            <p className="text-text-dim">Drag and drop or click to browse</p>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-6">
            {[
              { icon: Type, title: "Text Editing", desc: "Add and format text precisely" },
              { icon: ImageIcon, title: "Image Support", desc: "Insert and resize images" },
              { icon: Layers, title: "Page Control", desc: "Manage and reorder pages" }
            ].map((feature, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 bg-bg-panel border border-border-custom rounded-lg shadow-sm flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-semibold text-text-main mb-1">{feature.title}</h3>
                <p className="text-sm text-text-dim leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-bg-deep font-sans text-text-main">
        {/* Top Toolbar */}
        <header className="h-[60px] bg-bg-panel border-b border-border-custom flex items-center justify-between px-6 z-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-6">
              <span className="font-serif italic text-xl tracking-wider text-accent">INSPECTED PDF</span>
            </div>
            
            <Separator orientation="vertical" className="h-8 bg-border-custom" />

            <div className="flex items-center gap-1">
              <ToolbarButton 
                active={false} 
                onClick={() => {
                  setFile(null);
                  setAnnotations([]);
                  setHistory([[]]);
                  setHistoryIndex(0);
                  setCurrentPage(0);
                  setPageCount(0);
                  setPageInfo(null);
                  setTextItems([]);
                }}
                icon={FileUp}
                label="New Document"
              />
              <ToolbarButton 
                active={isCombining} 
                onClick={handleCombinePDFs}
                icon={Layers}
                label="Combine PDFs"
              />
            </div>

            <Separator orientation="vertical" className="h-8 bg-border-custom" />
            
            <div className="flex items-center gap-1">
              <ToolbarButton 
                active={activeTool === 'select'} 
                onClick={() => setActiveTool('select')}
                icon={MousePointer2}
                label="Select & Edit"
              />
              <div className="flex items-center gap-1 px-1 bg-bg-deep/50 rounded-sm border border-border-custom">
                <ToolbarButton 
                  active={detectionMode === 'word'} 
                  onClick={() => setDetectionMode('word')}
                  icon={WholeWord}
                  label="Word Mode"
                />
                <ToolbarButton 
                  active={detectionMode === 'sentence'} 
                  onClick={() => setDetectionMode('sentence')}
                  icon={ScanText}
                  label="Sentence Mode"
                />
              </div>
              <Separator orientation="vertical" className="h-4 mx-1 bg-border-custom" />
              <ToolbarButton 
                active={activeTool === 'text'} 
                onClick={() => setActiveTool('text')}
                icon={Type}
                label="Add New Text"
              />
              <ToolbarButton 
                active={activeTool === 'image'} 
                onClick={() => setActiveTool('image')}
                icon={ImageIcon}
                label="Add Image"
              />
              <Separator orientation="vertical" className="h-4 mx-1 bg-border-custom" />
              <div className="flex items-center gap-1">
                <ToolbarButton 
                  active={false} 
                  onClick={undo}
                  icon={Undo2}
                  label="Undo (Ctrl+Z)"
                />
                <ToolbarButton 
                  active={false} 
                  onClick={redo}
                  icon={Redo2}
                  label="Redo (Ctrl+Shift+Z)"
                />
              </div>
              <Separator orientation="vertical" className="h-4 mx-1 bg-border-custom" />
              <div className="flex items-center gap-1">
                <ToolbarButton 
                  active={false} 
                  onClick={copy}
                  icon={Copy}
                  label="Copy (Ctrl+C)"
                />
                <ToolbarButton 
                  active={false} 
                  onClick={paste}
                  icon={Clipboard}
                  label="Paste (Ctrl+V)"
                />
              </div>
              <Separator orientation="vertical" className="h-4 mx-1 bg-border-custom" />
              <ToolbarButton 
                active={false} 
                onClick={() => updateAnnotationsWithHistory([])}
                icon={Trash2}
                label="Clear All"
              />
            </div>

            <Separator orientation="vertical" className="h-8 bg-border-custom" />

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-text-dim hover:text-text-main hover:bg-bg-card" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim w-12 text-center">{Math.round(scale * 100)}%</span>
              <Button variant="ghost" size="icon" className="text-text-dim hover:text-text-main hover:bg-bg-card" onClick={() => setScale(s => Math.min(3, s + 0.1))}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-4">
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={currentPage === 0 || pageCount === 0}
                className="text-text-dim hover:text-text-main hover:bg-bg-card disabled:opacity-20"
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {pageCount > 0 ? `Page ${currentPage + 1} of ${pageCount}` : 'No Pages'}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={currentPage === pageCount - 1 || pageCount === 0}
                className="text-text-dim hover:text-text-main hover:bg-bg-card disabled:opacity-20"
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <Button 
              onClick={handleDownload} 
              disabled={isExporting}
              className="bg-accent hover:opacity-90 text-black font-bold text-xs uppercase tracking-widest rounded-none px-6 h-9 min-w-[140px]"
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExporting ? 'Exporting...' : 'Export Document'}
            </Button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Thumbnails */}
          <aside className="w-[240px] bg-bg-panel border-r border-border-custom flex flex-col">
            <div className="p-4 border-b border-border-custom">
              <h3 className="text-[10px] font-bold uppercase tracking-[2px] text-text-dim">Pages</h3>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {Array.from({ length: pageCount }).map((_, i) => (
                  <div 
                    key={i}
                    className="group relative"
                  >
                    <div 
                      onClick={() => setCurrentPage(i)}
                      className={cn(
                        "relative aspect-[1/1.4] rounded-sm border transition-all duration-200",
                        currentPage === i ? "border-accent shadow-[0_0_15px_rgba(212,175,55,0.2)]" : "border-border-custom hover:border-text-dim"
                      )}
                    >
                      <div className="absolute top-2 left-2 w-6 h-6 bg-bg-deep/80 backdrop-blur-sm rounded-sm flex items-center justify-center text-[10px] font-bold text-accent z-10 border border-accent/20">
                        {i + 1}
                      </div>
                      <div className="w-full h-full bg-[#080808] flex items-center justify-center overflow-hidden">
                        <Thumbnail pageIndex={i} engine={engine} />
                      </div>
                    </div>
                    
                    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <Button 
                        variant="secondary" 
                        size="icon" 
                        className="h-6 w-6 bg-bg-panel/90 border border-border-custom backdrop-blur shadow-sm hover:bg-red-900/20 hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); deletePage(i); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="icon" 
                        disabled={i === 0}
                        className="h-6 w-6 bg-bg-panel/90 border border-border-custom backdrop-blur shadow-sm disabled:opacity-20"
                        onClick={(e) => { e.stopPropagation(); movePage(i, i - 1); }}
                      >
                        <ChevronLeft className="h-3 w-3 rotate-90" />
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="icon" 
                        disabled={i === pageCount - 1}
                        className="h-6 w-6 bg-bg-panel/90 border border-border-custom backdrop-blur shadow-sm disabled:opacity-20"
                        onClick={(e) => { e.stopPropagation(); movePage(i, i + 1); }}
                      >
                        <ChevronRight className="h-3 w-3 rotate-90" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </aside>

          {/* Main Canvas Area */}
          <main className="flex-1 overflow-auto p-12 flex justify-center items-start relative bg-[#080808]">
            {isLoading && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg-deep/80 backdrop-blur-sm">
                <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mb-4" />
                <p className="text-xs font-bold uppercase tracking-[2px] text-accent">Processing PDF...</p>
              </div>
            )}

            {isRendering && !isLoading && (
              <div className="absolute top-4 right-4 z-40 flex items-center gap-3 bg-bg-panel/90 border border-border-custom px-4 py-2 backdrop-blur shadow-xl">
                <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Scanning Text...</p>
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg-deep/80 backdrop-blur-sm p-6 text-center">
                <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                  <FileText className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-serif italic text-text-main mb-2">Load Error</h3>
                <p className="text-text-dim max-w-md mb-8">{loadError}</p>
                <Button 
                  onClick={() => { setFile(null); setLoadError(null); }}
                  className="bg-accent hover:opacity-90 text-black font-bold text-xs uppercase tracking-widest rounded-none px-8"
                >
                  Try Again
                </Button>
              </div>
            )}

            <div 
              ref={containerRef}
              className={cn(
                "relative shadow-[0_30px_60px_rgba(0,0,0,0.8)] bg-white transition-opacity duration-300",
                (isLoading || !pageInfo) ? "opacity-0" : "opacity-100"
              )}
              style={{
                width: pageInfo?.width,
                height: pageInfo?.height
              }}
            >
              <canvas 
                ref={canvasRef} 
                onClick={handleCanvasClick}
                className={cn(
                  "block",
                  activeTool !== 'select' && "cursor-crosshair"
                )}
              />
              
              {/* Annotation Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Text Interaction Layer */}
                <div className="absolute inset-0 z-10">
                  {textItems.map(item => {
                    const hasEdit = annotations.some(a => a.type === 'edit' && a.x === item.x && a.y === item.y && a.pageIndex === currentPage);
                    if (hasEdit) return null;
                    
                    return (
                      <div
                        key={item.id}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          handleTextItemClick(item); 
                        }}
                        className="absolute pointer-events-auto cursor-text hover:bg-blue-500/10 hover:ring-1 hover:ring-blue-400/30 transition-all duration-75 group/word z-10"
                        style={{
                          left: item.x * scale,
                          top: item.y * scale,
                          width: item.width * scale,
                          height: item.height * scale,
                        }}
                      />
                    );
                  })}
                </div>

                {annotations.filter(a => a.pageIndex === currentPage).map(ann => (
                  <AnnotationItem 
                    key={ann.id}
                    annotation={ann}
                    scale={scale}
                    isSelected={selectedAnnotationId === ann.id}
                    onSelect={() => setSelectedAnnotationId(ann.id)}
                    onUpdate={(updates) => {
                      if ('id' in updates) {
                        if (updates.id === 'DELETE') {
                          deleteAnnotation(ann.id);
                        } else if (updates.id === 'COMMIT') {
                          commitAnnotationUpdate(ann.id, {});
                        } else if (updates.id === 'DESELECT') {
                          setSelectedAnnotationId(null);
                        }
                      } else {
                        updateAnnotation(ann.id, updates);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          </main>

          {/* Right Sidebar - Properties */}
          <aside className="w-[280px] bg-bg-panel border-l border-border-custom flex flex-col">
            <div className="p-4 border-b border-border-custom">
              <h3 className="text-[10px] font-bold uppercase tracking-[2px] text-text-dim">Inspector</h3>
            </div>
            <ScrollArea className="flex-1 p-6">
              {selectedAnnotation ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-text-main">
                      {selectedAnnotation.type === 'text' ? 'Text Element' : 'Image Element'}
                    </h4>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-text-dim hover:text-red-500 hover:bg-red-900/10"
                      onClick={() => deleteAnnotation(selectedAnnotation.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {(selectedAnnotation.type === 'text' || selectedAnnotation.type === 'edit') && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase tracking-widest text-text-dim">
                          {selectedAnnotation.type === 'edit' ? 'Edit Text' : 'Content'}
                        </Label>
                        <Input 
                          id="content-input"
                          value={selectedAnnotation.content} 
                          className="bg-bg-card border-border-custom text-text-main focus:border-accent rounded-sm h-10"
                          onChange={(e) => updateAnnotation(selectedAnnotation.id, { content: e.target.value })}
                        />
                        {selectedAnnotation.type === 'edit' && (
                          <div className="flex flex-col gap-2">
                            <p className="text-[9px] text-text-dim italic">
                              Original: "{selectedAnnotation.originalText}"
                            </p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[9px] border-border-custom hover:bg-bg-panel"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { content: selectedAnnotation.originalText })}
                            >
                              Reset to Original
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase tracking-widest text-text-dim">Font Size</Label>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-text-dim hover:text-accent"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { fontSize: Math.max(8, (selectedAnnotation.fontSize || 16) - 1) })}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input 
                              type="number" 
                              value={selectedAnnotation.fontSize || 16}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                  updateAnnotation(selectedAnnotation.id, { fontSize: Math.min(144, Math.max(1, val)) });
                                }
                              }}
                              className="h-6 w-12 text-center text-[10px] bg-bg-deep border-border-custom p-0"
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-text-dim hover:text-accent"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { fontSize: Math.min(144, (selectedAnnotation.fontSize || 16) + 1) })}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <Slider 
                          value={[selectedAnnotation.fontSize || 16]} 
                          min={8} 
                          max={144} 
                          step={1}
                          className="py-4"
                          onValueChange={(v) => updateAnnotation(selectedAnnotation.id, { fontSize: v[0] })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase tracking-widest text-text-dim">Text Color</Label>
                        <div className="flex gap-2 flex-wrap">
                          {['#E2E2E2', '#D4AF37', '#FF4444', '#44FF44', '#4444FF', '#000000', '#FFFFFF'].map(c => (
                            <button
                              key={c}
                              onClick={() => updateAnnotation(selectedAnnotation.id, { color: c })}
                              className={cn(
                                "w-7 h-7 rounded-full border transition-all",
                                selectedAnnotation.color === c ? "border-accent scale-110" : "border-border-custom"
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase tracking-widest text-text-dim">Background Color</Label>
                        <div className="flex gap-2 flex-wrap">
                          {['transparent', '#FFFFFF', '#000000', '#F3F4F6', '#FEF3C7', '#E0F2FE'].map(c => (
                            <button
                              key={c}
                              onClick={() => updateAnnotation(selectedAnnotation.id, { backgroundColor: c })}
                              className={cn(
                                "w-7 h-7 rounded-full border transition-all flex items-center justify-center",
                                (selectedAnnotation.backgroundColor || (selectedAnnotation.type === 'edit' ? 'white' : 'transparent')) === c ? "border-accent scale-110" : "border-border-custom"
                              )}
                              style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}
                            >
                              {c === 'transparent' && <div className="w-full h-[1px] bg-red-500 rotate-45" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedAnnotation.type === 'image' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase tracking-widest text-text-dim">Width</Label>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-text-dim hover:text-accent"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { width: Math.max(20, (selectedAnnotation.width || 150) - 5) })}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input 
                              type="number" 
                              value={Math.round(selectedAnnotation.width || 150)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                  updateAnnotation(selectedAnnotation.id, { width: Math.min(1000, Math.max(1, val)) });
                                }
                              }}
                              className="h-6 w-12 text-center text-[10px] bg-bg-deep border-border-custom p-0"
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-text-dim hover:text-accent"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { width: Math.min(1000, (selectedAnnotation.width || 150) + 5) })}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <Slider 
                          value={[selectedAnnotation.width || 150]} 
                          min={20} 
                          max={1000} 
                          step={1}
                          className="py-4"
                          onValueChange={(v) => updateAnnotation(selectedAnnotation.id, { width: v[0] })}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase tracking-widest text-text-dim">Height</Label>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-text-dim hover:text-accent"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { height: Math.max(20, (selectedAnnotation.height || 150) - 5) })}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input 
                              type="number" 
                              value={Math.round(selectedAnnotation.height || 150)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                  updateAnnotation(selectedAnnotation.id, { height: Math.min(1000, Math.max(1, val)) });
                                }
                              }}
                              className="h-6 w-12 text-center text-[10px] bg-bg-deep border-border-custom p-0"
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-text-dim hover:text-accent"
                              onClick={() => updateAnnotation(selectedAnnotation.id, { height: Math.min(1000, (selectedAnnotation.height || 150) + 5) })}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <Slider 
                          value={[selectedAnnotation.height || 150]} 
                          min={20} 
                          max={1000} 
                          step={1}
                          className="py-4"
                          onValueChange={(v) => updateAnnotation(selectedAnnotation.id, { height: v[0] })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-8 border-t border-border-custom space-y-6">
                    <Label className="text-[10px] uppercase tracking-widest text-text-dim">Geometry</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-[9px] text-text-dim uppercase">X (px)</span>
                        <Input 
                          type="number" 
                          value={Math.round(selectedAnnotation.x)} 
                          className="bg-bg-card border-border-custom text-text-main h-8 text-xs rounded-sm"
                          onChange={(e) => updateAnnotation(selectedAnnotation.id, { x: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[9px] text-text-dim uppercase">Y (px)</span>
                        <Input 
                          type="number" 
                          value={Math.round(selectedAnnotation.y)} 
                          className="bg-bg-card border-border-custom text-text-main h-8 text-xs rounded-sm"
                          onChange={(e) => updateAnnotation(selectedAnnotation.id, { y: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <div className="opacity-20 flex flex-col items-center mb-8">
                    <Settings2 className="w-12 h-12 mb-4" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Select an element</p>
                  </div>
                  
                  <div className="w-full space-y-4 text-left bg-bg-card/50 p-4 rounded-sm border border-border-custom">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-accent">How to edit</h5>
                    <div className="space-y-3 text-[10px] text-text-dim leading-relaxed">
                      <div className="flex gap-3">
                        <span className="text-accent font-bold">01</span>
                        <p>Click directly on any word in the document to edit it.</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-accent font-bold">02</span>
                        <p>Or select <Type className="inline w-3 h-3 mx-1" /> to add new text layers.</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-accent font-bold">03</span>
                        <p>Use the inspector to change content or delete words.</p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="mt-8 text-[9px] text-text-dim italic">
                    Note: Click any word in the PDF to edit or delete it. The system automatically masks the original text.
                  </p>
                </div>
              )}
            </ScrollArea>
          </aside>
        </div>

        {/* Status Bar */}
        <footer className="h-6 bg-bg-panel border-t border-border-custom flex items-center justify-between px-4 text-[9px] font-bold uppercase tracking-widest text-text-dim">
          <div className="flex items-center gap-4">
            <span>Selection: {selectedAnnotation ? `[${selectedAnnotation.type.toUpperCase()}] x:${Math.round(selectedAnnotation.x)} y:${Math.round(selectedAnnotation.y)}` : 'None'}</span>
          </div>
          <div className="flex-1 text-center opacity-50">
            Presented by Pre Purchase Inspection LLC team
          </div>
          <div className="flex items-center gap-6">
            <span>Zoom: {Math.round(scale * 100)}%</span>
            <span>Engine: High Fidelity</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>System Active</span>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

function Thumbnail({ pageIndex, engine }: { pageIndex: number, engine: PDFEngine }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    engine.renderPage(pageIndex, 0.2)
      .then(({ canvas }) => {
        if (active) setUrl(canvas.toDataURL());
      })
      .catch((err) => {
        console.error("Thumbnail render error:", err);
        if (active) setError(true);
      });
    return () => { active = false; };
  }, [pageIndex, engine]);

  if (error) return <div className="flex flex-col items-center gap-1 opacity-50"><FileText className="w-6 h-6 text-red-500" /><span className="text-[8px]">Error</span></div>;
  if (!url) return <div className="flex flex-col items-center gap-2"><FileText className="w-8 h-8 text-text-dim animate-pulse" /><span className="text-[8px] text-text-dim">Loading...</span></div>;
  return <img src={url} alt={`Page ${pageIndex + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />;
}

function ToolbarButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClick}
          className={cn(
            "w-10 h-10 transition-all duration-200 rounded-sm",
            active ? "bg-accent/10 text-accent hover:bg-accent/20" : "text-text-dim hover:text-text-main hover:bg-bg-card"
          )}
        >
          <Icon className="w-5 h-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-bg-card border-border-custom text-text-main text-[10px] uppercase tracking-widest">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function AnnotationItem({ 
  annotation, 
  isSelected, 
  onSelect, 
  onUpdate,
  scale
}: { 
  annotation: Annotation, 
  isSelected: boolean, 
  onSelect: () => void, 
  onUpdate: (updates: Partial<Annotation> | { id: 'DELETE' | 'COMMIT' | 'DESELECT' }) => void,
  scale: number,
  key?: any
}) {
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });

  // Map PDF fonts to system fonts for UI
  const getFontFamily = (pdfFont?: string) => {
    if (!pdfFont) return 'inherit';
    const lower = pdfFont.toLowerCase();
    if (lower.includes('times') || lower.includes('serif')) return 'serif';
    if (lower.includes('courier') || lower.includes('mono')) return 'monospace';
    return 'sans-serif';
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    isDragging.current = true;
    // Store offset in PDF points
    startPos.current = { 
      x: (e.clientX / scale) - annotation.x, 
      y: (e.clientY / scale) - annotation.y 
    };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDragging.current) {
        onUpdate({
          x: (moveEvent.clientX / scale) - startPos.current.x,
          y: (moveEvent.clientY / scale) - startPos.current.y
        });
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    onSelect();
    isDragging.current = true;
    const touch = e.touches[0];
    startPos.current = { 
      x: (touch.clientX / scale) - annotation.x, 
      y: (touch.clientY / scale) - annotation.y 
    };
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (isDragging.current) {
        const t = moveEvent.touches[0];
        onUpdate({
          x: (t.clientX / scale) - startPos.current.x,
          y: (t.clientY / scale) - startPos.current.y
        });
      }
    };

    const handleTouchEnd = () => {
      isDragging.current = false;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isResizing.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = { 
      width: annotation.width || 0, 
      height: annotation.height || 0 
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isResizing.current) {
        const deltaX = (moveEvent.clientX - startPos.current.x) / scale;
        const deltaY = (moveEvent.clientY - startPos.current.y) / scale;
        onUpdate({
          width: Math.max(10, startSize.current.width + deltaX),
          height: Math.max(10, startSize.current.height + deltaY)
        });
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={cn(
        "absolute pointer-events-auto cursor-move select-none group z-20",
        isSelected && "ring-2 ring-accent shadow-[0_0_15px_rgba(212,175,55,0.3)]"
      )}
      style={{
        left: annotation.x * scale,
        top: annotation.y * scale,
        color: annotation.color,
        fontSize: (annotation.fontSize || 16) * scale,
        fontFamily: getFontFamily(annotation.fontFamily),
        lineHeight: 1.1,
        backgroundColor: annotation.backgroundColor || (annotation.type === 'edit' ? 'white' : 'transparent'),
        minWidth: (annotation.width || 20) * scale,
        minHeight: (annotation.height || 20) * scale,
      }}
    >
      {annotation.type === 'text' || annotation.type === 'edit' ? (
        <div className="relative flex items-center h-full w-full">
          {isSelected && (annotation.type === 'edit' || annotation.type === 'text') ? (
            <input
              autoFocus
              className="bg-white text-black border-none outline-none p-0 m-0 w-full h-full shadow-[0_0_0_1px_rgba(212,175,55,0.5)] rounded-sm"
              value={annotation.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              onBlur={() => onUpdate({ id: 'COMMIT' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                  onUpdate({ id: 'DESELECT' });
                }
              }}
              style={{
                fontSize: 'inherit',
                fontFamily: 'inherit',
                width: '100%',
                height: '100%',
                minWidth: '20px'
              }}
            />
          ) : (
            <div 
              className="whitespace-nowrap px-0.5 w-full h-full"
              style={{ fontFamily: 'inherit' }}
            >
              {annotation.content || (annotation.type === 'edit' ? '' : ' ')}
              {annotation.type === 'edit' && !annotation.content && (
                <span className="text-[8px] opacity-30 italic">[Deleted]</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div 
          className="relative group"
          style={{ width: (annotation.width || 150) * scale, height: (annotation.height || 150) * scale }}
        >
          <img 
            src={annotation.dataUrl} 
            alt="Annotation" 
            className="w-full h-full object-contain pointer-events-none"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 border border-accent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
      
      {isSelected && (
        <div className="absolute -top-8 right-0 flex items-center gap-1 bg-bg-panel border border-border-custom p-1 rounded-sm shadow-xl z-50">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-red-500 hover:bg-red-500/10"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({ id: 'DELETE' });
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      {isSelected && (
        <div 
          onMouseDown={handleResizeMouseDown}
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-accent cursor-nwse-resize rounded-full border border-white z-30 shadow-sm" 
        />
      )}
    </div>
  );
}
