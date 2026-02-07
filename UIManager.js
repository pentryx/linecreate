import { Exporter } from './Exporter.js';

// Helper function for mm to px conversion
const mmToPx = (mm) => mm * 3.7795275591;

export class UIManager {
  constructor(canvasEngine, geometryEngine, interactionManager, renderer) {
    this.engine = canvasEngine;
    this.geometryEngine = geometryEngine;
    this.interaction = interactionManager;
    this.renderer = renderer;
    this.theme = 'light';
    this.settings = {
      numLines: 35,
      shapeSize: 100,
      shapeWidth: 150,
      shapeHeight: 100,
      shapeAngle: 0,
      canvasWidth: 2100,
      canvasHeight: 2100,
      gridSizeMm: 25
    };
    this.pan = { x: 200, y: 200 };
    this.activeMode = 'freehand';
    this.activeShape = null;
    this.isStraightLine = false;
    this.editModal = { isOpen: false, type: null, metadata: null };

    // Setup UI
    this.setupUI();
  }

  setupUI() {
    // Startup modal - use onclick handler for reliability
    const startupConfirm = document.getElementById('startup-confirm');
    if (startupConfirm) {
      startupConfirm.onclick = () => {
        const widthInput = document.getElementById('startup-width');
        const heightInput = document.getElementById('startup-height');
        const gridInput = document.getElementById('startup-grid');

        if (widthInput && heightInput && gridInput) {
          this.settings.canvasWidth = +widthInput.value;
          this.settings.canvasHeight = +heightInput.value;
          this.settings.gridSizeMm = +gridInput.value;

          this.geometryEngine.setParams({
            canvasWidth: this.settings.canvasWidth,
            canvasHeight: this.settings.canvasHeight,
            gridSizeMm: this.settings.gridSizeMm
          });

          this.renderer.updateSettings({
            canvasWidth: this.settings.canvasWidth,
            canvasHeight: this.settings.canvasHeight,
            gridSizeMm: this.settings.gridSizeMm
          });

          const modal = document.getElementById('startup-modal');
          if (modal) {
            modal.style.display = 'none';
          }
          this.updateCanvasInfo();
        }
      };
    }

    // Theme toggle
    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        this.updateThemeIcon();
      });
    }

    // Grid toggle
    const gridBtn = document.getElementById('btn-grid');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => {
        const showGrid = !this.renderer.settings.showGrid;
        this.renderer.updateSettings({ showGrid });
        this.updateGridButton(showGrid);
      });
    }

    // Num lines input
    const numLinesInput = document.getElementById('num-lines-input');
    if (numLinesInput) {
      numLinesInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (value >= 1 && value <= 100) {
          this.settings.numLines = value;
          this.geometryEngine.setParams({ numLines: value });
        }
      });
    }

    // Create contours button
    const createContoursBtn = document.getElementById('btn-create-contours');
    if (createContoursBtn) {
      createContoursBtn.addEventListener('click', () => {
        this.geometryEngine.computeContours();
        this.onUIUpdate();
      });
    }

    // Path type toggle
    const btnTypeInner = document.getElementById('btn-type-inner');
    const btnTypeOuter = document.getElementById('btn-type-outer');

    if (btnTypeInner) {
      btnTypeInner.addEventListener('click', () => {
        this.interaction.setActiveType('inner');
        this.onUIUpdate();
      });
    }
    if (btnTypeOuter) {
      btnTypeOuter.addEventListener('click', () => {
        this.interaction.setActiveType('outer');
        this.onUIUpdate();
      });
    }

    // Zoom controls
    const zoomInBtn = document.getElementById('btn-zoom-in');
    const zoomOutBtn = document.getElementById('btn-zoom-out');
    const fitBtn = document.getElementById('btn-fit');

    if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.handleZoom(1.25));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.handleZoom(0.8));
    if (fitBtn) fitBtn.addEventListener('click', () => this.fitView());

    // Undo/Redo
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');

    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (this.geometryEngine.undo()) this.onUIUpdate();
      });
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
        if (this.geometryEngine.redo()) this.onUIUpdate();
      });
    }

    // Drawing modes
    const modeSelect = document.getElementById('mode-select');
    const modeFreehand = document.getElementById('mode-freehand');
    const modeBezier = document.getElementById('mode-bezier');
    const straightBtn = document.getElementById('mode-straight');

    if (modeSelect) {
      modeSelect.addEventListener('click', () => {
        this.activeMode = 'select';
        this.activeShape = null;
        this.interaction.setMode('select', null, false);
        this.isStraightLine = false;
        this.updateModeButtons();
      });
    }
    if (modeFreehand) {
      modeFreehand.addEventListener('click', () => {
        this.activeMode = 'freehand';
        this.activeShape = null;
        this.interaction.setMode('freehand', null, false);
        this.isStraightLine = false;
        this.updateModeButtons();
      });
    }
    if (modeBezier) {
      modeBezier.addEventListener('click', () => {
        this.activeMode = 'bezier';
        this.activeShape = null;
        this.interaction.setMode('bezier', null, this.isStraightLine);
        this.updateModeButtons();
      });
    }
    if (straightBtn) {
      straightBtn.addEventListener('click', () => {
        if (this.activeMode !== 'bezier') return;
        this.isStraightLine = !this.isStraightLine;
        this.interaction.setMode('bezier', null, this.isStraightLine);
        this.updateModeButtons();
      });
    }

    // Shapes
    ['circle', 'square', 'ellipse', 'rectangle'].forEach(shape => {
      const shapeBtn = document.getElementById(`shape-${shape}`);
      if (shapeBtn) {
        shapeBtn.addEventListener('click', () => {
          this.activeShape = shape;
          this.activeMode = 'shape';
          this.interaction.setMode('shape', shape, false);
          this.updateShapeButtons();
          this.updateShapeInputs();
        });
      }
    });

    // Shape inputs
    const shapeSize = document.getElementById('shape-size');
    const shapeWidth = document.getElementById('shape-width');
    const shapeHeight = document.getElementById('shape-height');
    const shapeAngle = document.getElementById('shape-angle');

    if (shapeSize) {
      shapeSize.addEventListener('input', (e) => {
        this.settings.shapeSize = +e.target.value;
        this.geometryEngine.setParams({ shapeSize: this.settings.shapeSize });
      });
    }
    if (shapeWidth) {
      shapeWidth.addEventListener('input', (e) => {
        this.settings.shapeWidth = +e.target.value;
        this.geometryEngine.setParams({ shapeWidth: this.settings.shapeWidth });
      });
    }
    if (shapeHeight) {
      shapeHeight.addEventListener('input', (e) => {
        this.settings.shapeHeight = +e.target.value;
        this.geometryEngine.setParams({ shapeHeight: this.settings.shapeHeight });
      });
    }
    if (shapeAngle) {
      shapeAngle.addEventListener('input', (e) => {
        this.settings.shapeAngle = +e.target.value;
        const angleValue = document.getElementById('shape-angle-value');
        if (angleValue) angleValue.textContent = this.settings.shapeAngle;
        this.geometryEngine.setParams({ shapeAngle: this.settings.shapeAngle });
      });
    }

    // Clear buttons
    const clearInner = document.getElementById('btn-clear-inner');
    const clearOuter = document.getElementById('btn-clear-outer');
    const resetBtn = document.getElementById('btn-reset');

    if (clearInner) {
      clearInner.addEventListener('click', () => {
        this.geometryEngine.clearInner();
        this.geometryEngine.saveState();
        this.onUIUpdate();
      });
    }
    if (clearOuter) {
      clearOuter.addEventListener('click', () => {
        this.geometryEngine.clearOuter();
        this.geometryEngine.saveState();
        this.onUIUpdate();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.geometryEngine.clearAll();
        this.geometryEngine.saveState();
        this.onUIUpdate();
      });
    }

    // Edit buttons
    const editBtn = document.getElementById('btn-edit');
    const completeBtn = document.getElementById('btn-edit-complete');

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.interaction.startEditBoth();
        // Clear contours when entering edit mode
        this.geometryEngine.contours = [];
        this.geometryEngine.autoComputeContours = false;
        this.onUIUpdate();
      });
    }
    if (completeBtn) {
      completeBtn.addEventListener('click', () => {
        this.interaction.finishEdit();
        this.onUIUpdate();
      });
    }

    // Export toggle
    const exportToggle = document.getElementById('export-toggle');
    const exportMenu = document.getElementById('export-menu');

    if (exportToggle && exportMenu) {
      exportToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('active');
      });
    }

    // Export actions
    const exportSaveProject = document.getElementById('export-save-project');
    const exportPDF = document.getElementById('export-pdf');
    const exportDXF = document.getElementById('export-dxf');
    const exportSVG = document.getElementById('export-svg');
    const exportDWG = document.getElementById('export-dwg');

    if (exportSaveProject) {
      exportSaveProject.addEventListener('click', () => {
        console.log('Export: Saving project...');
        try {
          Exporter.saveProject(this.geometryEngine, this.settings, this.pan, this.theme);
          console.log('Export: Project saved successfully');
        } catch (error) {
          console.error('Export: Error saving project:', error);
        }
        if (exportMenu) exportMenu.classList.remove('active');
      });
    }
    if (exportPDF) {
      exportPDF.addEventListener('click', () => {
        console.log('Export: Starting PDF export...');
        try {
          Exporter.export('PDF', this.geometryEngine);
          console.log('Export: PDF export completed');
        } catch (error) {
          console.error('Export: Error exporting PDF:', error);
        }
        if (exportMenu) exportMenu.classList.remove('active');
      });
    }
    if (exportDXF) {
      exportDXF.addEventListener('click', () => {
        console.log('Export: Starting DXF export...');
        try {
          Exporter.export('DXF', this.geometryEngine);
          console.log('Export: DXF export completed');
        } catch (error) {
          console.error('Export: Error exporting DXF:', error);
        }
        if (exportMenu) exportMenu.classList.remove('active');
      });
    }
    if (exportSVG) {
      exportSVG.addEventListener('click', () => {
        console.log('Export: Starting SVG export...');
        try {
          Exporter.export('SVG', this.geometryEngine);
          console.log('Export: SVG export completed');
        } catch (error) {
          console.error('Export: Error exporting SVG:', error);
        }
        if (exportMenu) exportMenu.classList.remove('active');
      });
    }
    if (exportDWG) {
      exportDWG.addEventListener('click', () => {
        console.log('Export: Starting DWG export...');
        try {
          Exporter.export('DWG', this.geometryEngine);
          console.log('Export: DWG export completed');
        } catch (error) {
          console.error('Export: Error exporting DWG:', error);
        }
        if (exportMenu) exportMenu.classList.remove('active');
      });
    }

    // Load project
    const loadProjectInput = document.getElementById('load-project-input');
    if (loadProjectInput) {
      loadProjectInput.addEventListener('change', (e) => this.loadProject(e));
    }

    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('app-sidebar');

    if (menuToggle && sidebar) {
      menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
      });
    }

    // Edit modal
    const editModalClose = document.getElementById('edit-modal-close');
    const editModalOk = document.getElementById('edit-modal-ok');

    if (editModalClose) {
      editModalClose.addEventListener('click', () => {
        this.editModal = { isOpen: false, type: null, metadata: null };
        const modal = document.getElementById('edit-modal');
        if (modal) modal.style.display = 'none';
      });
    }
    if (editModalOk) {
      editModalOk.addEventListener('click', () => {
        this.editModal = { isOpen: false, type: null, metadata: null };
        const modal = document.getElementById('edit-modal');
        if (modal) modal.style.display = 'none';
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (exportMenu && !exportMenu.contains(e.target)) {
        exportMenu.classList.remove('active');
      }
    });
  }

  onUIUpdate(opts) {
    if (opts) {
      if (opts.pan) this.pan = opts.pan;
      if (opts.openEditModal) {
        this.openEditModal(opts.openEditModal.type, opts.openEditModal.metadata);
        return;
      }
    }

    const data = this.geometryEngine.getRenderData();
    const hasContent = {
      inner: data.innerPath.length >= 3,
      outer: data.outerPath.length >= 3,
      finalized: data.innerPath.length >= 3 && data.outerPath.length >= 3,
      editing: this.interaction.isEditingBezier
    };

    this.updateContentButtons(hasContent);
    this.updatePathTypeButtons();

    // Update renderer data
    this.renderer.setRenderData(data);
    this.renderer.setInteractionState(this.interaction.getInteractionState());
  }

  updatePathTypeButtons() {
    const activeType = this.interaction.activeType;
    const btnInner = document.getElementById('btn-type-inner');
    const btnOuter = document.getElementById('btn-type-outer');

    if (btnInner) btnInner.classList.toggle('btn-active', activeType === 'inner');
    if (btnOuter) btnOuter.classList.toggle('btn-active', activeType === 'outer');
  }

  handleZoom(factor) {
    const oldZoom = this.renderer.settings.zoom;
    const minZoom = 0.05;

    let newZoom = Math.max(minZoom, Math.min(oldZoom * factor, 10));

    if (factor < 1 && oldZoom <= minZoom) return;

    const canvas = this.renderer.canvas;
    const cx = this.renderer.width / 2;
    const cy = this.renderer.height / 2;

    const lx = (cx - this.pan.x) / oldZoom;
    const ly = (cy - this.pan.y) / oldZoom;

    const newPan = {
      x: cx - lx * newZoom,
      y: cy - ly * newZoom
    };

    this.pan = newPan;
    this.interaction.setView(newPan, newZoom);
    this.renderer.updateSettings({ pan: newPan, zoom: newZoom });
  }

  fitView() {
    const canvas = this.renderer.canvas;
    const targetZoom = 0.48;
    const cx = this.renderer.width / 2;
    const cy = this.renderer.height / 2;

    const wx = (this.settings.canvasWidth * mmToPx(1)) / 2;
    const wy = (this.settings.canvasHeight * mmToPx(1)) / 2;

    const newPan = {
      x: cx - wx * targetZoom,
      y: cy - wy * targetZoom
    };

    this.pan = newPan;
    this.interaction.setView(newPan, targetZoom);
    this.renderer.updateSettings({ pan: newPan, zoom: targetZoom });
  }

  loadProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        console.log('Loading project:', data);

        // Validate project data
        if (!data.state) {
          throw new Error('Proje dosyası geçersiz: state verisi eksik');
        }

        this.settings = { ...this.settings, ...data.settings };
        this.pan = data.pan || this.pan;
        if (data.theme) this.theme = data.theme;

        document.documentElement.setAttribute('data-theme', this.theme);
        this.updateThemeIcon();
        this.updateCanvasInfo();

        // Update geometry engine
        this.geometryEngine.restoreState(data.state);

        // Update renderer settings
        this.renderer.updateSettings({
          pan: this.pan,
          zoom: 0.15,
          canvasWidth: this.settings.canvasWidth,
          canvasHeight: this.settings.canvasHeight,
          gridSizeMm: this.settings.gridSizeMm
        });

        // Update interaction view
        this.interaction.setView(this.pan, 0.15);

        // Update inputs
        const numLinesInput = document.getElementById('num-lines-input');
        if (numLinesInput) numLinesInput.value = this.settings.numLines;

        const shapeSize = document.getElementById('shape-size');
        if (shapeSize) shapeSize.value = this.settings.shapeSize;
        const shapeWidth = document.getElementById('shape-width');
        if (shapeWidth) shapeWidth.value = this.settings.shapeWidth;
        const shapeHeight = document.getElementById('shape-height');
        if (shapeHeight) shapeHeight.value = this.settings.shapeHeight;
        const shapeAngle = document.getElementById('shape-angle');
        if (shapeAngle) shapeAngle.value = this.settings.shapeAngle;
        const shapeAngleValue = document.getElementById('shape-angle-value');
        if (shapeAngleValue) shapeAngleValue.textContent = this.settings.shapeAngle;

        this.onUIUpdate({ pan: this.pan });
        console.log('Project loaded successfully');
        alert('Proje başarıyla yüklendi.');
      } catch (err) {
        console.error('Error loading project:', err);
        alert('Proje yükleme hatası: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  openEditModal(type, metadata) {
    this.editModal = { isOpen: true, type, metadata };
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('edit-modal-title');
    const body = document.getElementById('edit-modal-body');

    if (!modal || !title || !body) return;

    title.textContent = `Şekli Düzenle (${type === 'inner' ? 'İç' : 'Dış'})`;

    if (metadata) {
      const gridSize = this.settings.gridSizeMm;
      const shiftAmount = mmToPx(gridSize);

      let html = '<div class="form-group" style="margin-bottom: 12px;">';
      html += '<label class="form-label">Konum Kaydır</label>';
      html += '<div class="btn-grid" style="grid-template-columns: repeat(3, 1fr); gap: 4px;">';
      html += '<div></div>';
      html += '<button class="btn btn-sm" data-direction="up"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path></svg></button>';
      html += '<div></div>';
      html += '<button class="btn btn-sm" data-direction="left"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg></button>';
      html += '<button class="btn btn-sm btn-disabled">●</button>';
      html += '<button class="btn btn-sm" data-direction="right"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></button>';
      html += '<div></div>';
      html += '<button class="btn btn-sm" data-direction="down"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M19 12l-7 7-7-7"></path></svg></button>';
      html += '<div></div>';
      html += '</div>';
      html += `<p class="text-small text-muted" style="margin-top: 4px;">Adım: ${gridSize}mm</p>`;
      html += '</div>';
      html += '<div class="divider"></div>';
      html += '<div class="form-grid">';

      if (metadata.shape === 'circle' || metadata.shape === 'square') {
        html += `<div class="form-group"><label class="form-label">Boyut (mm)</label><input type="number" value="${metadata.size}" id="edit-size" class="form-input"></div>`;
      }

      if (metadata.shape === 'ellipse' || metadata.shape === 'rectangle') {
        html += `<div class="form-group"><label class="form-label">En (mm)</label><input type="number" value="${metadata.width}" id="edit-width" class="form-input"></div>`;
        html += `<div class="form-group"><label class="form-label">Boy (mm)</label><input type="number" value="${metadata.height}" id="edit-height" class="form-input"></div>`;
      }

      html += `<div class="form-group" style="grid-column: span 2;"><label class="form-label">Açı (°): ${metadata.angle}</label><input type="range" min="0" max="360" value="${metadata.angle}" id="edit-angle" class="form-range"></div>`;
      html += '</div>';

      body.innerHTML = html;

      const getMeta = () => this.editModal.metadata || metadata;

      // Bind direction buttons
      body.querySelectorAll('[data-direction]').forEach(btn => {
        btn.addEventListener('click', () => {
          const direction = btn.dataset.direction;
          let dx = 0, dy = 0;
          switch (direction) {
            case 'up': dy = -shiftAmount; break;
            case 'down': dy = shiftAmount; break;
            case 'left': dx = -shiftAmount; break;
            case 'right': dx = shiftAmount; break;
          }

          const currentMeta = getMeta();
          const newCenter = {
            x: currentMeta.center.x + dx,
            y: currentMeta.center.y + dy
          };

          const newMeta = { ...currentMeta, center: newCenter };
          this.applyShapeEdit(newMeta);
          this.editModal = { ...this.editModal, metadata: newMeta };
        });
      });

      // Bind shape inputs
      const bindInput = (id, prop, callback) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('input', (e) => {
          const currentMeta = getMeta();
          const newMeta = { ...currentMeta, [prop]: +e.target.value };
          this.applyShapeEdit(newMeta);
          this.editModal = { ...this.editModal, metadata: newMeta };
          if (callback) callback(+e.target.value);
        });
      };

      bindInput('edit-size', 'size', (val) => {
        this.geometryEngine.setParams({ shapeSize: val });
      });

      bindInput('edit-width', 'width', (val) => {
        this.geometryEngine.setParams({ shapeWidth: val });
      });

      bindInput('edit-height', 'height', (val) => {
        this.geometryEngine.setParams({ shapeHeight: val });
      });

      bindInput('edit-angle', 'angle', (val) => {
        const angleLabel = body.querySelector('.form-label[style*="Açı"]');
        if (angleLabel) angleLabel.textContent = `Açı (°): ${val}`;
        this.geometryEngine.setParams({ shapeAngle: val });
      });

    } else {
      body.innerHTML = '<div class="alert alert-info" style="margin-bottom: 0;"><p class="text-small">Serbest çizimler için şu an sadece ön tanımlı şekil parametreleri değiştirilebilir.</p></div>';
    }

    modal.style.display = 'flex';
  }

  applyShapeEdit(newMeta) {
    if (!this.interaction || !this.editModal.type) return;

    const params = {
      shape: newMeta.shape,
      shapeSize: newMeta.size,
      shapeWidth: newMeta.width,
      shapeHeight: newMeta.height,
      shapeAngle: newMeta.angle
    };

    const newPath = this.interaction.generateShapePreview(newMeta.center, newMeta.center, params);
    if (this.editModal.type === 'inner') {
      this.geometryEngine.setInnerPath(newPath, false, newMeta);
    } else {
      this.geometryEngine.setOuterPath(newPath, false, newMeta);
    }
    this.geometryEngine.saveState();
    this.onUIUpdate();
  }

  updateCanvasInfo() {
    const info = document.getElementById('canvas-info');
    if (info) {
      info.textContent = `${this.settings.canvasWidth}x${this.settings.canvasHeight}mm • ${this.settings.gridSizeMm}mm Grid`;
    }
  }

  updateThemeIcon() {
    const moonIcon = document.querySelector('.moon-icon');
    const sunIcon = document.querySelector('.sun-icon');
    if (this.theme === 'dark') {
      if (moonIcon) moonIcon.style.display = 'none';
      if (sunIcon) sunIcon.style.display = 'block';
    } else {
      if (moonIcon) moonIcon.style.display = 'block';
      if (sunIcon) sunIcon.style.display = 'none';
    }
  }

  updateGridButton(showGrid) {
    const btn = document.getElementById('btn-grid');
    const span = btn ? btn.querySelector('span') : null;
    if (showGrid) {
      if (btn) btn.classList.add('btn-active');
      if (span) span.textContent = 'Grid Açık';
    } else {
      if (btn) btn.classList.remove('btn-active');
      if (span) span.textContent = 'Grid Kapalı';
    }
  }

  updateModeButtons() {
    const modeSelect = document.getElementById('mode-select');
    const modeFreehand = document.getElementById('mode-freehand');
    const modeBezier = document.getElementById('mode-bezier');
    const straightBtn = document.getElementById('mode-straight');

    if (modeSelect) modeSelect.classList.toggle('btn-primary', this.activeMode === 'select');
    if (modeFreehand) modeFreehand.classList.toggle('btn-primary', this.activeMode === 'freehand' && !this.activeShape);
    if (modeBezier) modeBezier.classList.toggle('btn-primary', this.activeMode === 'bezier' && !this.activeShape);

    if (straightBtn) {
      if (this.activeMode === 'bezier') {
        straightBtn.style.display = 'block';
        straightBtn.classList.toggle('btn-warning', this.isStraightLine);
        straightBtn.textContent = `📏 Düz Çizgi ${this.isStraightLine ? '(Aktif)' : ''}`;
      } else {
        straightBtn.style.display = 'none';
      }
    }
  }

  updateShapeButtons() {
    ['circle', 'square', 'ellipse', 'rectangle'].forEach(shape => {
      const btn = document.getElementById(`shape-${shape}`);
      if (btn) btn.classList.toggle('btn-primary', this.activeShape === shape);
    });
  }

  updateShapeInputs() {
    const sizeInput = document.getElementById('shape-size');
    const widthInput = document.getElementById('shape-width');
    const heightInput = document.getElementById('shape-height');

    if (this.activeShape === 'circle' || this.activeShape === 'square' || !this.activeShape) {
      if (sizeInput) sizeInput.parentElement.style.display = 'flex';
      if (widthInput) widthInput.parentElement.style.display = 'none';
      if (heightInput) heightInput.parentElement.style.display = 'none';
    } else {
      if (sizeInput) sizeInput.parentElement.style.display = 'none';
      if (widthInput) widthInput.parentElement.style.display = 'flex';
      if (heightInput) heightInput.parentElement.style.display = 'flex';
    }
  }

  updateContentButtons(hasContent) {
    const editBtn = document.getElementById('btn-edit');
    const completeBtn = document.getElementById('btn-edit-complete');

    if (hasContent.editing) {
      if (editBtn) editBtn.style.display = 'none';
      if (completeBtn) completeBtn.style.display = 'block';
    } else if (hasContent.inner || hasContent.outer) {
      if (editBtn) editBtn.style.display = 'block';
      if (completeBtn) completeBtn.style.display = 'none';
    } else {
      if (editBtn) editBtn.style.display = 'none';
      if (completeBtn) completeBtn.style.display = 'none';
    }
  }
}
