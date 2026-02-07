export class CanvasEngine {
  constructor() {
    this.renderer = null;
    this.geometryEngine = null;
    this.interaction = null;
    this.ui = null;
    this.isReady = false;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    const canvas = document.getElementById('main-canvas');
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    console.log('CanvasEngine initializing...');

    try {
      // Load modules
      const [CanvasRendererModule, GeometryEngineModule, InteractionManagerModule, UIManagerModule] = await Promise.all([
        import('./CanvasRenderer.js'),
        import('./GeometryEngine.js'),
        import('./InteractionManager.js'),
        import('./UIManager.js')
      ]);

      console.log('Modules loaded successfully');

      const CanvasRenderer = CanvasRendererModule.CanvasRenderer;
      const GeometryEngine = GeometryEngineModule.GeometryEngine;
      const InteractionManager = InteractionManagerModule.InteractionManager;
      const UIManager = UIManagerModule.UIManager;

      // Initialize geometry engine first
      this.geometryEngine = new GeometryEngine();
      console.log('GeometryEngine initialized');

      // Initialize renderer
      this.renderer = new CanvasRenderer(canvas);
      console.log('CanvasRenderer initialized');

      // Initialize interaction manager
      this.interaction = new InteractionManager(
        this.geometryEngine,
        this.renderer,
        (opts) => this.onUIUpdate(opts)
      );
      console.log('InteractionManager initialized');

      // Initialize UI manager
      this.ui = new UIManager(this, this.geometryEngine, this.interaction, this.renderer);
      console.log('UIManager initialized');

      // Setup renderer
      this.renderer.resize();
      this.renderer.updateSettings({
        pan: { x: 200, y: 200 },
        zoom: 0.15
      });

      // Add window resize listener
      window.addEventListener('resize', () => {
        this.renderer.resize();
      });

      this.isReady = true;
      console.log('CanvasEngine ready');

      // Start render loop
      this.startLoop();
    } catch (error) {
      console.error('Error initializing CanvasEngine:', error);
    }
  }

  onUIUpdate(opts) {
    if (this.ui) {
      this.ui.onUIUpdate(opts);
    }
  }

  startLoop() {
    const loop = () => {
      if (!this.isReady) {
        requestAnimationFrame(loop);
        return;
      }

      try {
        const renderData = this.geometryEngine.getRenderData();
        const interactionState = this.interaction.getInteractionState();

        this.renderer.setRenderData(renderData);
        this.renderer.setInteractionState(interactionState);
        this.renderer.render();
      } catch (error) {
        console.error('Render error:', error);
      }

      requestAnimationFrame(loop);
    };
    loop();
  }
}
