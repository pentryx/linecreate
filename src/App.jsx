import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, Trash2, ZoomIn, ZoomOut, Maximize2, FileImage, FileText, Box, Edit3, Upload, Save, Circle, Square } from 'lucide-react';
import { jsPDF } from 'jspdf';

export default function ContourDrawer() {
  // --- STYLE OBJECT ---
  const s = {
    root: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#0f172a', color: '#e2e8f0', overflow: 'hidden' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: '70px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', boxSizing: 'border-box', flexShrink: 0 },
    headerTitle: { fontSize: '1.25rem', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' },
    headerSubtitle: { fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'normal' },
    // DÜZELTME: Buradaki tırnak işaretleri kontrol edildi
    headerControls: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px', backgroundColor: '#334155', borderRadius: '8px', border: '1px solid #475569' },
    headerInputGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
    headerInput: { width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.9rem', textAlign: 'center' },
    headerLabel: { fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '500' },
    toolbar: { display: 'flex', gap: '10px', alignItems: 'center' },
    mainArea: { display: 'flex', flex: 1, overflow: 'hidden' },
    sidebar: { width: '280px', backgroundColor: '#1e293b', borderRight: '1px solid #334155', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', flexShrink: 0 },
    group: { display: 'flex', flexDirection: 'column', gap: '10px' },
    groupTitle: { fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '5px' },
    input: { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' },
    label: { fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '4px', display: 'block' },
    inputRow: { display: 'flex', gap: '10px' },
    btn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '6px', border: 'none', fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s', color: '#fff', outline: 'none' },
    btnDefault: { backgroundColor: '#334155' },
    btnDefaultHover: { backgroundColor: '#475569' },
    btnPrimary: { backgroundColor: '#4f46e5' },
    btnActive: { backgroundColor: '#4f46e5', boxShadow: '0 0 0 2px #6366f1', borderColor: '#6366f1' },
    btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
    canvasWrapper: { flex: 1, backgroundColor: '#e2e8f0', position: 'relative', overflow: 'hidden', cursor: 'crosshair' },
    canvas: { display: 'block', backgroundColor: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
    overlayInfo: { position: 'absolute', top: '20px', left: '20px', backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(4px)', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '0.8rem', color: '#334155', pointerEvents: 'none' },
    divider: { height: '1px', backgroundColor: '#334155', width: '100%', margin: '10px 0' }
  };

  const getBtnStyle = (isActive, isDisabled, type = 'default') => {
    if (isDisabled) return { ...s.btn, ...s.btnDisabled };
    if (isActive) return { ...s.btn, ...s.btnActive };
    if (type === 'primary') return { ...s.btn, ...s.btnPrimary };
    return { ...s.btn, ...s.btnDefault, ':hover': s.btnDefaultHover };
  };

  // --- REFS & STATE ---
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [guides, setGuides] = useState({ lines: [], editing: false, selected: null }); // Önceki sürümden kalan, kullanımı kaldırıldı ama saklandı

  const [paths, setPaths] = useState({ inner: [], outer: [] });
  const [drawing, setDrawing] = useState({ active: false, current: null, type: null });
  const [settings, setSettings] = useState({ 
    numLines: 35, shapeSize: 100, zoom: 0.3, showGrid: true, 
    ellipseW: 200, ellipseH: 120 
  });
  const [pan, setPan] = useState({ x: 100, y: 100, isPanning: false, start: { x: 0, y: 0 } });
  const [mode, setMode] = useState({ draw: 'freehand', shape: null }); 
  const [bezier, setBezier] = useState([]);
  
  const [state, setState] = useState({ 
    finalized: false, center: null, preview: null, shapeStart: null, 
    editingOuter: false, outerBezierPoints: [], editingBezierPoints: false, selectedBezierPoint: null 
  });
  
  const CANVAS_SIZE_MM = 2100;
  const GRID_SIZE_MM = 25;
  const PIXELS_PER_MM = 3.7795275591;
  const mmToPx = (mm) => mm * PIXELS_PER_MM;
  const LOGICAL_WIDTH = mmToPx(CANVAS_SIZE_MM);
  const LOGICAL_HEIGHT = mmToPx(CANVAS_SIZE_MM);

  // --- HELPER FUNCTIONS (MATH & LOGIC) ---
  const snapToGrid = (x, y) => {
    const step = mmToPx(GRID_SIZE_MM);
    return { x: Math.round(x / step) * step, y: Math.round(y / step) * step };
  };

  const shiftPath = (path, dx, dy) => path.map(p => ({ x: p.x + dx, y: p.y + dy }));

  const getCentroid = (pts) => { 
    if (!pts.length) return { x: 0, y: 0 }; 
    let sx = 0, sy = 0; 
    pts.forEach(p => { sx += p.x; sy += p.y; }); 
    return { x: sx / pts.length, y: sy / pts.length }; 
  };
  
  const smoothCatmullRom = (pts, tension = 0.5) => {
    if (pts.length < 3) return pts;
    const result = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const p3 = pts[(i + 2) % pts.length];
      for (let t = 0; t < 1; t += 1 / 30) {
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

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return {x:0, y:0};
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x: (x - pan.x) / settings.zoom, y: (y - pan.y) / settings.zoom };
  };

  const generateEllipsePoints = (center, wMm, hMm) => {
    const pts = [];
    const rx = mmToPx(wMm) / 2;
    const ry = mmToPx(hMm) / 2;
    for (let i = 0; i <= 360; i += 2) {
      const a = (i * Math.PI) / 180;
      pts.push({ x: center.x + rx * Math.cos(a), y: center.y + ry * Math.sin(a) });
    }
    return pts;
  };

  const finalizeInnerShape = (path) => {
    if (!path.length) return;
    const center = getCentroid(path);
    const snappedCenter = snapToGrid(center.x, center.y);
    const snappedPath = shiftPath(path, snappedCenter.x - center.x, snappedCenter.y - center.y);
    setPaths(p => ({ ...p, inner: snappedPath }));
    setState(st => ({ ...st, center: snappedCenter }));
    setBezier([]);
  };

  const finalizeOuterShape = (path) => {
    if (!path.length) return;
    if (mode.draw === 'bezier') {
      const pointsToSave = [...bezier];
      setPaths(p => ({ ...p, outer: path }));
      setState(st => ({ ...st, outerBezierPoints: pointsToSave, editingBezierPoints: true, finalized: false }));
      setBezier(pointsToSave);
    } else {
      setPaths(p => ({ ...p, outer: path }));
      setState(st => ({ ...st, finalized: true, outerBezierPoints: [] }));
      setBezier([]);
    }
  };

  const finishBezierEdit = () => {
    const smoothed = smoothCatmullRom(bezier);
    const closed = [...smoothed, smoothed[0]];
    setPaths(p => ({ ...p, outer: closed }));
    setState(st => ({ ...st, finalized: true, editingBezierPoints: false, outerBezierPoints: [...bezier] }));
    setBezier([]);
  };

  const startEditOuter = () => {
    if (state.outerBezierPoints.length > 0) {
      setBezier(state.outerBezierPoints);
      setState(st => ({ ...st, finalized: false, editingBezierPoints: true }));
    } else alert("Düzenleme için Bezier kaydı yok.");
  };

  // --- DRAWING FUNCTIONS ---
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

    // Grid
    if (settings.showGrid) {
      const gridSize = mmToPx(GRID_SIZE_MM);
      const startX = Math.floor((-pan.x / settings.zoom) / gridSize) * gridSize;
      const endX = startX + (canvas.width / settings.zoom) + gridSize;
      const startY = Math.floor((-pan.y / settings.zoom) / gridSize) * gridSize;
      const endY = startY + (canvas.height / settings.zoom) + gridSize;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1 / settings.zoom;
      ctx.beginPath();
      for (let x = startX; x < endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y < endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    }

    // Paths
    if (paths.inner.length) drawPath(ctx, paths.inner, '#ef4444', 3 / settings.zoom);
    if (state.preview) drawPath(ctx, state.preview, '#3b82f6', 2 / settings.zoom);
    if (drawing.current) drawPath(ctx, drawing.current, drawing.type === 'inner' ? '#ef4444' : '#3b82f6', 2 / settings.zoom);
    
    // Bezier Points
    if (mode.draw === 'bezier' && bezier.length) {
      const clr = !paths.inner.length ? '#ef4444' : '#3b82f6';
      if (bezier.length > 1) {
        ctx.strokeStyle = clr; ctx.lineWidth = 2 / settings.zoom; ctx.setLineDash([5 / settings.zoom]);
        ctx.beginPath(); ctx.moveTo(bezier[0].x, bezier[0].y);
        bezier.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
      }
      bezier.forEach((p, i) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = clr; ctx.lineWidth = 2 / settings.zoom;
        ctx.beginPath(); ctx.arc(p.x, p.y, (i === 0 ? 8 : 6) / settings.zoom, 0, Math.PI * 2);
        ctx.stroke(); ctx.fill();
      });
    }

    // Bezier Edit Mode
    if (state.editingBezierPoints) {
      if (paths.outer.length) { ctx.globalAlpha = 0.3; drawPath(ctx, paths.outer, '#3b82f6', 2.5 / settings.zoom); ctx.globalAlpha = 1.0; }
      if (bezier.length > 1) {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5 / settings.zoom; ctx.setLineDash([5 / settings.zoom]);
        ctx.beginPath(); ctx.moveTo(bezier[0].x, bezier[0].y);
        bezier.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
        bezier.forEach((p, i) => {
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2 / settings.zoom;
          ctx.beginPath(); ctx.arc(p.x, p.y, (i === 0 ? 8 : 6) / settings.zoom, 0, Math.PI * 2);
          ctx.stroke(); ctx.fill();
        });
        if (state.selectedBezierPoint !== null && bezier[state.selectedBezierPoint]) {
           ctx.fillStyle = '#fbbf24'; ctx.beginPath();
           ctx.arc(bezier[state.selectedBezierPoint].x, bezier[state.selectedBezierPoint].y, 8 / settings.zoom, 0, Math.PI * 2);
           ctx.fill();
        }
        const tempCurve = smoothCatmullRom(bezier);
        tempCurve.push(tempCurve[0]);
        drawPath(ctx, tempCurve, '#94a3b8', 2 / settings.zoom);
      }
    }
    
    // Finalized Layers
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
      if (paths.outer.length) drawPath(ctx, paths.outer, '#3b82f6', 3 / settings.zoom);
    }
    ctx.restore();
  };

  useEffect(() => { drawCanvas(); }, [paths, drawing, settings, pan, mode, bezier, guides, state]);

  // --- EVENT HANDLERS ---
  const handleDown = (e) => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      setPan(p => ({ ...p, isPanning: true, start: { x: e.clientX - p.x, y: e.clientY - p.y } }));
      return;
    }
    const c = getCoords(e);
    if (state.editingBezierPoints) {
      let min = Infinity, sel = null;
      bezier.forEach((p, i) => {
        const d = Math.sqrt((c.x - p.x) ** 2 + (c.y - p.y) ** 2);
        if (d < 10 / settings.zoom && d < min) { min = d; sel = i; }
      });
      setState(st => ({ ...st, selectedBezierPoint: sel }));
      return;
    }
    if (mode.shape) {
      setState(st => ({ ...st, shapeStart: snapToGrid(c.x, c.y) }));
      return;
    }
    if (mode.draw === 'bezier') {
      if (bezier.length > 2 && Math.sqrt((c.x - bezier[0].x) ** 2 + (c.y - bezier[0].y) ** 2) < 15 / settings.zoom) {
        const curve = smoothCatmullRom(bezier);
        const closed = [...curve, curve[0]];
        if (!paths.inner.length) finalizeInnerShape(closed);
        else finalizeOuterShape(closed);
        return;
      } else {
        setBezier(b => [...b, c]);
        return;
      }
    }
    if (!paths.inner.length) setDrawing({ active: true, current: [c], type: 'inner' });
    else if (!paths.outer.length && !state.editingBezierPoints) setDrawing({ active: true, current: [c], type: 'outer' });
  };

  const handleMove = (e) => {
    if (pan.isPanning) { setPan(p => ({ ...p, x: e.clientX - p.start.x, y: e.clientY - p.start.y })); return; }
    const c = getCoords(e);
    if (state.editingBezierPoints && state.selectedBezierPoint !== null) {
      const newBezier = [...bezier];
      newBezier[state.selectedBezierPoint] = snapToGrid(c.x, c.y);
      setBezier(newBezier);
      return;
    }
    if (mode.shape && state.shapeStart) {
      const pts = [];
      if (mode.shape === 'circle') {
        const r = mmToPx(settings.shapeSize) / 2;
        for (let i = 0; i <= 360; i += 2) pts.push({ x: state.shapeStart.x + Math.cos(i * Math.PI / 180) * r, y: state.shapeStart.y + Math.sin(i * Math.PI / 180) * r });
      } else if (mode.shape === 'square') {
        const h = mmToPx(settings.shapeSize) / 2;
        pts.push({x: state.shapeStart.x - h, y: state.shapeStart.y - h}, {x: state.shapeStart.x + h, y: state.shapeStart.y - h}, {x: state.shapeStart.x + h, y: state.shapeStart.y + h}, {x: state.shapeStart.x - h, y: state.shapeStart.y + h}, {x: state.shapeStart.x - h, y: state.shapeStart.y - h});
      } else if (mode.shape === 'ellipse') {
         pts.push(...generateEllipsePoints(state.shapeStart, settings.ellipseW, settings.ellipseH));
      }
      setState(st => ({ ...st, preview: pts }));
      return;
    }
    if (drawing.active) setDrawing(d => ({ ...d, current: [...d.current, c] }));
  };

  const handleUp = () => {
    if (pan.isPanning) { setPan(p => ({ ...p, isPanning: false })); return; }
    if (state.editingBezierPoints) { setState(st => ({ ...st, selectedBezierPoint: null })); return; }
    
    if (mode.shape && state.preview) {
      if (!paths.inner.length) finalizeInnerShape(state.preview);
      else finalizeOuterShape(state.preview);
      setMode(m => ({ ...m, shape: null }));
      setState(st => ({ ...st, preview: null, shapeStart: null }));
      return;
    }

    if (drawing.active && drawing.current?.length > 2) {
      const smoothed = smoothCatmullRom(drawing.current);
      const closed = [...smoothed, smoothed[0]];
      if (drawing.type === 'inner') finalizeInnerShape(closed);
      else finalizeOuterShape(closed);
    }
    setDrawing({ active: false, current: null, type: null });
  };

  // --- FILE & EXPORT ---
  const saveAsErcx = () => {
    if (!paths.inner.length) return alert("Kaydedilecek bir çizim yok.");
    const dataToSave = {
      version: "1.0", timestamp: new Date().toISOString(),
      paths: paths,
      settings: { numLines: settings.numLines, shapeSize: settings.shapeSize, ellipseW: settings.ellipseW, ellipseH: settings.ellipseH },
      appState: { finalized: state.finalized, center: state.center, outerBezierPoints: state.outerBezierPoints }
    };
    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cizim_${new Date().getTime()}.ercx`;
    link.click();
  };

  const handleFileLoad = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedData = JSON.parse(event.target.result);
        if (!loadedData.paths || !loadedData.paths.inner) throw new Error("Dosya bozuk.");
        setPaths(loadedData.paths);
        setSettings(p => ({ 
          ...p, 
          numLines: loadedData.settings?.numLines || p.numLines, 
          ellipseW: loadedData.settings?.ellipseW || 200,
          ellipseH: loadedData.settings?.ellipseH || 120
        }));
        setState(s => ({ ...s, finalized: loadedData.appState?.finalized || false, center: loadedData.appState?.center || null, outerBezierPoints: loadedData.appState?.outerBezierPoints || [] }));
        setBezier([]);
        setPan({ x: 100, y: 100, isPanning: false, start: { x: 0, y: 0 } });
        setSettings(p => ({ ...p, zoom: 0.3 }));
        alert("Yüklendi.");
      } catch (err) { alert("Hata: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportDrawing = (type) => {
    if (!state.finalized) return alert('Çizimi bitirin.');
    const layers = Array.from({ length: settings.numLines }, () => []);
    const c = state.center || getCentroid(paths.inner);
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
    const processedLayers = layers.map(lay => {
      if (lay.length > 0) { const s = smoothCatmullRom(lay, 0.5); s.push(s[0]); return s; }
      return [];
    }).filter(p => p.length > 0);
    const allPaths = [paths.inner, paths.outer, ...processedLayers];
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allPaths.forEach(path => path.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }));
    const pad = mmToPx(5);
    const bounds = { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad, width: (maxX - minX) + (pad*2), height: (maxY - minY) + (pad*2) };

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.width;
    tempCanvas.height = bounds.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.translate(-bounds.minX, -bounds.minY);
    allPaths.forEach(path => {
      if (!path?.length) return;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.closePath(); ctx.stroke();
    });

    if (type === 'PNG') { const l = document.createElement('a'); l.download = 'cizim.png'; l.href = tempCanvas.toDataURL(); l.click(); }
    else if (type === 'DXF') {
       let dxf = '0\nSECTION\n2\nENTITIES\n';
       allPaths.forEach(path => {
         if(path.length < 2) return;
         dxf += '0\nLWPOLYLINE\n90\n' + path.length + '\n70\n1\n';
         path.forEach(p => { dxf += '10\n' + (p.x / PIXELS_PER_MM).toFixed(4) + '\n20\n' + (p.y / PIXELS_PER_MM).toFixed(4) + '\n'; });
       });
       dxf += '0\nENDSEC\n0\nEOF';
       const b = new Blob([dxf], { type: 'application/dxf' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'cizim.dxf'; l.click();
    }
    else if (type === 'PDF') {
      const w = bounds.width / PIXELS_PER_MM, h = bounds.height / PIXELS_PER_MM;
      const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'mm', format: [w, h] });
      pdf.addImage(tempCanvas.toDataURL(), 'PNG', 0, 0, w, h); pdf.save('cizim.pdf');
    }
  };

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.headerTitle}>
          <span>Kontur Çizici</span>
          <span style={s.headerSubtitle}>v0.1.8 | by Ercxxx </span>
        </div>

        <div style={s.headerControls}>
		  <div>
			<button onClick={() => setSettings(st => ({...st, showGrid: !st.showGrid}))} style={{ ...getBtnStyle(settings.showGrid, false), justifyContent: 'flex-start' }}>
              <div style={{width: 16, height: 16, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #94a3b8', borderRadius:'2px', background: settings.showGrid ? '#fff' : 'transparent'}}>
                 <div style={{width:'10px', height:'10px', border:'1px dotted #64748b'}}></div>
              </div>
              {settings.showGrid ? 'Grid Açık' : 'Grid Kapalı'}
            </button>
		  </div>
          <div style={{width:'1px', height:'24px', backgroundColor:'rgba(255,255,255,0.2)'}}></div>
          <div style={{display:'flex', gap:'5px'}}>
            <button onClick={() => setSettings(st => ({...st, zoom: Math.min(st.zoom*1.2, 5)}))} style={{...s.btn, ...s.btnDefault, padding: '6px'}}><ZoomIn size={16} /></button>
            <button onClick={() => setSettings(st => ({...st, zoom: Math.max(st.zoom/1.2, 0.05)}))} style={{...s.btn, ...s.btnDefault, padding: '6px'}}><ZoomOut size={16} /></button>
            <button onClick={() => { setSettings(st => ({...st, zoom: 0.3})); setPan(p => ({...p, x: 100, y: 100})); }} style={{...s.btn, ...s.btnDefault, padding: '6px'}}><Maximize2 size={16} /></button>
          </div>
          <div style={{width:'1px', height:'24px', backgroundColor:'rgba(255,255,255,0.2)'}}></div>
          <div style={s.headerInputGroup}>
            <label style={s.headerLabel}>Kontur Sayısı:</label>
            <input 
              type="number" 
              min="1" 
              max="100" 
              value={settings.numLines} 
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val > 0 && val <= 200) setSettings(st => ({ ...st, numLines: val }));
              }}
              style={s.headerInput} 
            />
          </div>
        </div>

        <div style={s.toolbar}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".ercx" onChange={handleFileLoad} />
          <button onClick={() => fileInputRef.current.click()} style={{...s.btn, ...s.btnPrimary, padding: '8px 16px'}}><Upload size={16} /> Yükle</button>
          <button onClick={saveAsErcx} disabled={!paths.inner.length} style={getBtnStyle(false, !paths.inner.length)}><Save size={16} /> Projeyi Kaydet</button>
          <div style={{ width: '1px', height: '20px', backgroundColor: '#475569', margin: '0 10px' }}></div>
          <button onClick={() => exportDrawing('PNG')} disabled={!state.finalized} style={getBtnStyle(false, !state.finalized)}><FileImage size={16} /></button>
          <button onClick={() => exportDrawing('PDF')} disabled={!state.finalized} style={getBtnStyle(false, !state.finalized)}><FileText size={16} /></button>
          <button onClick={() => exportDrawing('DXF')} disabled={!state.finalized} style={getBtnStyle(false, !state.finalized)}><Box size={16} /></button>
        </div>
      </div>

      <div style={s.mainArea}>
        <div style={s.sidebar}>
          <div style={s.group}>
            <div style={s.groupTitle}>ÇİZİM MODU</div>
            <button onClick={() => { setMode(m => ({ ...m, draw: 'freehand' })); setBezier([]); }} disabled={state.editingBezierPoints} style={getBtnStyle(mode.draw === 'freehand', state.editingBezierPoints)}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff' }}></div> Serbest Çizim
            </button>
            <button onClick={() => { setMode(m => ({ ...m, draw: 'bezier' })); setBezier([]); }} disabled={state.editingBezierPoints} style={getBtnStyle(mode.draw === 'bezier', state.editingBezierPoints)}>
              <div style={{ width: 16, height: 16, border: '2px solid #fff', borderRadius: 0, transform: 'rotate(45deg)' }}></div> Bezier Eğrisi
            </button>
          </div>

          <div style={s.divider}></div>

          <div style={s.group}>
            <div style={s.groupTitle}>HAZIR ŞEKİLLER</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button onClick={() => setMode(m => ({ ...m, shape: 'circle' }))} disabled={state.editingBezierPoints} style={getBtnStyle(mode.shape === 'circle', state.editingBezierPoints)}><Circle size={18} style={{marginRight:5}}/> Daire</button>
              <button onClick={() => setMode(m => ({ ...m, shape: 'square' }))} disabled={state.editingBezierPoints} style={getBtnStyle(mode.shape === 'square', state.editingBezierPoints)}><Square size={18} style={{marginRight:5}}/> Kare</button>
              <button onClick={() => setMode(m => ({ ...m, shape: 'ellipse' }))} disabled={state.editingBezierPoints} style={getBtnStyle(mode.shape === 'ellipse', state.editingBezierPoints)}><Circle size={18} style={{marginRight:5, transform:'scaleX(1.5)'}}/> Elips</button>
            </div>
            
            {mode.shape && (
              <div style={{ marginTop: '10px', backgroundColor: '#1e293b', padding: '10px', borderRadius: '6px', border: '1px solid #334155' }}>
                {mode.shape === 'circle' || mode.shape === 'square' ? (
                  <div>
                     <label style={s.label}>Çap / Kenar (mm)</label>
                     <input type="number" value={settings.shapeSize} onChange={e => setSettings(st => ({...st, shapeSize: +e.target.value}))} style={s.input} />
                  </div>
                ) : (
                  <div style={s.inputRow}>
                    <div style={{flex:1}}>
                      <label style={s.label}>Genişlik (mm)</label>
                      <input type="number" value={settings.ellipseW} onChange={e => setSettings(st => ({...st, ellipseW: +e.target.value}))} style={s.input} />
                    </div>
                    <div style={{flex:1}}>
                      <label style={s.label}>Yükseklik (mm)</label>
                      <input type="number" value={settings.ellipseH} onChange={e => setSettings(st => ({...st, ellipseH: +e.target.value}))} style={s.input} />
                    </div>
                  </div>
                )}
                <div style={{fontSize:'0.75rem', color:'#94a3b8', marginTop:'5px'}}>Çizim alanına tıklayarak yerleştirin.</div>
              </div>
            )}
          </div>

          <div style={s.divider}></div>

          <div style={{ flex: 1 }}></div>

          <div style={s.group}>
            {state.editingBezierPoints && (
              <div style={{...s.input, backgroundColor: '#451a03', borderColor: '#92400e', marginBottom: '10px', display: 'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:'5px'}}>
                <span style={{fontSize:'0.75rem', color:'#fcd34d', fontWeight:'bold'}}>BEZİER DÜZENLEME</span>
                <button onClick={finishBezierEdit} style={{...s.btn, ...s.btnPrimary, padding:'5px 15px', fontSize:'0.8rem'}}>Bitir</button>
              </div>
            )}
            {state.finalized && paths.outer.length && !state.editingBezierPoints && (
              <button onClick={startEditOuter} style={{...s.btn, ...s.btnDefault, border: '1px solid #475569', marginBottom: '10px'}}><Edit3 size={16} /> Dış Sınırı Düzenle</button>
            )}
            
            <button onClick={() => setPaths(p => ({...p, inner: []}))} disabled={!paths.inner.length} style={getBtnStyle(false, !paths.inner.length)}><Trash2 size={16} /> İç Sınırı Sil</button>
            <button onClick={() => { setPaths(p=>({...p, outer:[]})); setState(st=>({...st, finalized: false, editingBezierPoints: false, outerBezierPoints: []})); }} disabled={!paths.outer.length} style={getBtnStyle(false, !paths.outer.length)}><Trash2 size={16} /> Dış Sınırı Sil</button>
            <button onClick={() => { setPaths({inner: [], outer:[]}); setState({ finalized: false, center: null, preview: null, shapeStart: null, editingBezierPoints: false, outerBezierPoints: [] }); setBezier([]); }} style={{...s.btn, ...s.btnDefault, marginTop:'10px'}}><RotateCcw size={16} /> Tümünü Temizle</button>
          </div>
        </div>

        <div style={s.canvasWrapper}>
          <canvas 
            ref={canvasRef} 
            width={LOGICAL_WIDTH} 
            height={LOGICAL_HEIGHT}
            onMouseDown={handleDown} 
            onMouseMove={handleMove} 
            onMouseUp={handleUp} 
            onMouseLeave={handleUp} 
            onContextMenu={(e) => e.preventDefault()}
            style={s.canvas}
          />
          <div style={s.overlayInfo}>
            <strong>Kısa Bilgi:</strong><br/>
            • <b>Elips/Kare:</b> Boyutları ayarlayıp tıklayın.<br/>
            • <b>Bezier:</b> Noktaları ekleyip, başlangıca döndürerek kapatın.<br/>
            • <b>Düzenle:</b> Dış sınırı nokta nokta düzeltebilirsiniz.
          </div>
        </div>
      </div>
    </div>
  );
}

