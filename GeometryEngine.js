import {
  rayIntersect,
  chaikinSmooth,
  getCentroid,
  smoothWithSegments,
  resamplePath,
  smoothNonSharp,
  calculateAngleChanges,
  hasSharpTransition,
  smoothSharpRegion,
  calculateLayerSharpness
} from './GeometryUtils.js';

export class GeometryEngine {
  constructor() {
    this.innerPath = [];
    this.outerPath = [];
    this.contours = [];
    this.previewPath = null;

    this.innerBezierPoints = [];
    this.outerBezierPoints = [];

    this.params = {
      numLines: 35,
      smoothing: 4,
      gridSizeMm: 25,
      canvasWidth: 2100,
      canvasHeight: 2100
    };

    this.shapeMetadata = {
      inner: null,
      outer: null
    };

    this.autoComputeContours = false;
    this.needsUpdate = false;
    this.history = { past: [], future: [] };
    this.lastComputeTime = 0;
    this.saveState();
  }

  setParams(params) {
    this.params = { ...this.params, ...params };
    this.needsUpdate = true;
    if (this.autoComputeContours) {
      this.computeContours();
    }
  }

  pathToBezier(path) {
    if (!path || path.length < 3) return [];
    const step = Math.max(1, Math.floor(path.length / 16));
    const pts = [];
    for (let i = 0; i < path.length - 1; i += step) {
      pts.push({ ...path[i], segmentType: 'curve', isSharp: false });
    }
    return pts;
  }

