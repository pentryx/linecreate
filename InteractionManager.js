import { snapToGrid, distToSegment, mmToPx, simplifyPath } from './GeometryUtils.js';

export class InteractionManager {
  constructor(engine, renderer, onUpdateUI) {
    this.engine = engine;
    this.renderer = renderer;
    this.onUpdateUI = onUpdateUI || (() => { });

    this.pan = { x: 200, y: 200 };
    this.zoom = 0.15;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    this.mode = 'freehand';
    this.shapeMode = null;
    this.isStraightLine = false;
    this.activeType = 'inner';

    this.drawing = { active: false, current: null, type: null };
    this.isEditingBezier = false;
    this.selectedBezierPoint = null;

    this.shapeStart = null;
    this.shapePreview = null;
    this.lastProcessTime = 0;
    this.setupEventListeners();
  }

  setupEventListeners() {
    const canvas = this.renderer.canvas;

    canvas.addEventListener('pointerdown', this.handleDown.bind(this));
    canvas.addEventListener('pointermove', this.handleMove.bind(this));
    canvas.addEventListener('pointerup', this.handleUp.bind(this));
    canvas.addEventListener('pointerleave', this.handleUp.bind(this));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setMode(mode, shapeMode = null, isStraightLine = false) {
    this.mode = mode;
    this.shapeMode = shapeMode;
    this.isStraightLine = isStraightLine;
    this.drawing = { active: false, current: null, type: null };
    this.shapeStart = null;
    this.shapePreview = null;
    this.onUpdateUI();
  }

  setActiveType(type) {
    this.activeType = type;
    this.onUpdateUI();
  }

  setView(pan, zoom) {
    if (pan) this.pan = { ...pan };
    if (zoom !== undefined) this.zoom = zoom;
    this.renderer.updateSettings({ pan: this.pan, zoom: this.zoom });
  }

  getCoords(e) {
    const canvas = this.renderer.canvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    return {
      x: (x - this.pan.x) / this.zoom,
      y: (y - this.pan.y) / this.zoom
    };
  }

  handleDown(e) {
    const isRightClick = e.button === 2;
    const isCtrlLeft = e.button === 0 && e.ctrlKey;

    if (isRightClick || isCtrlLeft) {
      e.preventDefault();
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
      this.onUpdateUI({ isPanning: true });
      return;
    }

    const c = this.getCoords(e);
    const renderData = this.engine.getRenderData();

    if (this.mode === 'select') {
      const dInner = this.distToPath(c, renderData.innerPath);
      const dOuter = this.distToPath(c, renderData.outerPath);
      const threshold = 15 / this.zoom;

      if (dInner < threshold && dInner <= dOuter) {
        this.onUpdateUI({ openEditModal: { type: 'inner', metadata: this.engine.shapeMetadata.inner } });
        return;
      } else if (dOuter < threshold) {
        this.onUpdateUI({ openEditModal: { type: 'outer', metadata: this.engine.shapeMetadata.outer } });
        return;
      }
      return;
    }

    if (this.isEditingBezier) {
      let min = Infinity, sel = null;
      ['outer', 'inner'].forEach(type => {
        const pts = type === 'outer' ? renderData.outerBezierPoints : renderData.innerBezierPoints;
        pts.forEach((p, i) => {
          const d = Math.sqrt((c.x - p.x) ** 2 + (c.y - p.y) ** 2);
          if (d < 20 / this.zoom && d < min) {
            min = d;
            sel = { type, index: i };
          }
        });
      });

      if (e.shiftKey && sel) {
        const pts = sel.type === 'inner' ? [...this.engine.innerBezierPoints] : [...this.engine.outerBezierPoints];
        pts[sel.index].isSharp = !pts[sel.index].isSharp;
        this.engine.setBezierPoints(sel.type, pts);
        this.engine.updateFromBezier(sel.type);
        this.engine.saveState();
        this.onUpdateUI();
        return;
      }

      this.selectedBezierPoint = sel;
      return;
    }

    if (this.mode === 'shape' || this.shapeMode) {
      const snapped = snapToGrid(c.x, c.y, this.engine.params.gridSizeMm);
      this.shapeStart = snapped;
      this.shapePreview = this.generateShapePreview(snapped, snapped);
      this.engine.setPreviewPath(this.shapePreview);
      this.onUpdateUI();
      return;
    }

    if (this.mode === 'bezier') {
      const type = this.activeType;
      const activePoints = (type === 'inner') ? this.engine.innerBezierPoints : this.engine.outerBezierPoints;

      if (activePoints.length > 2) {
        const dStart = Math.sqrt((c.x - activePoints[0].x) ** 2 + (c.y - activePoints[0].y) ** 2);
        if (dStart < 25 / this.zoom) {
          this.engine.updateFromBezier(type);
          if (type === 'outer') this.startEditBoth();
          this.engine.saveState();
          this.onUpdateUI();
          return;
        }
      }

      const newPoints = [...activePoints, {
        x: c.x, y: c.y,
        segmentType: this.isStraightLine ? 'straight' : 'curve',
        isSharp: this.isStraightLine
      }];
      this.engine.setBezierPoints(type, newPoints);
      this.onUpdateUI();
      return;
    }

    if (this.mode === 'freehand') {
      const type = this.activeType;
      this.drawing = { active: true, current: [c], type };
    }
  }

  handleMove(e) {
    if (this.isPanning) {
      const newPan = { x: e.clientX - this.panStart.x, y: e.clientY - this.panStart.y };
      this.pan = newPan;
      this.renderer.updateSettings({ pan: newPan });
      this.onUpdateUI({ pan: newPan });
      return;
    }

    // Throttle move events to ~60fps (16ms) or even 30fps (33ms) for heavy work
    const now = performance.now();
    if (now - this.lastProcessTime < 16) return;
    this.lastProcessTime = now;

    const c = this.getCoords(e);

    if (this.isEditingBezier && this.selectedBezierPoint) {
      const { type, index } = this.selectedBezierPoint;
      const snapped = snapToGrid(c.x, c.y, this.engine.params.gridSizeMm);
      const pts = type === 'inner' ? [...this.engine.innerBezierPoints] : [...this.engine.outerBezierPoints];
      pts[index] = { ...pts[index], x: snapped.x, y: snapped.y };
      this.engine.setBezierPoints(type, pts);
      this.engine.updateFromBezier(type);
      return;
    }

    if ((this.mode === 'shape' || this.shapeMode) && this.shapeStart) {
      this.shapePreview = this.generateShapePreview(this.shapeStart, c);
      this.engine.setPreviewPath(this.shapePreview);
      return;
    }

    if (this.drawing.active) {
      this.drawing.current.push(c);
    }
  }

  handleUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.onUpdateUI({ pan: this.pan, isPanning: false });
      return;
    }

