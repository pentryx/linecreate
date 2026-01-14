import React, { useState, useRef, useEffect } from 'react';
import { Download, RotateCcw, Trash2, ZoomIn, ZoomOut, Maximize2, Grid3x3, FileImage, FileText, Box, Edit3, Sun, Moon, Save, Upload, ChevronDown, Share2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import './ContourDrawer.css';

export default function ContourDrawer() {
  const canvasRef = useRef(null);
  const [paths, setPaths] = useState({ inner: [], outer: [] });
  const [drawing, setDrawing] = useState({ active: false, current: null, type: null });
  const [settings, setSettings] = useState({ numLines: 35, shapeSize: 100, shapeWidth: 150, shapeHeight: 100, zoom: 0.15, showGrid: true });
  const [pan, setPan] = useState({ x: 200, y: 200, isPanning: false, start: { x: 0, y: 0 } });
  const [mode, setMode] = useState({ draw: 'freehand', shape: null, straightLine: false });
  const [bezier, setBezier] = useState([]); // Çizim sırasında veya düzenleme sırasında aktif noktalar - Format: [{x, y, segmentType: 'straight'|'curve'}]
  const [guides, setGuides] = useState({ lines: [], editing: false, selected: null }); // Artık kullanılmıyor ama yapı korundu
  const [theme, setTheme] = useState('light'); // Theme state

  // State güncellemesi: editingBezierPoints ve selectedBezierPoint eklendi
  const [state, setState] = useState({
    finalized: false,
    center: null,
    preview: null,
    shapeStart: null,
    editingOuter: false,
    outerBezierPoints: [], // Dış şeklin orijinal Bezier noktaları
    editingBezierPoints: false, // Dış şekli nokta nokta düzenleme modu mu?
    selectedBezierPoint: null // Hangi nokta seçili?
  });

  const [isExportOpen, setIsExportOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const CANVAS_SIZE_MM = 2100;
  const GRID_SIZE_MM = 25;
  const PIXELS_PER_MM = 3.7795275591;
  const mmToPx = (mm) => mm * PIXELS_PER_MM;

  // Canvas display boyutu (piksel)
  const CANVAS_DISPLAY_WIDTH = 1600;
  const CANVAS_DISPLAY_HEIGHT = 1200;

  // Çizim alanı mantıksal boyutu (mm cinsinden hesaplanmış piksel)
  const LOGICAL_WIDTH = mmToPx(CANVAS_SIZE_MM);
  const LOGICAL_HEIGHT = mmToPx(CANVAS_SIZE_MM);

  // Theme toggle
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => { drawCanvas(); }, [paths, drawing, settings, pan, mode, bezier, guides, state]);

  const snapToGrid = (x, y) => {
    const step = mmToPx(GRID_SIZE_MM);
    return {
      x: Math.round(x / step) * step,
      y: Math.round(y / step) * step
    };
  };

  const shiftPath = (path, dx, dy) => {
    return path.map(p => ({ x: p.x + dx, y: p.y + dy }));
  };

  const getBoundsAndCenter = (path) => {
    if (!path.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0, width: 0, height: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    path.forEach(p => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const width = maxX - minX;
    const height = maxY - minY;
    return { minX, maxX, minY, maxY, cx: minX + width / 2, cy: minY + height / 2, width, height };
  };

  const getCoords = (e) => {
    const canvas = canvasRef.current, rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x: (x - pan.x) / settings.zoom, y: (y - pan.y) / settings.zoom };
  };

  const getCentroid = (pts) => {
    if (!pts.length) return { x: 0, y: 0 };
    let sx = 0, sy = 0, len = pts.length - 1;
    for (let i = 0; i < len; i++) { sx += pts[i].x; sy += pts[i].y; }
    return { x: sx / len, y: sy / len };
  };

  const smoothCatmullRom = (pts, tension = 0.5) => {
    if (pts.length < 3) return pts;
    const result = [];
    const steps = 30;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const p3 = pts[(i + 2) % pts.length];
      for (let t = 0; t < 1; t += 1 / steps) {
        const t2 = t * t, t3 = t2 * t;
        const v0x = (p2.x - p0.x) * tension, v0y = (p2.y - p0.y) * tension;
        const v1x = (p3.x - p1.x) * tension, v1y = (p3.y - p1.y) * tension;
        const x = (2 * p1.x - 2 * p2.x + v0x + v1x) * t3 + (-3 * p1.x + 3 * p2.x - 2 * v0x - v1x) * t2 + v0x * t + p1.x;
        const y = (2 * p1.y - 2 * p2.y + v0y + v1y) * t3 + (-3 * p1.y + 3 * p2.y - 2 * v0y - v1y) * t2 + v0y * t + p1.y;
        result.push({ x, y });
      }
    }
    return result;
  };

  // Yeni smooth fonksiyonu: segment tiplerini dikkate alır
  const smoothWithSegments = (bezierPoints) => {
    if (bezierPoints.length < 3) return bezierPoints.map(p => ({ x: p.x, y: p.y }));

    const result = [];
    const steps = 30;

    for (let i = 0; i < bezierPoints.length; i++) {
      const p1 = bezierPoints[i];
      const p2 = bezierPoints[(i + 1) % bezierPoints.length];

      if (p1.segmentType === 'straight') {
        result.push({ x: p1.x, y: p1.y });
      } else {
        // Catmull-Rom Spline with Sharp Corner Logic
        let p0 = bezierPoints[(i - 1 + bezierPoints.length) % bezierPoints.length];
        let p3 = bezierPoints[(i + 2) % bezierPoints.length];

        // Eğer p1 keskinse, başlangıç tanjantı p1-p2 doğrultusunda olsun (p0'ı p1 yap)
        const currentIsSharp = p1.isSharp;
        const nextIsSharp = p2.isSharp;

        const effectiveP0 = currentIsSharp ? p1 : p0;
        const effectiveP3 = nextIsSharp ? p2 : p3;

        for (let t = 0; t < 1; t += 1 / steps) {
          const t2 = t * t, t3 = t2 * t;
          const tension = 0.5;

          const v0x = (p2.x - effectiveP0.x) * tension, v0y = (p2.y - effectiveP0.y) * tension;
          const v1x = (effectiveP3.x - p1.x) * tension, v1y = (effectiveP3.y - p1.y) * tension;

          const x = (2 * p1.x - 2 * p2.x + v0x + v1x) * t3 + (-3 * p1.x + 3 * p2.x - 2 * v0x - v1x) * t2 + v0x * t + p1.x;
          const y = (2 * p1.y - 2 * p2.y + v0y + v1y) * t3 + (-3 * p1.y + 3 * p2.y - 2 * v0y - v1y) * t2 + v0y * t + p1.y;
          result.push({ x, y });
        }
      }
    }

    return result;
  };

  const smooth = (pts) => {
    if (pts.length < 3) return pts;
    return smoothCatmullRom(pts);
  };

  const rayIntersect = (o, dx, dy, path) => {
    let closest = null, dist = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i], p2 = path[i + 1], sdx = p2.x - p1.x, sdy = p2.y - p1.y;
      const denom = dx * sdy - dy * sdx;
      if (Math.abs(denom) < 0.0001) continue;
      const t = ((p1.x - o.x) * sdy - (p1.y - o.y) * sdx) / denom;
      const s = ((p1.x - o.x) * dy - (p1.y - o.y) * dx) / denom;
      if (t > 0 && s >= 0 && s <= 1) {
        const pt = { x: o.x + t * dx, y: o.y + t * dy };
        const d = Math.sqrt((pt.x - o.x) ** 2 + (pt.y - o.y) ** 2);
        if (d < dist) { dist = d; closest = pt; }
      }
    }
    return closest;
  };

  // --- Common Finalize Functions ---
  const finalizeInnerShape = (path) => {
    if (!path.length) return;
    const center = getCentroid(path);
    const snappedCenter = snapToGrid(center.x, center.y);
    const dx = snappedCenter.x - center.x;
    const dy = snappedCenter.y - center.y;
    const snappedPath = shiftPath(path, dx, dy);

    setPaths(p => ({ ...p, inner: snappedPath }));
    setState(s => ({ ...s, center: snappedCenter }));
    setBezier([]);
  };

  const finalizeOuterShape = (path, customBezier = []) => {
    if (!path.length) return;

    // Eğer çizim Bezier ise veya Hazır Şekil bir Bezier yapısı gönderdiyse düzenleme moduna geç
    if (mode.draw === 'bezier' || customBezier.length > 0) {
      const bezierPointsToSave = customBezier.length > 0 ? customBezier : [...bezier];
      setPaths(p => ({ ...p, outer: path }));
      setState(s => ({
        ...s,
        outerBezierPoints: bezierPointsToSave,
        editingBezierPoints: true,
        finalized: false
      }));
      setBezier(bezierPointsToSave);
    } else {
      setPaths(p => ({ ...p, outer: path }));
      setState(s => ({ ...s, finalized: true, outerBezierPoints: [] }));
      setBezier([]);
    }
  };

  // Bezier Edit Modunu Bitir
  const finishBezierEdit = () => {
    // Güncel bezier noktalarından yeni dış şekli oluştur
    const smoothed = smoothWithSegments(bezier);
    const closed = [...smoothed, smoothed[0]];

    setPaths(p => ({ ...p, outer: closed }));

    // State'i güncelle
    setState(s => ({
      ...s,
      finalized: true,
      editingBezierPoints: false,
      outerBezierPoints: [...bezier] // Yeni pozisyonları kaydet
    }));
    setBezier([]);
  };

  // Dış Sınırı Tekrar Düzenle (Butona basınca)
  const startEditOuter = () => {
    if (!paths.outer.length) return;

    // Eğer daha önce Bezer ile çizildiyse (outerBezierPoints doluysa) düzenlemeyi aç
    if (state.outerBezierPoints.length > 0) {
      setBezier(state.outerBezierPoints);
      setState(s => ({ ...s, finalized: false, editingBezierPoints: true }));
    } else {
      alert("Bu şekil Bezier ile çizilmediği için nokta düzenlemesi yapılamaz.");
      // Eğer gerekirse burada eski 'guides' mantığı da çalıştırılabilir ama istek üzerine iptal edildi.
    }
  };

  // --- Mouse Events ---
  const handleDown = (e) => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      setPan(p => ({ ...p, isPanning: true, start: { x: e.clientX - p.x, y: e.clientY - p.y } }));
      return;
    }
    const c = getCoords(e);

    // --- Bezier Edit Modu ---
    if (state.editingBezierPoints) {
      let min = Infinity, sel = null;
      bezier.forEach((p, i) => {
        const d = Math.sqrt((c.x - p.x) ** 2 + (c.y - p.y) ** 2);
        if (d < 10 / settings.zoom && d < min) { min = d; sel = i; }
      });

      // Shift + Tıklama ile Sharp/Smooth toggle
      if (e.shiftKey && sel !== null) {
        const newBezier = [...bezier];
        const targetPoint = newBezier[sel];
        const newSharpState = !targetPoint.isSharp;

        newBezier[sel] = {
          ...targetPoint,
          isSharp: newSharpState,
          // Eğer yumuşak yapılıyorsa segment tipini de kavisli yap
          segmentType: newSharpState ? targetPoint.segmentType : 'curve'
        };

        // Eğer kavisli (smooth) yapılıyorsa, bi önceki noktanın segment tipini de curve yapabiliriz 
        // ki bu nokta üzerinden geçen hat kavisli olsun
        if (!newSharpState) {
          const prevIdx = (sel - 1 + newBezier.length) % newBezier.length;
          newBezier[prevIdx].segmentType = 'curve';
        }

        setBezier(newBezier);
        return;
      }

      setState(s => ({ ...s, selectedBezierPoint: sel }));
      return;
    }

    // --- Normal Çizim Modu ---
    if (mode.shape) {
      const snappedStart = snapToGrid(c.x, c.y);
      setState(s => ({ ...s, shapeStart: snappedStart }));
      return;
    }

    if (mode.draw === 'bezier') {
      if (bezier.length > 2 && Math.sqrt((c.x - bezier[0].x) ** 2 + (c.y - bezier[0].y) ** 2) < 15 / settings.zoom) {
        // Şekli tamamla - smoothWithSegments kullan
        const curve = smoothWithSegments(bezier);
        const closed = [...curve, curve[0]];
        if (!paths.inner.length) {
          finalizeInnerShape(closed);
        } else {
          finalizeOuterShape(closed); // Bu fonksiyon artık edit moduna sokuyor
        }
        return;
      } else {
        // Yeni nokta ekle - segment tipini de kaydet
        const segmentType = mode.straightLine ? 'straight' : 'curve';
        setBezier(b => [...b, { x: c.x, y: c.y, segmentType }]);
        return;
      }
    }

    if (!paths.inner.length) setDrawing({ active: true, current: [c], type: 'inner' });
    else if (!paths.outer.length && !state.editingBezierPoints) setDrawing({ active: true, current: [c], type: 'outer' });
  };

  const handleMove = (e) => {
    if (pan.isPanning) { setPan(p => ({ ...p, x: e.clientX - p.start.x, y: e.clientY - p.start.y })); return; }

    const c = getCoords(e);

    // --- Bezier Edit Move ---
    if (state.editingBezierPoints && state.selectedBezierPoint !== null) {
      const snappedC = snapToGrid(c.x, c.y);
      const newBezier = [...bezier];
      const point = newBezier[state.selectedBezierPoint];

      // Hareket ettirilen nokta otomatik olarak yumuşar (organikleşir)
      newBezier[state.selectedBezierPoint] = {
        ...point,
        x: snappedC.x,
        y: snappedC.y,
        isSharp: false
      };

      if (point.pointType === 'mid') {
        const prevIdx = (state.selectedBezierPoint - 1 + newBezier.length) % newBezier.length;
        newBezier[prevIdx].segmentType = 'curve';
        newBezier[state.selectedBezierPoint].segmentType = 'curve';
      }

      setBezier(newBezier);
      return;
    }

    // --- Normal Move ---
    if (mode.shape && state.shapeStart) {
      const pts = [];
      if (mode.shape === 'circle') {
        const sz = mmToPx(settings.shapeSize);
        for (let i = 0; i <= 360; i += 2) {
          const a = (i * Math.PI) / 180;
          pts.push({ x: state.shapeStart.x + Math.cos(a) * sz / 2, y: state.shapeStart.y + Math.sin(a) * sz / 2 });
        }
      } else if (mode.shape === 'ellipse') {
        const sw = mmToPx(settings.shapeWidth);
        const sh = mmToPx(settings.shapeHeight);
        for (let i = 0; i <= 360; i += 2) {
          const a = (i * Math.PI) / 180;
          pts.push({ x: state.shapeStart.x + Math.cos(a) * sw / 2, y: state.shapeStart.y + Math.sin(a) * sh / 2 });
        }
      } else if (mode.shape === 'square') {
        const sz = mmToPx(settings.shapeSize);
        const h = sz / 2;
        pts.push({ x: state.shapeStart.x - h, y: state.shapeStart.y - h });
        pts.push({ x: state.shapeStart.x + h, y: state.shapeStart.y - h });
        pts.push({ x: state.shapeStart.x + h, y: state.shapeStart.y + h });
        pts.push({ x: state.shapeStart.x - h, y: state.shapeStart.y + h });
        pts.push({ x: state.shapeStart.x - h, y: state.shapeStart.y - h });
      } else if (mode.shape === 'rectangle') {
        const sw = mmToPx(settings.shapeWidth);
        const sh = mmToPx(settings.shapeHeight);
        const hw = sw / 2;
        const hh = sh / 2;
        pts.push({ x: state.shapeStart.x - hw, y: state.shapeStart.y - hh });
        pts.push({ x: state.shapeStart.x + hw, y: state.shapeStart.y - hh });
        pts.push({ x: state.shapeStart.x + hw, y: state.shapeStart.y + hh });
        pts.push({ x: state.shapeStart.x - hw, y: state.shapeStart.y + hh });
        pts.push({ x: state.shapeStart.x - hw, y: state.shapeStart.y - hh });
      }
      setState(s => ({ ...s, preview: pts }));
      return;
    }
    if (drawing.active) setDrawing(d => ({ ...d, current: [...d.current, c] }));
  };

  const handleUp = () => {
    if (pan.isPanning) { setPan(p => ({ ...p, isPanning: false })); return; }

    // Bezier Edit Up: Seçimi bırak
    if (state.editingBezierPoints) {
      setState(s => ({ ...s, selectedBezierPoint: null }));
      return;
    }

    if (mode.shape && state.preview) {
      let customBezier = [];
      const cx = state.shapeStart.x;
      const cy = state.shapeStart.y;

      if (mode.shape === 'square' || mode.shape === 'rectangle') {
        const w = (mode.shape === 'square' ? settings.shapeSize : settings.shapeWidth);
        const h = (mode.shape === 'square' ? settings.shapeSize : settings.shapeHeight);
        const hw = mmToPx(w) / 2;
        const hh = mmToPx(h) / 2;

        // 8 Noktalı Dikdörtgen (Köşeler + Kenar Ortaları)
        customBezier = [
          { x: cx - hw, y: cy - hh, segmentType: 'straight', pointType: 'corner' },
          { x: cx, y: cy - hh, segmentType: 'straight', pointType: 'mid' },
          { x: cx + hw, y: cy - hh, segmentType: 'straight', pointType: 'corner' },
          { x: cx + hw, y: cy, segmentType: 'straight', pointType: 'mid' },
          { x: cx + hw, y: cy + hh, segmentType: 'straight', pointType: 'corner' },
          { x: cx, y: cy + hh, segmentType: 'straight', pointType: 'mid' },
          { x: cx - hw, y: cy + hh, segmentType: 'straight', pointType: 'corner' },
          { x: cx - hw, y: cy, segmentType: 'straight', pointType: 'mid' }
        ];
      } else if (mode.shape === 'circle' || mode.shape === 'ellipse') {
        const w = (mode.shape === 'circle' ? settings.shapeSize : settings.shapeWidth);
        const h = (mode.shape === 'circle' ? settings.shapeSize : settings.shapeHeight);
        const hw = mmToPx(w) / 2;
        const hh = mmToPx(h) / 2;

        // 8 Noktalı Elips
        customBezier = [
          { x: cx - hw, y: cy, segmentType: 'curve', pointType: 'corner' },
          { x: cx - hw * 0.7, y: cy - hh * 0.7, segmentType: 'curve', pointType: 'mid' },
          { x: cx, y: cy - hh, segmentType: 'curve', pointType: 'corner' },
          { x: cx + hw * 0.7, y: cy - hh * 0.7, segmentType: 'curve', pointType: 'mid' },
          { x: cx + hw, y: cy, segmentType: 'curve', pointType: 'corner' },
          { x: cx + hw * 0.7, y: cy + hh * 0.7, segmentType: 'curve', pointType: 'mid' },
          { x: cx, y: cy + hh, segmentType: 'curve', pointType: 'corner' },
          { x: cx - hw * 0.7, y: cy + hh * 0.7, segmentType: 'curve', pointType: 'mid' }
        ];
      }

      if (!paths.inner.length) {
        finalizeInnerShape(state.preview);
      } else {
        finalizeOuterShape(state.preview, customBezier);
      }
      setMode(m => ({ ...m, shape: null }));
      setState(s => ({ ...s, preview: null, shapeStart: null }));
      return;
    }
    if (drawing.active && drawing.current?.length > 2) {
      const smoothed = smooth(drawing.current), closed = [...smoothed, smoothed[0]];
      if (drawing.type === 'inner') {
        finalizeInnerShape(closed);
      } else {
        finalizeOuterShape(closed);
      }
    }
    setDrawing({ active: false, current: null, type: null });
  };

  const drawPath = (ctx, path, color, width) => {
    if (!path?.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    path.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.stroke();
  };

  const drawDimensions = (ctx, path) => {
    if (!path.length) return;
    const bounds = getBoundsAndCenter(path);
    const wPx = bounds.width;
    const hPx = bounds.height;
    const wMm = (wPx / PIXELS_PER_MM).toFixed(0);
    const hMm = (hPx / PIXELS_PER_MM).toFixed(0);

    const fontSize = 24 / settings.zoom;
    const padding = 30 / settings.zoom;
    const lineLen = 15 / settings.zoom;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Genişlik
    ctx.beginPath();
    ctx.moveTo(bounds.minX - padding, bounds.maxY + padding);
    ctx.lineTo(bounds.maxX + padding, bounds.maxY + padding);
    ctx.moveTo(bounds.minX, bounds.maxY + padding - lineLen); ctx.lineTo(bounds.minX, bounds.maxY + padding + lineLen);
    ctx.moveTo(bounds.maxX, bounds.maxY + padding - lineLen); ctx.lineTo(bounds.maxX, bounds.maxY + padding + lineLen);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2 / settings.zoom;
    ctx.stroke();
    ctx.fillText(`En: ${wMm} mm`, bounds.cx, bounds.maxY + padding + fontSize);

    // Yükseklik
    ctx.beginPath();
    ctx.moveTo(bounds.maxX + padding, bounds.minY - padding);
    ctx.lineTo(bounds.maxX + padding, bounds.maxY + padding);
    ctx.moveTo(bounds.maxX + padding - lineLen, bounds.minY); ctx.lineTo(bounds.maxX + padding + lineLen, bounds.minY);
    ctx.moveTo(bounds.maxX + padding - lineLen, bounds.maxY); ctx.lineTo(bounds.maxX + padding + lineLen, bounds.maxY);
    ctx.stroke();
    ctx.save();
    ctx.translate(bounds.maxX + padding + fontSize, bounds.cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`Boy: ${hMm} mm`, 0, 0);
    ctx.restore();
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(settings.zoom, settings.zoom);

    // Izgara
    if (settings.showGrid) {
      const gridSize = mmToPx(GRID_SIZE_MM);
      const startX = Math.floor((-pan.x / settings.zoom) / gridSize) * gridSize;
      const endX = startX + (canvas.width / settings.zoom) + gridSize;
      const startY = Math.floor((-pan.y / settings.zoom) / gridSize) * gridSize;
      const endY = startY + (canvas.height / settings.zoom) + gridSize;

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1 / settings.zoom;
      ctx.beginPath();
      for (let x = startX; x < endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y < endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    }

    // İç Sınır
    if (paths.inner.length) {
      drawPath(ctx, paths.inner, '#ef4444', 2.5 / settings.zoom);
      if (drawing.current || state.editingBezierPoints) drawDimensions(ctx, paths.inner);
    }

    // Önizlemeler
    if (state.preview) drawPath(ctx, state.preview, '#3b82f6', 2 / settings.zoom);
    if (drawing.current) {
      drawPath(ctx, drawing.current, drawing.type === 'inner' ? '#ef4444' : '#3b82f6', 2 / settings.zoom);
      drawDimensions(ctx, drawing.current);
    }

    // Çizim Anı Bezier Noktaları
    if (mode.draw === 'bezier' && bezier.length) {
      const clr = !paths.inner.length ? '#ef4444' : '#3b82f6';

      // Segmentleri çiz - her segmentin tipine göre farklı stil
      if (bezier.length > 1) {
        for (let i = 0; i < bezier.length; i++) {
          const p1 = bezier[i];
          const p2 = bezier[(i + 1) % bezier.length];

          // Son segment için döngüyü tamamlama (henüz kapalı değil)
          if (i === bezier.length - 1) break;

          // Segment tipine göre renk ve stil
          const isStrait = p1.segmentType === 'straight';
          ctx.strokeStyle = isStrait ? '#f97316' : clr; // Turuncu veya mavi
          ctx.lineWidth = isStrait ? 3 / settings.zoom : 2 / settings.zoom;
          ctx.setLineDash(isStrait ? [] : [5 / settings.zoom]);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Noktaları çiz
      bezier.forEach((p, i) => {
        // Segment tipine göre nokta rengi
        const isNextStraight = p.segmentType === 'straight';
        ctx.fillStyle = isNextStraight ? '#fed7aa' : '#fff'; // Açık turuncu veya beyaz
        ctx.strokeStyle = isNextStraight ? '#f97316' : clr;
        ctx.lineWidth = 2 / settings.zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (i === 0 ? 8 : 6) / settings.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      });
    }

    // --- BEZIER EDIT MODU ÇİZİMİ ---
    if (state.editingBezierPoints) {
      // Eski şekli (silik) çiz
      if (paths.outer.length) {
        ctx.globalAlpha = 0.3;
        drawPath(ctx, paths.outer, '#3b82f6', 2.5 / settings.zoom);
        ctx.globalAlpha = 1.0;
      }

      // Bezier çizgilerini çiz - segment tiplerine göre
      if (bezier.length > 1) {
        // Segmentleri çiz
        for (let i = 0; i < bezier.length; i++) {
          const p1 = bezier[i];
          const p2 = bezier[(i + 1) % bezier.length];

          // Segment tipine göre renk ve stil
          const isStrait = p1.segmentType === 'straight';
          ctx.strokeStyle = isStrait ? '#f97316' : '#3b82f6';
          ctx.lineWidth = isStrait ? 2.5 / settings.zoom : 1.5 / settings.zoom;
          ctx.setLineDash(isStrait ? [] : [5 / settings.zoom]);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Düzenlenecek noktaları çiz
        bezier.forEach((p, i) => {
          const isMid = p.pointType === 'mid';
          ctx.fillStyle = isMid ? '#fbbf24' : '#fff'; // Mid noktası dolu sarı
          ctx.strokeStyle = isMid ? '#d97706' : '#fbbf24';
          ctx.lineWidth = 2 / settings.zoom;
          ctx.beginPath();
          // Köşeler kare, midler yuvarlak olsun ki ayırt edilsin
          if (isMid) {
            ctx.arc(p.x, p.y, 5 / settings.zoom, 0, Math.PI * 2);
          } else {
            const r = 7 / settings.zoom;
            ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
          }
          ctx.stroke();
          ctx.fill();
        });

        // Seçili noktayı vurgula
        if (state.selectedBezierPoint !== null && bezier[state.selectedBezierPoint]) {
          const p = bezier[state.selectedBezierPoint];
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8 / settings.zoom, 0, Math.PI * 2);
          ctx.fill();
        }

        // Önizleme Curve çiz (segment tiplerini dikkate alarak)
        const tempCurve = smoothWithSegments(bezier);
        tempCurve.push(tempCurve[0]);
        drawPath(ctx, tempCurve, '#94a3b8', 2 / settings.zoom);
        drawDimensions(ctx, tempCurve);
      }
    }

    // Finalize Edilmiş Çizim Katmanları
    if (state.finalized && paths.inner.length && paths.outer.length) {
      const c = state.center || getCentroid(paths.inner);
      const layers = Array.from({ length: settings.numLines }, () => []);
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * Math.PI * 2;
        const iHit = rayIntersect(c, Math.cos(a), Math.sin(a), paths.inner);
        const oHit = rayIntersect(c, Math.cos(a), Math.sin(a), paths.outer);
        if (iHit && oHit) {
          for (let l = 1; l <= settings.numLines; l++) {
            const t = l / (settings.numLines + 1);
            layers[l - 1].push({ x: iHit.x + (oHit.x - iHit.x) * t, y: iHit.y + (oHit.y - iHit.y) * t });
          }
        }
      }
      layers.forEach(lay => {
        if (lay.length) {
          const smoothed = smoothCatmullRom(lay, 0.5);
          smoothed.push(smoothed[0]);
          drawPath(ctx, smoothed, '#22c55e', 1.5 / settings.zoom);
        }
      });

      if (paths.outer.length) drawPath(ctx, paths.outer, '#3b82f6', 2.5 / settings.zoom);
      if (paths.outer.length) drawDimensions(ctx, paths.outer);
    }

    ctx.restore();
  };

  // --- Export Logic (Aynı) ---
  const generateLayersForExport = () => {
    const c = state.center || getCentroid(paths.inner);
    const layers = Array.from({ length: settings.numLines }, () => []);
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const iHit = rayIntersect(c, Math.cos(a), Math.sin(a), paths.inner);
      const oHit = rayIntersect(c, Math.cos(a), Math.sin(a), paths.outer);
      if (iHit && oHit) {
        for (let l = 1; l <= settings.numLines; l++) {
          const t = l / (settings.numLines + 1);
          layers[l - 1].push({ x: iHit.x + (oHit.x - iHit.x) * t, y: iHit.y + (oHit.y - iHit.y) * t });
        }
      }
    }
    return layers.map(lay => {
      if (lay.length > 0) {
        const smoothed = smoothCatmullRom(lay, 0.5);
        smoothed.push(smoothed[0]);
        return smoothed;
      }
      return [];
    }).filter(p => p.length > 0);
  };

  const calculateBounds = (pathsList) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pathsList.forEach(path => {
      path.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    const pad = mmToPx(5);
    return {
      minX: minX - pad, maxX: maxX + pad,
      minY: minY - pad, maxY: maxY + pad,
      width: (maxX - minX) + (pad * 2),
      height: (maxY - minY) + (pad * 2)
    };
  };

  const exportDrawing = (type) => {
    try {
      if (!state.finalized || !paths.inner.length || !paths.outer.length) {
        return alert('Lütfen önce çizimi "Bitir" butonu ile tamamlayın.');
      }
      const layers = generateLayersForExport();
      const allPaths = [paths.inner, paths.outer, ...layers];
      const bounds = calculateBounds(allPaths);

      const widthMM = bounds.width / PIXELS_PER_MM;
      const heightMM = bounds.height / PIXELS_PER_MM;

      if (type === 'PNG') {
        const scale = 4; // 4x Çözünürlük (Ultra HD)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bounds.width * scale;
        tempCanvas.height = bounds.height * scale;
        const ctx = tempCanvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-bounds.minX, -bounds.minY);

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        allPaths.forEach(path => {
          if (!path?.length) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        });
        ctx.restore();

        const link = document.createElement('a');
        link.download = 'kontur_cizim_hq.png';
        link.href = tempCanvas.toDataURL('image/png', 1.0);
        link.click();

      } else if (type === 'DXF') {
        let dxf = '0\nSECTION\n2\nENTITIES\n';
        allPaths.forEach(path => {
          if (path.length < 2) return;
          dxf += '0\nLWPOLYLINE\n90\n' + path.length + '\n70\n1\n';
          path.forEach(p => {
            // Hassasiyeti 6 basamağa çıkardım
            dxf += '10\n' + ((p.x - bounds.minX) / PIXELS_PER_MM).toFixed(6) + '\n';
            dxf += '20\n' + ((p.y - bounds.minY) / PIXELS_PER_MM).toFixed(6) + '\n';
          });
        });
        dxf += '0\nENDSEC\n0\nEOF';
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'kontur_cizim_hassas.dxf';
        link.click();

      } else if (type === 'PDF') {
        const pdf = new jsPDF({
          orientation: widthMM > heightMM ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [widthMM, heightMM]
        });

        // Gerçek Vektör Çizimi (Sonsuz Kalite)
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.1); // Saç teli kalınlığında hassas vektör

        allPaths.forEach(path => {
          if (path.length < 2) return;
          const pts = path.map(p => [
            (p.x - bounds.minX) / PIXELS_PER_MM,
            (p.y - bounds.minY) / PIXELS_PER_MM
          ]);

          for (let i = 0; i < pts.length - 1; i++) {
            pdf.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
          }
          // Kapat
          pdf.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
        });

        pdf.save('kontur_cizim_vektor.pdf');
      }
    } catch (err) {
      console.error(err);
      alert('İndirme sırasında bir hata oluştu: ' + err.message);
    }
  };


  const saveProject = () => {
    const projectData = {
      version: '1.0',
      paths,
      settings,
      pan,
      mode,
      bezier,
      state: {
        finalized: state.finalized,
        center: state.center,
        outerBezierPoints: state.outerBezierPoints,
        editingBezierPoints: state.editingBezierPoints
      },
      theme,
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `proje_${new Date().getTime()}.ercx`;
    link.click();
  };

  const loadProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // State'leri geri yükle
        setPaths(data.paths);
        setSettings(data.settings);
        setPan(data.pan);
        setMode(data.mode);
        setBezier(data.bezier);
        setTheme(data.theme || 'light');
        setState(s => ({
          ...s,
          ...data.state
        }));

        alert('Proje başarıyla yüklendi.');
      } catch (err) {
        console.error(err);
        alert('Dosya okunurken bir hata oluştu. Lütfen geçerli bir .ercx dosyası seçin.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div>
            <h1>İç İçe Kontur Çizgileri</h1>
            <p className="text-small text-muted">2100x2100mm Alan • 25mm Grid</p>
          </div>
        </div>

        <div className="header-center">
          <button onClick={() => setSettings(s => ({ ...s, showGrid: !s.showGrid }))} className={`btn btn-sm ${settings.showGrid ? 'btn-active' : ''}`}>
            <Grid3x3 size={16} /> {settings.showGrid ? 'Grid Açık' : 'Grid Kapalı'}
          </button>

          <div className="header-line-settings">
            <label className="text-small text-muted">Çizgi: {settings.numLines}</label>
            <input
              type="range"
              min="1"
              max="100"
              value={settings.numLines}
              onChange={(e) => setSettings(s => ({ ...s, numLines: +e.target.value }))}
              style={{ width: '80px' }}
            />
          </div>

          <div className="btn-group">
            <button onClick={() => setSettings(s => ({ ...s, zoom: Math.min(s.zoom * 1.2, 5) }))} disabled={state.editingBezierPoints} className="btn btn-icon">
              <ZoomIn size={18} />
            </button>
            <button onClick={() => setSettings(s => ({ ...s, zoom: Math.max(s.zoom / 1.2, 0.05) }))} disabled={state.editingBezierPoints} className="btn btn-icon">
              <ZoomOut size={18} />
            </button>
            <button onClick={() => { setSettings(s => ({ ...s, zoom: 0.15 })); setPan(p => ({ ...p, x: 200, y: 200 })); }} disabled={state.editingBezierPoints} className="btn btn-icon">
              <Maximize2 size={18} />
            </button>
          </div>
        </div>

        <div className="header-right">
          <label className="btn btn-sm" style={{ cursor: 'pointer' }} title="Proje Yükle (.ercx)">
            <Upload size={16} /> Yükle
            <input type="file" accept=".ercx" onChange={loadProject} style={{ display: 'none' }} />
          </label>

          <div className="dropdown" ref={dropdownRef}>
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="btn btn-primary btn-sm dropdown-toggle"
            >
              <Share2 size={16} /> Paylaş & Dışa Aktar <ChevronDown size={14} />
            </button>

            {isExportOpen && (
              <div className="dropdown-menu">
                <button onClick={() => { saveProject(); setIsExportOpen(false); }} className="dropdown-item">
                  <Save size={16} /> Projeyi Kaydet (.ercx)
                </button>
                <div className="dropdown-divider"></div>
                <button
                  onClick={() => { exportDrawing('PNG'); setIsExportOpen(false); }}
                  disabled={!state.finalized}
                  className="dropdown-item"
                >
                  <FileImage size={16} /> PNG (Resim)
                </button>
                <button
                  onClick={() => { exportDrawing('PDF'); setIsExportOpen(false); }}
                  disabled={!state.finalized}
                  className="dropdown-item"
                >
                  <FileText size={16} /> PDF (Vektör)
                </button>
                <button
                  onClick={() => { exportDrawing('DXF'); setIsExportOpen(false); }}
                  disabled={!state.finalized}
                  className="dropdown-item"
                >
                  <Box size={16} /> DXF (CNC/CAD)
                </button>
              </div>
            )}
          </div>

          <button onClick={toggleTheme} className="btn btn-icon" title="Tema Değiştir">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="app-content">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Çizim Modları */}
          <section className="sidebar-section">
            <h3>Çizim Modları</h3>
            <div className="sidebar-section-content">
              <button
                onClick={() => { setMode(m => ({ ...m, draw: 'freehand' })); setBezier([]); }}
                disabled={state.editingBezierPoints}
                className={`btn btn-full ${mode.draw === 'freehand' ? 'btn-primary' : ''}`}>
                ✏️ Serbest Çizim
              </button>
              <button
                onClick={() => { setMode(m => ({ ...m, draw: 'bezier' })); setBezier([]); }}
                disabled={state.editingBezierPoints}
                className={`btn btn-full ${mode.draw === 'bezier' ? 'btn-primary' : ''}`}>
                📐 Bezier Eğrisi
              </button>
              <button
                onClick={() => setMode(m => ({ ...m, straightLine: !m.straightLine }))}
                disabled={state.editingBezierPoints || mode.draw !== 'bezier'}
                className={`btn btn-full ${mode.straightLine ? 'btn-warning' : ''}`}>
                📏 Düz Çizgi {mode.straightLine ? '(Aktif)' : ''}
              </button>
            </div>
          </section>

          {/* Hazır Şekiller */}
          <section className="sidebar-section">
            <h3>Hazır Şekiller</h3>
            <div className="sidebar-section-content">
              {/* Boyut Ayarları - Dinamik */}
              {(mode.shape === 'circle' || mode.shape === 'square' || !mode.shape) && (
                <div className="form-group">
                  <label className="form-label">Boyut (mm)</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={settings.shapeSize}
                    onChange={(e) => setSettings(s => ({ ...s, shapeSize: +e.target.value }))}
                    className="form-input"
                  />
                </div>
              )}

              {(mode.shape === 'ellipse' || mode.shape === 'rectangle') && (
                <div className="flex-col gap-sm">
                  <div className="form-group">
                    <label className="form-label">En (mm)</label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={settings.shapeWidth}
                      onChange={(e) => setSettings(s => ({ ...s, shapeWidth: +e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Boy (mm)</label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={settings.shapeHeight}
                      onChange={(e) => setSettings(s => ({ ...s, shapeHeight: +e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              <div className="btn-grid">
                <button
                  onClick={() => setMode(m => ({ ...m, shape: 'circle' }))}
                  disabled={state.editingBezierPoints}
                  className={`btn ${mode.shape === 'circle' ? 'btn-primary' : ''}`}>
                  ⭕ Daire
                </button>
                <button
                  onClick={() => setMode(m => ({ ...m, shape: 'square' }))}
                  disabled={state.editingBezierPoints}
                  className={`btn ${mode.shape === 'square' ? 'btn-primary' : ''}`}>
                  ⬜ Kare
                </button>
                <button
                  onClick={() => setMode(m => ({ ...m, shape: 'ellipse' }))}
                  disabled={state.editingBezierPoints}
                  className={`btn ${mode.shape === 'ellipse' ? 'btn-primary' : ''}`}>
                  🥚 Elips
                </button>
                <button
                  onClick={() => setMode(m => ({ ...m, shape: 'rectangle' }))}
                  disabled={state.editingBezierPoints}
                  className={`btn ${mode.shape === 'rectangle' ? 'btn-primary' : ''}`}>
                  ▭ Dikdörtgen
                </button>
              </div>
            </div>
          </section>

          {/* Düzenleme & Kontroller */}
          <section className="sidebar-section">
            <h3>Kontroller</h3>
            <div className="sidebar-section-content">
              {state.editingBezierPoints && (
                <div className="alert alert-warning">
                  <div className="alert-title">BEZİER DÜZENLEME</div>
                  <div className="alert-text">Noktaları sürükleyerek şekli düzenleyin. Grid'e otomatik yapışır.</div>
                  <button onClick={finishBezierEdit} className="btn btn-success btn-full">
                    Çizimi Bitir
                  </button>
                </div>
              )}

              {state.finalized && paths.outer.length && !state.editingBezierPoints && (
                <button onClick={startEditOuter} className="btn btn-info btn-full">
                  <Edit3 size={16} /> Dış Sınırı Düzenle
                </button>
              )}

              <div className="divider"></div>

              <button
                onClick={() => setPaths(p => ({ ...p, inner: [] }))}
                disabled={!paths.inner.length || state.editingBezierPoints}
                className="btn btn-full">
                <Trash2 size={16} /> İç Sınırı Sil
              </button>
              <button
                onClick={() => { setPaths(p => ({ ...p, outer: [] })); setGuides({ lines: [], editing: false, selected: null }); setState(s => ({ ...s, finalized: false, editingBezierPoints: false, outerBezierPoints: [] })); }}
                disabled={!paths.outer.length && !state.editingBezierPoints}
                className="btn btn-full">
                <Trash2 size={16} /> Dış Sınırı Sil
              </button>
              <button
                onClick={() => { setPaths({ inner: [], outer: [] }); setGuides({ lines: [], editing: false, selected: null }); setState({ finalized: false, center: null, preview: null, shapeStart: null, editingBezierPoints: false, outerBezierPoints: [] }); setBezier([]); }}
                className="btn btn-danger btn-full">
                <RotateCcw size={16} /> Tümünü Temizle
              </button>
            </div>
          </section>
        </aside>

        {/* Canvas Area */}
        <main className="canvas-container">
          <div className="canvas-wrapper">
            <canvas
              ref={canvasRef}
              width={CANVAS_DISPLAY_WIDTH}
              height={CANVAS_DISPLAY_HEIGHT}
              onMouseDown={handleDown}
              onMouseMove={handleMove}
              onMouseUp={handleUp}
              onMouseLeave={handleUp}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                display: 'block',
                cursor: pan.isPanning ? 'grabbing' : state.editingBezierPoints ? 'pointer' : 'crosshair'
              }}
            />
          </div>

          <div className="canvas-instructions">
            <div>1. İç sınırı çiz</div>
            <div>2. Dış sınırı Bezier veya Şekillerle çiz</div>
            <div>3. <b>Shift + Tıklama:</b> Köşeyi Keskin/Yumuşak yap</div>
            <div>4. Noktaları sürükleyerek düzenle</div>
            <div>5. Bitir & İndir</div>
          </div>
        </main>
      </div>
    </div>
  );
}
