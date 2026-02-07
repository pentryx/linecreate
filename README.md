# Kontur Çizgileri - HTML5 Canvas Sürümü

React tabanlı uygulamanın saf JavaScript ve HTML5 Canvas API kullanılarak yeniden yazılmış sürümü.

## Özellikler

- ✅ Canvas API ile 60 FPS render
- ✅ Vanilla JavaScript (React yok)
- ✅ ES6+ Classes kullanıldı
- ✅ Kontur hesaplama (adaptif smoothing)
- ✅ Çizim modları: Serbest, Bezier, Hazır Şekiller
- ✅ Undo/Redo sistemi (20 adım)
- ✅ Pan & Zoom desteği
- ✅ Grid sistemi
- ✅ Dark/Light tema
- ✅ Export: PNG, PDF, DXF, SVG
- ✅ Proje kaydetme/yükleme (.ercx)

## Kullanım

### Geliştirme
Bu proje doğrudan tarayıcıda çalışabilir. Local server ile çalıştırmak için:

```bash
cd html5
python -m http.server 8000
# veya
npx http-server
```

Tarayıcıda `http://localhost:8000` adresine gidin.

### Yapı
```
html5/
├── index.html              # Ana HTML dosyası
├── styles.css             # Tüm stiller
├── app.js                 # Entry point
├── CanvasEngine.js        # Render döngüsü
├── CanvasRenderer.js      # Canvas çizim mantığı
├── InteractionManager.js   # Mouse/pointer olayları
├── UIManager.js            # DOM UI kontrolü
├── GeometryEngine.js      # Matematiksel hesaplamalar
├── GeometryUtils.js       # Yardımcı fonksiyonlar
└── Exporter.js            # Export işlemleri
```

## Teknoloji

- **Canvas API**: Tüm çizim işlemleri
- **ES6+ Modules**: JavaScript modül sistemi
- **jsPDF**: PDF export (CDN)

## Performans İyileştirmeleri

1. requestAnimationFrame ile 60 FPS render loop
2. Dirty rect rendering (gelecek)
3. Object pooling (gelecek)
4. Offscreen canvas caching (gelecek)

## Mimari

```
app.js (Entry)
    ↓
CanvasEngine (Render Loop Coordinator)
    ├→ CanvasRenderer (Çizim)
    ├→ InteractionManager (Olaylar)
    └→ GeometryEngine (Matematik)
    ↓
UIManager (DOM Kontrolü)
```

## Farklılıklar

| React Sürümü | HTML5 Sürümü |
|--------------|--------------|
| Virtual DOM | Direct Canvas API |
| useState | JS Nesneleri |
| JSX | innerHTML |
| 30-40 FPS | 60 FPS |
| Büyük bundle | Küçük bundle |

## Lisans

Aynı lisans, orijinal React projesiyle aynıdır.