    if (this.isEditingBezier) {
      if (this.selectedBezierPoint) this.engine.saveState();
      this.selectedBezierPoint = null;
      return;
    }

    if ((this.mode === 'shape' || this.shapeMode) && this.shapeStart) {
      if (this.shapePreview && this.shapePreview.length > 2) {
        const type = this.activeType;
        const { shapeSize, shapeWidth, shapeHeight, shapeAngle } = this.engine.params;
        const metadata = {
          mode: 'shape',
          shape: this.shapeMode,
          size: shapeSize,
          width: shapeWidth,
          height: shapeHeight,
          angle: shapeAngle,
          center: { ...this.shapeStart }
        };

        if (type === 'inner') {
          this.engine.setInnerPath(this.shapePreview, false, metadata);
        } else {
          this.engine.setOuterPath(this.shapePreview, false, metadata);
        }
        this.engine.saveState();
      }
      this.engine.setPreviewPath(null);
      this.shapeStart = null;
      this.shapePreview = null;
      this.onUpdateUI();
      return;
    }

    if (this.drawing.active) {
      if (this.drawing.current.length > 5) {
        // Simplify the raw path before smoothing
        const simplified = simplifyPath(this.drawing.current, 0.5);
        const smoothed = this.engine.smoothRawPoints(simplified);
        if (smoothed.length > 2) smoothed.push(smoothed[0]);

        if (this.drawing.type === 'inner') {
          this.engine.setInnerPath(smoothed);
        } else {
          this.engine.setOuterPath(smoothed);
        }
        this.engine.saveState();
      }
      this.drawing = { active: false, current: null, type: null };
      this.onUpdateUI();
    }
  }

  distToPath(point, path) {
    let min = Infinity;
    if (!path || path.length < 2) return min;
    for (let i = 0; i < path.length - 1; i++) {
      const d = distToSegment(point, path[i], path[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }

  generateShapePreview(start, end, customParams = null) {
    const params = customParams || this.engine.params;
    const { shapeSize, shapeWidth, shapeHeight, shapeAngle } = params;
    const pts = [];
    const cx = start.x;
    const cy = start.y;
    const mode = customParams?.shape || this.shapeMode;
    const angleRad = (shapeAngle || 0) * Math.PI / 180;

    const rotate = (p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      return {
        x: cx + dx * Math.cos(angleRad) - dy * Math.sin(angleRad),
        y: cy + dx * Math.sin(angleRad) + dy * Math.cos(angleRad)
      };
    };

    if (mode === 'circle') {
      const sz = mmToPx(shapeSize || 100);
      for (let i = 0; i <= 360; i += 5) {
        const a = i * Math.PI / 180;
        pts.push(rotate({ x: cx + Math.cos(a) * sz / 2, y: cy + Math.sin(a) * sz / 2 }));
      }
    } else if (mode === 'square') {
      const sz = mmToPx(shapeSize || 100);
      const h = sz / 2;
      [
        { x: cx - h, y: cy - h },
        { x: cx + h, y: cy - h },
        { x: cx + h, y: cy + h },
        { x: cx - h, y: cy + h },
        { x: cx - h, y: cy - h }
      ].forEach(p => pts.push(rotate(p)));
    } else if (mode === 'ellipse') {
      const sw = mmToPx(shapeWidth || 150), sh = mmToPx(shapeHeight || 100);
      for (let i = 0; i <= 360; i += 5) {
        const a = i * Math.PI / 180;
        pts.push(rotate({ x: cx + Math.cos(a) * sw / 2, y: cy + Math.sin(a) * sh / 2 }));
      }
    } else if (mode === 'rectangle') {
      const sw = mmToPx(shapeWidth || 150), sh = mmToPx(shapeHeight || 100);
      const hw = sw / 2, hh = sh / 2;
      [
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh },
        { x: cx - hw, y: cy - hh }
      ].forEach(p => pts.push(rotate(p)));
    }
    return pts;
  }

  startEditBoth() {
    this.isEditingBezier = true;
    this.onUpdateUI();
  }

  finishEdit() {
    this.isEditingBezier = false;
    this.selectedBezierPoint = null;
    this.onUpdateUI();
  }

  getInteractionState() {
    const activeBezier = (this.mode === 'bezier') ?
      (this.activeType === 'inner' ? this.engine.innerBezierPoints : this.engine.outerBezierPoints) : null;

    return {
      mode: this.mode,
      drawingPath: this.drawing.current,
      drawingType: this.drawing.type,
      activeBezier: activeBezier,
      activeType: this.activeType,
      isEditingBezier: this.isEditingBezier,
      selectedPoint: this.selectedBezierPoint,
      showDimensions: true
    };
  }
}