  setInnerPath(points, skipBezier = false, metadata = null) {
    this.innerPath = points || [];
    if (!skipBezier && this.innerPath.length >= 3) {
      this.innerBezierPoints = this.pathToBezier(this.innerPath);
    }
    this.shapeMetadata.inner = metadata;
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  setOuterPath(points, skipBezier = false, metadata = null) {
    this.outerPath = points || [];
    if (!skipBezier && this.outerPath.length >= 3) {
      this.outerBezierPoints = this.pathToBezier(this.outerPath);
    }
    this.shapeMetadata.outer = metadata;
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  setPreviewPath(points) {
    this.previewPath = points;
  }

  setBezierPoints(type, points) {
    if (type === 'inner') {
      this.innerBezierPoints = points;
    } else if (type === 'outer') {
      this.outerBezierPoints = points;
    }
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  computeContours() {
    if (!this.innerPath.length || !this.outerPath.length) {
      this.contours = [];
      return;
    }

    const c = getCentroid(this.innerPath);
    const layers = Array.from({ length: this.params.numLines }, () => []);

    // Throttle heavy computation if called too frequently during interaction
    const now = performance.now();
    if (now - this.lastComputeTime < 32 && this.contours.length > 0) {
      // Optional: could return existing contours or a low-res preview
    }
    this.lastComputeTime = now;

    try {
      // High resolution scanning to precisely capture vertices
      const resolution = 1080;
      const rawLayers = Array.from({ length: this.params.numLines }, () => []);

      for (let i = 0; i < resolution; i++) {
        const a = (i / resolution) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        const iHit = rayIntersect(c, dx, dy, this.innerPath);
        const oHit = rayIntersect(c, dx, dy, this.outerPath);

        if (iHit && oHit) {
          const isBothSharp = iHit.isVertex && oHit.isVertex;
          for (let l = 1; l <= this.params.numLines; l++) {
            const t = l / (this.params.numLines + 1);

            // Smarter sharpness fade: deeper zone for smoothness
            let layerIsSharp = isBothSharp;
            if (!isBothSharp) {
              if (iHit.isVertex && t < 0.25) layerIsSharp = true;
              if (oHit.isVertex && t > 0.75) layerIsSharp = true;
            }

            rawLayers[l - 1].push({
              x: iHit.x + (oHit.x - iHit.x) * t,
              y: iHit.y + (oHit.y - iHit.y) * t,
              isSharp: layerIsSharp
            });
          }
        }
      }

      this.contours = rawLayers
        .filter(lay => lay.length > 10)
        .map((lay, lIdx) => {
          // Filter: Noise reduction, but BYPASS if point is sharp
          // This keeps corners perfectly sharp while cleaning ray-casting jitter from smooth segments
          const smoothedPositions = lay.map((p, i) => {
            if (p.isSharp) return p; // CRITICAL: Don't move vertex points

            const p0 = lay[(i - 1 + lay.length) % lay.length];
            const p1 = p;
            const p2 = lay[(i + 1) % lay.length];
            return {
              x: (p0.x * 0.25 + p1.x * 0.5 + p2.x * 0.25),
              y: (p0.y * 0.25 + p1.y * 0.5 + p2.y * 0.25),
              isSharp: false
            };
          });

          // Accurate resampling that respects vertex points
          const normalized = resamplePath(smoothedPositions, 1.2);

          const hasSharpCorners = normalized.some(p => p.isSharp);
          const extraSmoothing = (lIdx < this.params.numLines * 0.2) ? 1 : 0;
          const baseIter = Math.min(4, this.params.smoothing + extraSmoothing);
          const layerT = (this.params.numLines <= 1) ? 0 : (lIdx / (this.params.numLines - 1));

          let finalPath;
          if (hasSharpCorners) {
            // If it has corners, smooth non-sharp points and progressively relax sharpness toward outer layers
            const softenSharp = layerT > 0.6;
            const adjusted = softenSharp ? normalized.map(p => ({ ...p, isSharp: false })) : normalized;
            const smoothIter = Math.min(4, Math.max(1, Math.round(this.params.smoothing * (0.5 + layerT))));
            finalPath = smoothNonSharp(adjusted, smoothIter, true);
          } else {
            // Completely round path (like a circle) gets standard global smoothing
            finalPath = chaikinSmooth(normalized, baseIter, true);
          }

          return finalPath;
        });
    } catch (err) {
      console.error("Contour error:", err);
      this.contours = [];
    }

    this.autoComputeContours = true;
    this.needsUpdate = false;
  }

  getRenderData() {
    if (this.needsUpdate && this.autoComputeContours) {
      this.computeContours();
    }
    return {
      innerPath: this.innerPath,
      outerPath: this.outerPath,
      contours: this.contours,
      previewPath: this.previewPath,
      innerBezierPoints: this.innerBezierPoints,
      outerBezierPoints: this.outerBezierPoints
    };
  }

  smoothRawPoints(points) {
    return chaikinSmooth(points, 3, true);
  }

  updateFromBezier(type) {
    let smoothed = [];
    if (type === 'inner') {
      smoothed = smoothWithSegments(this.innerBezierPoints);
      if (smoothed.length) smoothed.push(smoothed[0]);
      this.innerPath = smoothed;
    } else {
      smoothed = smoothWithSegments(this.outerBezierPoints);
      if (smoothed.length) smoothed.push(smoothed[0]);
      this.outerPath = smoothed;
    }
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  saveState() {
    const state = {
      innerPath: [...this.innerPath],
      outerPath: [...this.outerPath],
      innerBezierPoints: JSON.parse(JSON.stringify(this.innerBezierPoints)),
      outerBezierPoints: JSON.parse(JSON.stringify(this.outerBezierPoints)),
      shapeMetadata: JSON.parse(JSON.stringify(this.shapeMetadata))
    };
    this.history.past.push(state);
    if (this.history.past.length > 20) this.history.past.shift();
    this.history.future = [];
  }

  undo() {
    if (this.history.past.length <= 1) return false;
    const current = this.history.past.pop();
    this.history.future.unshift(current);
    const prev = this.history.past[this.history.past.length - 1];
    this.restoreState(prev);
    return true;
  }

  redo() {
    if (this.history.future.length === 0) return false;
    const next = this.history.future.shift();
    this.history.past.push(next);
    this.restoreState(next);
    return true;
  }

  restoreState(state) {
    if (!state) return;
    this.innerPath = [...state.innerPath];
    this.outerPath = [...state.outerPath];
    this.innerBezierPoints = JSON.parse(JSON.stringify(state.innerBezierPoints || []));
    this.outerBezierPoints = JSON.parse(JSON.stringify(state.outerBezierPoints || []));
    this.shapeMetadata = JSON.parse(JSON.stringify(state.shapeMetadata || { inner: null, outer: null }));
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  clearInner() {
    this.innerPath = [];
    this.innerBezierPoints = [];
    this.shapeMetadata.inner = null;
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  clearOuter() {
    this.outerPath = [];
    this.outerBezierPoints = [];
    this.shapeMetadata.outer = null;
    this.contours = [];
    this.autoComputeContours = false;
    this.needsUpdate = true;
  }

  clearAll() {
    this.clearInner();
    this.clearOuter();
    this.contours = [];
  }
}
