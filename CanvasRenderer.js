import { PIXELS_PER_MM, mmToPx, getBoundsAndCenter } from './GeometryUtils.js';

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;

    // Initialize settings FIRST before calling resize
    this.settings = {
      showGrid: true,
      showDimensions: true,
      zoom: 0.15,
      pan: { x: 200, y: 200 },
      gridSizeMm: 25,
      canvasWidth: 2100,
      canvasHeight: 2100
    };

    this.interactionState = null;
    // Now safe to call resize
    this.resize();
  }

  resize() {
    const container = this.canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Set internal canvas dimensions to match physical pixels for sharpness
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Store logical dimensions for calculation
    this.width = rect.width;
    this.height = rect.height;

    this.gridValid = false; // Invalidate grid on resize
  }

  setRenderData(data) {
    this.renderData = data;
  }

  setInteractionState(state) {
    this.interactionState = state;
  }

  updateSettings(newSettings) {
    const oldCanvasW = this.settings.canvasWidth;
    const oldCanvasH = this.settings.canvasHeight;

    this.settings = { ...this.settings, ...newSettings };

    if (newSettings.canvasWidth !== undefined && newSettings.canvasWidth !== oldCanvasW) { this.resize(); }
    if (newSettings.canvasHeight !== undefined && newSettings.canvasHeight !== oldCanvasH) { this.resize(); }
  }

  render() {
    if (!this.ctx) return;
    const { pan, zoom, showGrid, showDimensions, gridSizeMm, canvasWidth, canvasHeight } = this.settings;
    const dpr = window.devicePixelRatio || 1;

    // Use setTransform to handle DPI and clear any previous state
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fill background (logical coordinates)
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(0, 0, this.width, this.height);

    if (showGrid) {
      this.drawGrid(pan, zoom, gridSizeMm, canvasWidth, canvasHeight);
    }

    // Apply viewport transformation
    this.ctx.translate(pan.x, pan.y);
    this.ctx.scale(zoom, zoom);

    if (this.renderData) {
      const { innerPath, outerPath, contours, previewPath, innerBezierPoints, outerBezierPoints } = this.renderData;

      if (contours && contours.length) {
        contours.forEach(c => {
          this.drawPath(c, '#22c55e', 1.5 / zoom);
        });
      }

      if (innerPath && innerPath.length) {
        this.drawPath(innerPath, '#ef4444', 2.5 / zoom);
        if (showDimensions) this.drawDimensions(innerPath, zoom);
      }

      if (outerPath && outerPath.length) {
        this.drawPath(outerPath, '#3b82f6', 2.5 / zoom);
        if (showDimensions) this.drawDimensions(outerPath, zoom);
      }

      if (previewPath && previewPath.length) {
        this.drawPath(previewPath, '#3b82f6', 2 / zoom);
      }

      if (this.interactionState) {
        const { drawingPath, drawingType, mode, activeBezier, activeType, isEditingBezier, selectedPoint } = this.interactionState;

        if (drawingPath && drawingPath.length) {
          const color = drawingType === 'inner' ? '#ef4444' : '#3b82f6';
          this.drawPath(drawingPath, color, 2 / zoom);
          this.drawDimensions(drawingPath, zoom);
        }

        if (mode === 'bezier' && activeBezier && activeBezier.length) {
          this.drawBezierUI(activeBezier, activeType || 'outer', zoom, false, selectedPoint);
        }

        if (isEditingBezier) {
          if (innerBezierPoints && innerBezierPoints.length) {
            this.drawBezierUI(innerBezierPoints, 'inner', zoom, true, selectedPoint);
          }
          if (outerBezierPoints && outerBezierPoints.length) {
            this.drawBezierUI(outerBezierPoints, 'outer', zoom, true, selectedPoint);
          }
        }
      }
    }
  }

  drawGrid(pan, zoom, gridSizeMm, canvasWidthMm, canvasHeightMm) {
    const dpr = window.devicePixelRatio || 1;
    const ww = mmToPx(canvasWidthMm);
    const wh = mmToPx(canvasHeightMm);
    const gridSize = mmToPx(gridSizeMm);

    this.ctx.save();
    // Grid lines should be 1 physical pixel thick for maximum sharpness
    this.ctx.lineWidth = 1 / dpr;
    this.ctx.strokeStyle = '#e2e8f0';

    this.ctx.beginPath();

    // Vertical lines
    for (let wx = 0; wx <= ww + 0.1; wx += gridSize) {
      const sx = wx * zoom + pan.x;
      // Snap to exact physical pixel boundary (+0.5 for centering 1px line)
      const snappedX = (Math.round(sx * dpr) + 0.5) / dpr;

      const syStart = Math.max(0, 0 * zoom + pan.y);
      const syEnd = Math.min(this.height, wh * zoom + pan.y);

      this.ctx.moveTo(snappedX, syStart);
      this.ctx.lineTo(snappedX, syEnd);
    }

    // Horizontal lines
    for (let wy = 0; wy <= wh + 0.1; wy += gridSize) {
      const sy = wy * zoom + pan.y;
      const snappedY = (Math.round(sy * dpr) + 0.5) / dpr;

      const sxStart = Math.max(0, 0 * zoom + pan.x);
      const sxEnd = Math.min(this.width, ww * zoom + pan.x);

      this.ctx.moveTo(sxStart, snappedY);
      this.ctx.lineTo(sxEnd, snappedY);
    }
    this.ctx.stroke();

    // Center lines (slightly darker than grid)
    this.ctx.strokeStyle = '#cbd5e1';
    this.ctx.lineWidth = 1 / dpr;
    this.ctx.beginPath();

    const centerX = (ww / 2) * zoom + pan.x;
    const snappedCenterX = (Math.round(centerX * dpr) + 0.5) / dpr;
    const centerY = (wh / 2) * zoom + pan.y;
    const snappedCenterY = (Math.round(centerY * dpr) + 0.5) / dpr;

    const syStart = Math.max(0, 0 * zoom + pan.y);
    const syEnd = Math.min(this.height, wh * zoom + pan.y);
    const sxStart = Math.max(0, 0 * zoom + pan.x);
    const sxEnd = Math.min(this.width, ww * zoom + pan.x);

    this.ctx.moveTo(snappedCenterX, syStart);
    this.ctx.lineTo(snappedCenterX, syEnd);
    this.ctx.moveTo(sxStart, snappedCenterY);
    this.ctx.lineTo(sxEnd, snappedCenterY);
    this.ctx.stroke();

    // Canvas Border
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.lineWidth = 2 / dpr;
    this.ctx.setLineDash([10 / dpr, 5 / dpr]);

    const bx1 = (Math.round((0 * zoom + pan.x) * dpr)) / dpr;
    const by1 = (Math.round((0 * zoom + pan.y) * dpr)) / dpr;
    const bw = (Math.round((ww * zoom) * dpr)) / dpr;
    const bh = (Math.round((wh * zoom) * dpr)) / dpr;

    this.ctx.strokeRect(bx1, by1, bw, bh);
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  drawPath(path, color, width) {
    if (!path || !path.length) return;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      this.ctx.lineTo(path[i].x, path[i].y);
    }
    this.ctx.stroke();
  }

  drawBezierUI(points, type, zoom, isEditing, selectedPoint) {
    if (!points || !points.length) return;
    const color = type === 'inner' ? '#ef4444' : '#3b82f6';

    if (points.length > 1) {
      for (let i = 0; i < points.length; i++) {
        if (!isEditing && i === points.length - 1) break;

        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const isStraight = p1.segmentType === 'straight';

        this.ctx.strokeStyle = isStraight ? '#f97316' : color;
        this.ctx.lineWidth = isStraight ? 3 / zoom : 2 / zoom;
        this.ctx.setLineDash(isStraight ? [] : [5 / zoom]);

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
      this.ctx.setLineDash([]);
    }

    points.forEach((p, i) => {
      const isMid = p.pointType === 'mid';
      const isSel = selectedPoint && selectedPoint.type === type && selectedPoint.index === i;

      this.ctx.fillStyle = isSel ? '#ef4444' : (isMid ? '#fbbf24' : '#fff');
      this.ctx.strokeStyle = isMid ? '#d97706' : (p.segmentType === 'straight' ? '#f97316' : color);
      this.ctx.lineWidth = 2 / zoom;

      this.ctx.beginPath();
      if (isMid) {
        this.ctx.arc(p.x, p.y, 5 / zoom, 0, Math.PI * 2);
      } else {
        const r = (i === 0 && !isEditing) ? 8 / zoom : 6 / zoom;
        if (isEditing) {
          const size = 7 / zoom;
          this.ctx.rect(p.x - size, p.y - size, size * 2, size * 2);
        } else {
          this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
      }
      this.ctx.stroke();
      this.ctx.fill();
    });
  }

  drawDimensions(path, zoom) {
    if (!path.length) return;
    const bounds = getBoundsAndCenter(path);
    const wPx = bounds.width;
    const hPx = bounds.height;
    const wMm = (wPx / PIXELS_PER_MM).toFixed(0);
    const hMm = (hPx / PIXELS_PER_MM).toFixed(0);

    const fontSize = 24 / zoom;
    const padding = 30 / zoom;
    const lineLen = 15 / zoom;

    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.fillStyle = '#1e293b';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    this.ctx.beginPath();
    this.ctx.moveTo(bounds.minX - padding, bounds.maxY + padding);
    this.ctx.lineTo(bounds.maxX + padding, bounds.maxY + padding);
    this.ctx.moveTo(bounds.minX, bounds.maxY + padding - lineLen);
    this.ctx.lineTo(bounds.minX, bounds.maxY + padding + lineLen);
    this.ctx.moveTo(bounds.maxX, bounds.maxY + padding - lineLen);
    this.ctx.lineTo(bounds.maxX, bounds.maxY + padding + lineLen);
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 2 / zoom;
    this.ctx.stroke();
    this.ctx.fillText(`En: ${wMm} mm`, bounds.cx, bounds.maxY + padding + fontSize);

    this.ctx.beginPath();
    this.ctx.moveTo(bounds.maxX + padding, bounds.minY - padding);
    this.ctx.lineTo(bounds.maxX + padding, bounds.maxY + padding);
    this.ctx.moveTo(bounds.maxX + padding - lineLen, bounds.minY);
    this.ctx.lineTo(bounds.maxX + padding + lineLen, bounds.minY);
    this.ctx.moveTo(bounds.maxX + padding - lineLen, bounds.maxY);
    this.ctx.lineTo(bounds.maxX + padding + lineLen, bounds.maxY);
    this.ctx.stroke();

    this.ctx.save();
    this.ctx.translate(bounds.maxX + padding + fontSize, bounds.cy);
    this.ctx.rotate(Math.PI / 2);
    this.ctx.fillText(`Boy: ${hMm} mm`, 0, 0);
    this.ctx.restore();
  }
}
