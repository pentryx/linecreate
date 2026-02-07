// jspdf is loaded via CDN in index.html and available globally as window.jspdf.jsPDF

// Import PIXELS_PER_MM and mmToPx from GeometryUtils
const PIXELS_PER_MM = 3.7795275591;
const mmToPx = (mm) => mm * PIXELS_PER_MM;

export class Exporter {
  static export(type, engine) {
    console.log(`Exporter.export called with type: ${type}`);
    const renderData = engine.getRenderData();
    const { innerPath, outerPath, contours } = renderData;

    console.log(`Paths - Inner: ${innerPath.length}, Outer: ${outerPath.length}, Contours: ${contours.length}`);

    if (!innerPath.length || !outerPath.length) {
      console.warn('Export aborted: Missing paths');
      alert('Lütfen önce çizimi tamamlayın.');
      return;
    }

    // Prompt for filename
    const defaultName = 'kontur';
    const userFileName = prompt('Dosya adını girin:', defaultName);
    if (!userFileName || userFileName.trim() === '') {
      console.log('Export cancelled: No filename provided');
      return;
    }

    // For high-res export, use existing contours from engine
    // They are already computed with adaptive smoothing
    const layers = contours.length > 0 ? contours : [];
    const allPaths = [innerPath, outerPath, ...layers];

    console.log(`Total paths to export: ${allPaths.length}`);

    const bounds = Exporter.calculateBounds(allPaths);
    const widthMM = bounds.width / PIXELS_PER_MM;
    const heightMM = bounds.height / PIXELS_PER_MM;

    console.log(`Bounds - Width: ${widthMM.toFixed(2)}mm, Height: ${heightMM.toFixed(2)}mm`);

    // Create filename with dimensions
    const fileName = `${userFileName.trim()}_${Math.round(widthMM)}mm_${Math.round(heightMM)}mm`;

    if (type === 'DXF') {
      console.log('Calling exportDXF...');
      Exporter.exportDXF(allPaths, bounds, fileName);
    } else if (type === 'PDF') {
      console.log('Calling exportPDF...');
      Exporter.exportPDF(allPaths, bounds, widthMM, heightMM, fileName);
    } else if (type === 'SVG') {
      console.log('Calling exportSVG...');
      Exporter.exportSVG(allPaths, bounds, widthMM, heightMM, fileName);
    } else if (type === 'DWG') {
      console.log('Calling exportDWG...');
      Exporter.exportDWG(allPaths, bounds, fileName);
    }
    console.log(`Export ${type} completed`);
  }

