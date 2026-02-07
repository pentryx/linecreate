export const PIXELS_PER_MM = 3.7795275591;

export const mmToPx = (mm) => mm * PIXELS_PER_MM;

export const snapToGrid = (x, y, gridSizeMm = 25) => {
  const step = mmToPx(gridSizeMm);
  return {
    x: Math.round(x / step) * step,
    y: Math.round(y / step) * step
  };
};

export const distToSegment = (p, v, w) => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
};

export const chaikinSmooth = (pts, iterations = 3, closed = true) => {
  if (pts.length < (closed ? 3 : 2)) return pts;
  let current = [...pts];

  // Remove redundant end point if closed
  let isRedundant = closed && current.length > 1 &&
    current[0].x === current[current.length - 1].x &&
    current[0].y === current[current.length - 1].y;
  if (isRedundant) current.pop();

  for (let iter = 0; iter < iterations; iter++) {
    let next = [];
    const n = current.length;
    const loopCount = closed ? n : n - 1;

    for (let i = 0; i < loopCount; i++) {
      const p1 = current[i];
      const p2 = current[(i + 1) % n];

      next.push({
        x: p1.x * 0.75 + p2.x * 0.25,
        y: p1.y * 0.75 + p2.y * 0.25
      });
      next.push({
        x: p1.x * 0.25 + p2.x * 0.75,
        y: p1.y * 0.25 + p2.y * 0.75
      });
    }

    if (!closed) {
      next.unshift(current[0]);
      next.push(current[n - 1]);
    }
    current = next;
  }

  if (closed && current.length > 0) {
    current.push(current[0]);
  }
  return current;
};

// Smooth path while keeping sharp points fixed (closed paths by default)
export const smoothNonSharp = (pts, iterations = 1, closed = true) => {
  if (pts.length < (closed ? 3 : 2)) return pts;
  let current = [...pts];

  // Remove redundant end point if closed
  let isRedundant = closed && current.length > 1 &&
    current[0].x === current[current.length - 1].x &&
    current[0].y === current[current.length - 1].y;
  if (isRedundant) current.pop();

  for (let iter = 0; iter < iterations; iter++) {
    const n = current.length;
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = current[i];
      if (p.isSharp) {
        next[i] = { ...p };
        continue;
      }
      const p0 = current[(i - 1 + n) % n];
      const p2 = current[(i + 1) % n];
      next[i] = {
        x: p0.x * 0.25 + p.x * 0.5 + p2.x * 0.25,
        y: p0.y * 0.25 + p.y * 0.5 + p2.y * 0.25,
        isSharp: false
      };
    }
    current = next;
  }

  if (closed && current.length > 0) {
    current.push({ ...current[0] });
  }
  return current;
};

export const smoothWithSegments = (bezierPoints) => {
  if (bezierPoints.length < 3) return bezierPoints.map(p => ({ x: p.x, y: p.y }));

  const result = [];
  const stepsPerSegment = 50;

  for (let i = 0; i < bezierPoints.length; i++) {
    const p1 = bezierPoints[i];
    const p2 = bezierPoints[(i + 1) % bezierPoints.length];

    if (p1.segmentType === 'straight') {
      result.push({ x: p1.x, y: p1.y });
    } else {
      let p0 = bezierPoints[(i - 1 + bezierPoints.length) % bezierPoints.length];
      let p3 = bezierPoints[(i + 2) % bezierPoints.length];

      const effectiveP0 = p1.isSharp ? p1 : p0;
      const effectiveP3 = p2.isSharp ? p2 : p3;

      for (let t = 0; t < 1; t += 1 / stepsPerSegment) {
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

export const rayIntersect = (o, dx, dy, path) => {
  let closest = null, dist = Infinity;

  // Quick bounding box check for the whole path could go here, 
  // but since it's a ray, we'll just stick to segment-level optimization if needed.

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i], p2 = path[i + 1];

    // Quick bound check for the segment
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);

    // If the ray is pointing away from the segment's bounding box, we can skip
    // This is a very basic check
    if (dx > 0 && o.x > maxX) continue;
    if (dx < 0 && o.x < minX) continue;
    if (dy > 0 && o.y > maxY) continue;
    if (dy < 0 && o.y < minY) continue;

    const sdx = p2.x - p1.x, sdy = p2.y - p1.y;
    const denom = dx * sdy - dy * sdx;
    if (Math.abs(denom) < 0.0001) continue;
    const t = ((p1.x - o.x) * sdy - (p1.y - o.y) * sdx) / denom;
    const s = ((p1.x - o.x) * dy - (p1.y - o.y) * dx) / denom;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) {
      const pt = { x: o.x + t * dx, y: o.y + t * dy };
      const d = Math.sqrt((pt.x - o.x) ** 2 + (pt.y - o.y) ** 2);
      if (d < dist) {
        dist = d;
        closest = pt;
        // Vertex hit detection (approx 0.5mm tolerance)
        const d1 = Math.sqrt((pt.x - p1.x) ** 2 + (pt.y - p1.y) ** 2);
        const d2 = Math.sqrt((pt.x - p2.x) ** 2 + (pt.y - p2.y) ** 2);
        closest.isVertex = (d1 < 2.0 || d2 < 2.0);
      }
    }
  }
  return closest;
};

