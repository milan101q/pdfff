import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

// @ts-ignore - Vite specific import
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  viewport: any;
}

export interface TextItem {
  id: string;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
}

export interface Annotation {
  id: string;
  type: 'text' | 'image' | 'drawing' | 'edit';
  pageIndex: number;
  x: number;
  y: number;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
  dataUrl?: string; // For images
  originalText?: string; // For 'edit' type
}

export class PDFEngine {
  private pdfDoc: PDFDocument | null = null;
  private pdfJsDoc: any = null;

  async load(file: File): Promise<{ pageCount: number }> {
    console.log("Loading PDF file:", file.name, file.size);
    const arrayBuffer = await file.arrayBuffer();
    try {
      this.pdfDoc = await PDFDocument.load(arrayBuffer);
      console.log("pdf-lib loaded document, pages:", this.pdfDoc.getPageCount());
      
      this.pdfJsDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      console.log("pdfjs loaded document, pages:", this.pdfJsDoc.numPages);
      
      return { pageCount: this.pdfDoc.getPageCount() };
    } catch (error) {
      console.error("Detailed error in engine.load:", error);
      throw error;
    }
  }

  async renderPage(pageIndex: number, scale: number = 1.5, detectionMode: 'word' | 'sentence' = 'word'): Promise<{ canvas: HTMLCanvasElement; info: PDFPageInfo; textItems: TextItem[] }> {
    if (!this.pdfJsDoc) throw new Error('PDF not loaded');
    
    const page = await this.pdfJsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport }).promise;

    // Extract text content with a base viewport (scale 1) for consistent coordinates
    const baseViewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    let rawItems: any[] = [...textContent.items];
    
    // Grouping logic for sentence mode
    if (detectionMode === 'sentence') {
      const groupedItems: any[] = [];
      let currentGroup: any = null;

      rawItems.forEach((item: any) => {
        if (!item.str || item.str.trim().length === 0) return;

        const transform = pdfjs.Util.transform(baseViewport.transform, item.transform);
        const x = transform[4];
        const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
        const height = item.height || fontSize;
        const y = transform[5] - height;

        if (!currentGroup) {
          currentGroup = { ...item, x, y, fontSize, height, fullStr: item.str, items: [item] };
        } else {
          const verticalDiff = Math.abs(y - currentGroup.y);
          const horizontalDiff = x - (currentGroup.x + currentGroup.width);
          
          // If on the same line (roughly) and close horizontally
          if (verticalDiff < fontSize * 0.5 && horizontalDiff < fontSize * 2) {
            currentGroup.fullStr += (horizontalDiff > fontSize * 0.2 ? " " : "") + item.str;
            currentGroup.width += horizontalDiff + item.width;
            currentGroup.items.push(item);
          } else {
            groupedItems.push(currentGroup);
            currentGroup = { ...item, x, y, fontSize, height, fullStr: item.str, items: [item] };
          }
        }
      });
      if (currentGroup) groupedItems.push(currentGroup);
      rawItems = groupedItems;
    }

    const textItems: TextItem[] = [];
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d')!;

    rawItems.forEach((item: any, idx: number) => {
      const str = item.fullStr || item.str;
      if (!str || str.trim().length === 0) return;
      if (item.width < 1 && str.length > 1) return;

      const transform = item.transform ? pdfjs.Util.transform(baseViewport.transform, item.transform) : null;
      const x = item.x !== undefined ? item.x : transform![4];
      const fontSize = item.fontSize !== undefined ? item.fontSize : Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
      const height = item.height || fontSize;
      const y = item.y !== undefined ? item.y : transform![5] - height;
      
      measureCtx.font = `${fontSize}px ${item.fontName || 'sans-serif'}`;
      
      if (detectionMode === 'word' && !item.fullStr) {
        const parts = str.split(/(\s+)/);
        let currentX = x;
        parts.forEach((part: string, pIdx: number) => {
          const partWidth = measureCtx.measureText(part).width;
          if (part.trim().length > 0) {
            textItems.push({
              id: `text-${pageIndex}-${idx}-${pIdx}`,
              str: part,
              x: currentX,
              y: y,
              width: partWidth,
              height: height,
              fontSize: fontSize,
              fontFamily: item.fontName
            });
          }
          currentX += partWidth;
        });
      } else {
        textItems.push({
          id: `text-${pageIndex}-${idx}`,
          str: str,
          x: x,
          y: y,
          width: item.width || measureCtx.measureText(str).width,
          height: height,
          fontSize: fontSize,
          fontFamily: item.fontName
        });
      }
    });
    
    return {
      canvas,
      info: {
        pageNumber: pageIndex + 1,
        width: viewport.width,
        height: viewport.height,
        viewport
      },
      textItems
    };
  }

  async deletePage(pageIndex: number): Promise<void> {
    if (!this.pdfDoc) throw new Error('PDF not loaded');
    this.pdfDoc.removePage(pageIndex);
  }

  async movePage(fromIndex: number, toIndex: number): Promise<void> {
    if (!this.pdfDoc) throw new Error('PDF not loaded');
    const [page] = await this.pdfDoc.copyPages(this.pdfDoc, [fromIndex]);
    this.pdfDoc.removePage(fromIndex);
    this.pdfDoc.insertPage(toIndex, page);
  }

  async combinePDFs(files: File[]): Promise<Uint8Array> {
    const combinedDoc = await PDFDocument.create();
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(arrayBuffer);
      const pages = await combinedDoc.copyPages(doc, doc.getPageIndices());
      pages.forEach(page => combinedDoc.addPage(page));
    }
    return await combinedDoc.save();
  }

  async save(annotations: Annotation[]): Promise<Uint8Array> {
    if (!this.pdfDoc) throw new Error('PDF not loaded');

    const helvetica = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesRoman = await this.pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courier = await this.pdfDoc.embedFont(StandardFonts.Courier);

    for (const ann of annotations) {
      const page = this.pdfDoc.getPage(ann.pageIndex);
      const { height: pageHeight } = page.getSize();

      // Try to map font family to standard fonts
      let activeFont = helvetica;
      if (ann.fontFamily) {
        const lowerFont = ann.fontFamily.toLowerCase();
        if (lowerFont.includes('times') || lowerFont.includes('serif')) {
          activeFont = timesRoman;
        } else if (lowerFont.includes('courier') || lowerFont.includes('mono')) {
          activeFont = courier;
        }
      }

      if (ann.type === 'text' && ann.content) {
        page.drawText(ann.content, {
          x: ann.x,
          y: pageHeight - ann.y - (ann.fontSize || 12),
          size: ann.fontSize || 12,
          font: activeFont,
          color: this.hexToRgb(ann.color || '#000000'),
        });
      } else if (ann.type === 'edit' && ann.content !== undefined) {
        // Draw white box over original text
        page.drawRectangle({
          x: ann.x,
          y: pageHeight - ann.y - (ann.height || 12),
          width: ann.width || 50,
          height: ann.height || 12,
          color: rgb(1, 1, 1),
        });
        
        // Draw new text if not deleted
        if (ann.content) {
          page.drawText(ann.content, {
            x: ann.x,
            y: pageHeight - ann.y - (ann.height || 12),
            size: ann.fontSize || 12,
            font: activeFont,
            color: this.hexToRgb(ann.color || '#000000'),
          });
        }
      } else if (ann.type === 'image' && ann.dataUrl) {
        const imageBytes = await fetch(ann.dataUrl).then(res => res.arrayBuffer());
        let embeddedImage;
        if (ann.dataUrl.includes('image/png')) {
          embeddedImage = await this.pdfDoc.embedPng(imageBytes);
        } else {
          embeddedImage = await this.pdfDoc.embedJpg(imageBytes);
        }
        
        page.drawImage(embeddedImage, {
          x: ann.x,
          y: pageHeight - ann.y - (ann.height || 100),
          width: ann.width || 100,
          height: ann.height || 100,
        });
      }
    }

    return await this.pdfDoc.save();
  }

  private hexToRgb(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
  }
}