  static calculateBounds(pathsList) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pathsList.forEach(path => {
      path.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    const pad = PIXELS_PER_MM * 5;
    return {
      minX: minX - pad, maxX: maxX + pad,
      minY: minY - pad, maxY: maxY + pad,
      width: (maxX - minX) + (pad * 2),
      height: (maxY - minY) + (pad * 2),
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
    };
  }

  static exportDXF(allPaths, bounds, fileName) {
    // DXF R12 format with precise 1:1 mm scale
    let dxf = '0\nSECTION\n2\nHEADER\n';
    dxf += '9\n$INSUNITS\n70\n4\n'; // Units: millimeters
    dxf += '9\n$MEASUREMENT\n70\n1\n'; // Metric
    dxf += '0\nENDSEC\n';
    dxf += '0\nSECTION\n2\nENTITIES\n';

    allPaths.forEach(path => {
      if (path.length < 2) return;
      dxf += '0\nLWPOLYLINE\n';
      dxf += '8\n0\n'; // Layer 0
      dxf += '62\n7\n'; // Color: black/white (AutoCAD color 7)
      dxf += '90\n' + path.length + '\n'; // Number of vertices
      dxf += '70\n1\n'; // Closed polyline

      path.forEach(p => {
        // Convert to mm with high precision (1:1 scale)
        const xMM = (p.x - bounds.minX) / PIXELS_PER_MM;
        const yMM = (p.y - bounds.minY) / PIXELS_PER_MM;
        dxf += '10\n' + xMM.toFixed(6) + '\n';
        dxf += '20\n' + yMM.toFixed(6) + '\n';
      });
    });

    dxf += '0\nENDSEC\n0\nEOF';

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.dxf`;
    link.click();
  }

  static exportDWG(allPaths, bounds, fileName) {
    // DWG format is binary and complex. For simplicity, we export as DXF with .dwg extension
    // Most CAD software can import DXF files even with .dwg extension
    // For true DWG, you'd need a library like dwg.js or server-side conversion

    let dxf = '0\nSECTION\n2\nHEADER\n';
    dxf += '9\n$INSUNITS\n70\n4\n'; // Units: millimeters
    dxf += '9\n$MEASUREMENT\n70\n1\n'; // Metric
    dxf += '0\nENDSEC\n';
    dxf += '0\nSECTION\n2\nENTITIES\n';

    allPaths.forEach(path => {
      if (path.length < 2) return;
      dxf += '0\nLWPOLYLINE\n';
      dxf += '8\n0\n'; // Layer 0
      dxf += '62\n7\n'; // Color: black/white (AutoCAD color 7)
      dxf += '90\n' + path.length + '\n';
      dxf += '70\n1\n'; // Closed

      path.forEach(p => {
        const xMM = (p.x - bounds.minX) / PIXELS_PER_MM;
        const yMM = (p.y - bounds.minY) / PIXELS_PER_MM;
        dxf += '10\n' + xMM.toFixed(6) + '\n';
        dxf += '20\n' + yMM.toFixed(6) + '\n';
      });
    });

    dxf += '0\nENDSEC\n0\nEOF';

    const blob = new Blob([dxf], { type: 'application/acad' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.dwg`;
    link.click();
  }

  static exportPDF(allPaths, bounds, widthMM, heightMM, fileName) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: widthMM > heightMM ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [widthMM, heightMM]
    });

    // High quality settings for 1:1 scale
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.05); // Very thin line for precision

    allPaths.forEach(path => {
      if (path.length < 2) return;

      // Convert pixels to mm with high precision
      const pts = path.map(p => ({
        x: (p.x - bounds.minX) / PIXELS_PER_MM,
        y: (p.y - bounds.minY) / PIXELS_PER_MM
      }));

      // Draw path as connected lines
      pdf.lines(
        pts.slice(1).map((pt, i) => [
          pt.x - pts[i].x,
          pt.y - pts[i].y
        ]),
        pts[0].x,
        pts[0].y,
        [1, 1],
        'S', // Stroke only
        true // Close path
      );
    });

    pdf.save(`${fileName}.pdf`);
  }

  static exportSVG(allPaths, bounds, widthMM, heightMM, fileName) {
    const pathToD = (path) => {
      if (!path.length) return '';
      let d = '';
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const x = (p.x - bounds.minX) / PIXELS_PER_MM;
        const y = (p.y - bounds.minY) / PIXELS_PER_MM;
        d += (i === 0 ? 'M' : 'L') + x.toFixed(4) + ' ' + y.toFixed(4) + ' ';
      }
      return d + 'Z';
    };

    const paths = allPaths
      .filter(path => path.length >= 2)
      .map(path => `  <path d="${pathToD(path)}" fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.05" />`)
      .join('\n');

    const svg = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMM.toFixed(2)}mm" height="${heightMM.toFixed(2)}mm" viewBox="0 0 ${widthMM.toFixed(4)} ${heightMM.toFixed(4)}">`,
      paths,
      '</svg>'
    ].join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.svg`;
    link.click();
  }

  static saveProject(engine, settings, pan, theme) {
    // Prompt for filename
    const defaultName = 'proje';
    const userFileName = prompt('Proje dosya adını girin:', defaultName);
    if (!userFileName || userFileName.trim() === '') {
      console.log('Project save cancelled: No filename provided');
      return;
    }

    const renderData = engine.getRenderData();

    // Calculate dimensions
    const { innerPath, outerPath } = renderData;
    if (innerPath.length > 0 && outerPath.length > 0) {
      const allPaths = [innerPath, outerPath];
      const bounds = Exporter.calculateBounds(allPaths);
      const widthMM = Math.round(bounds.width / PIXELS_PER_MM);
      const heightMM = Math.round(bounds.height / PIXELS_PER_MM);

      // Create filename with _sablon_ and dimensions
      const fileName = `${userFileName.trim()}_sablon_${widthMM}mm_${heightMM}mm`;

      const projectData = {
        version: '1.0',
        settings,
        pan,
        theme,
        state: {
          innerPath: renderData.innerPath,
          outerPath: renderData.outerPath,
          innerBezierPoints: renderData.innerBezierPoints,
          outerBezierPoints: renderData.outerBezierPoints,
          shapeMetadata: engine.shapeMetadata
        },
        timestamp: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.ercx`;
      link.click();
    } else {
      alert('Proje kaydedilebilmesi için en az iç ve dış çizim yapılmalıdır.');
    }
  }
}