export const getPathLength = (path) => {
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) {
    len += Math.sqrt((path[i + 1].x - path[i].x) ** 2 + (path[i + 1].y - path[i].y) ** 2);
  }
  return len;
};

// Internal helper for resampling a slice
const resampleSimple = (path, segmentLen) => {
  const totalLen = getPathLength(path);
  if (totalLen === 0) return [...path];
  const numSamples = Math.max(1, Math.ceil(totalLen / segmentLen));
  const newPath = [];

  const getPtAt = (targetD) => {
    let currD = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.sqrt((path[i + 1].x - path[i].x) ** 2 + (path[i + 1].y - path[i].y) ** 2);
      if (currD + d >= targetD - 1e-7) {
        const t = d === 0 ? 0 : (targetD - currD) / d;
        return {
          x: path[i].x + (path[i + 1].x - path[i].x) * t,
          y: path[i].y + (path[i + 1].y - path[i].y) * t
        };
      }
      currD += d;
    }
    return path[path.length - 1];
  };

  for (let i = 0; i <= numSamples; i++) {
    newPath.push(getPtAt((i / numSamples) * totalLen));
  }
  return newPath;
};

export const resamplePath = (path, segmentLen = 2) => {
  if (path.length < 2) return path;

  // Find Indices of points marked as sharp
  const sharpIndices = [];
  path.forEach((p, i) => { if (p.isSharp) sharpIndices.push(i); });

  if (sharpIndices.length === 0) return resampleSimple(path, segmentLen);

  const finalPath = [];
  const n = path.length;

  // Handle segments between sharp points
  for (let i = 0; i < sharpIndices.length; i++) {
    const startIdx = sharpIndices[i];
    const endIdx = sharpIndices[(i + 1) % sharpIndices.length];

    let segment = [];
    if (endIdx > startIdx) {
      segment = path.slice(startIdx, endIdx + 1);
    } else {
      segment = [...path.slice(startIdx), ...path.slice(0, endIdx + 1)];
    }

    const resampled = resampleSimple(segment, segmentLen);
    // Remove last point to avoid duplicates with next segment start
    if (i < sharpIndices.length - 1 || endIdx === sharpIndices[0]) {
      resampled.pop();
    }
    // Carry over isSharp flag to the first point of the resampled segment
    resampled[0].isSharp = true;
    finalPath.push(...resampled);
  }

  // Ensure closure
  if (finalPath.length > 1) {
    const last = finalPath[finalPath.length - 1];
    const first = finalPath[0];
    if (last.x !== first.x || last.y !== first.y) finalPath.push({ ...first });
  }

  return finalPath;
};

export const getCentroid = (pts) => {
  if (!pts.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0, len = pts.length - 1;
  for (let i = 0; i < len; i++) { sx += pts[i].x; sy += pts[i].y; }
  return { x: sx / len, y: sy / len };
};

export const shiftPath = (path, dx, dy) => {
  return path.map(p => ({ x: p.x + dx, y: p.y + dy }));
};

export const getBoundsAndCenter = (path) => {
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

export const calculateAngleChanges = (path) => {
  if (path.length < 3) return [];
  const angles = [];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const angle1 = Math.atan2(v1.y, v1.x);
    const angle2 = Math.atan2(v2.y, v2.x);
    let angleDiff = Math.abs(angle2 - angle1);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    angles.push(angleDiff);
  }
  return angles;
};

export const hasSharpTransition = (angles, threshold = Math.PI / 3) => {
  return angles.some(angle => angle > threshold);
};

export const smoothSharpRegion = (path, angles, threshold = Math.PI / 3) => {
  const result = [...path];
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] > threshold) {
      const idx = i + 1;
      const prev = result[idx - 1];
      const curr = result[idx];
      const next = result[idx + 1];

      result[idx] = {
        x: prev.x * 0.3 + curr.x * 0.4 + next.x * 0.3,
        y: prev.y * 0.3 + curr.y * 0.4 + next.y * 0.3
      };

      if (idx > 1) {
        result[idx - 1] = {
          x: prev.x * 0.6 + curr.x * 0.4,
          y: prev.y * 0.6 + curr.y * 0.4
        };
      }

      if (idx < result.length - 2) {
        result[idx + 1] = {
          x: curr.x * 0.4 + next.x * 0.6,
          y: curr.y * 0.4 + next.y * 0.6
        };
      }
    }
  }
  return result;
};

export const calculateLayerSharpness = (layer) => {
  const angles = calculateAngleChanges(layer);
  if (angles.length === 0) return 0;
  // Use maximum angle change to detect local "kırılma" or jagged peaks
  return Math.max(...angles);
};

// Ramer-Douglas-Peucker simplification algorithm
export const simplifyPath = (points, tolerance = 1) => {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, index + 1), tolerance);
    const right = simplifyPath(points.slice(index), tolerance);
    return [...left.slice(0, left.length - 1), ...right];
  } else {
    return [points[0], points[points.length - 1]];
  }
};
