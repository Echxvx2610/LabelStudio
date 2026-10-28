# AGENTS.md - Label Studio (editor de etiquetas de escritorio)

## Estado del repo

- **Fases 1–4 completadas:** scaffolding, shell de UI, IPC, núcleo del editor (lienzo SVG en mm, selección/arrastre/redimensión/rotación, snap, undo/redo, alineación, presets) y elementos de etiqueta (texto con autoajuste, QR/códigos reales con validación y aviso de legibilidad, imágenes base64 y formas).
- `plan.md` es la fuente de verdad (alcance, fases, decisiones). Léelo antes de crear código y marca sus casillas `[x]` al completar tareas.

## Comandos reales de desarrollo (package.json)

- `npm run dev`: Levanta servidor de desarrollo Vite (renderer en `http://localhost:5173`)
- `npm run dev:electron`: Levanta Vite y abre Electron de forma concurrente con recarga
- `npm start`: Lanza Electron cargando la compilación en `dist/renderer`
- `npm run build`: Compila los assets del renderer con Vite hacia `dist/renderer`
- `npm run lint`: Ejecuta ESLint sobre el proyecto
- `npm run format`: Formatea el código con Prettier
- `npm test`: Ejecuta las pruebas unitarias con Vitest
- `npm run test:watch`: Ejecuta Vitest en modo interactivo/watch
- *(Nota Windows: en PowerShell con ExecutionPolicy restringida, invocar `npm.cmd`)*

## Stack decidido (del plan)

- **Electron + ES modules JS plano** (sin framework React/Vue), CSS puro con variables. Solo se usa tooling para empaquetado/hot-reload (Electron Forge o Vite) y **electron-builder** para distribuir.
- Códigos de barras/QR con **bwip-js** (salida SVG).
- Tests: **Vitest** (seriales, matriz, conversiones). E2e con Playwright para Electron solo en Fase 10.
- Lenguaje del proyecto y de la UI: **español**.

## Arquitectura (no obvia por nombres de archivo)

- Estructura planeada: `src/main` (ventana, IPC, impresoras), `src/preload` (contextBridge), `src/renderer/` con módulos `app/`, `editor/`, `elements/`, `data/`, `sheet/`, `print/`, `styles/`.
- **El JSON de plantilla es la única fuente de verdad**: editor, preview, matriz e impresión solo lo renderizan. Undo/redo = snapshots de ese JSON.
- El lienzo SVG usa **viewBox en milímetros**; preview e impresión comparten el mismo render (50 mm en pantalla deben ser 50 mm en papel).
- La lógica de seriales va aislada en un módulo **puro y testeado** (`renderer/data/serial.js`); es la unidad de prueba más importante del proyecto.
- Menú: **barra HTML propia**, no el menú nativo (el nativo no respeta la paleta en Linux/Windows).

### Núcleo del editor (`src/renderer/editor/`)

- `geometry.js`: matemática pura en mm (resize con rotación, snap, alinear/distribuir, límites). Sin DOM → cubierta por tests.
- `model.js`: esquema de plantilla, defaults de elementos y presets de etiqueta (`LABEL_PRESETS`).
- `history.js`: snapshots JSON del documento; `store.js`: estado único (plantilla, selección, zoom, grid) + historial.
- `renderer.js`: pinta SVG (grid, elementos, handles, guías, reglas); `interactions.js`: puntero, marquee, zoom/pan; `editor.js`: fachada que consume `app.js`.
- **Toda mutación del documento pasa por `EditorStore`**; si no, no habrá undo/redo ni re-render. Los arrastres usan `beginTransient()` → mutaciones `{ transient: true }` → `commitTransient()` para registrar un solo paso.
- Escala de pantalla: `px = mm * MM_TO_PX * (zoom / 100)` con `MM_TO_PX = 96 / 25.4`. El modelo **nunca** guarda píxeles.
- La posición (x, y) es la esquina superior izquierda **sin rotar**; `rotation` gira sobre el centro. Usa `elementBounds()` para AABB y no asumas esquinas.
- El panel lateral se sincroniza por suscripción al store; al añadir controles, actualízalos también en `syncPanel()` de `app.js`.
- Los tests de `tests/` corren en Node sin DOM: mantén `geometry/model/history/store` libres de `document`/`window`.

### Elementos de etiqueta (Fase 4)

- `element-validation.js`: módulo **puro y testeado** con simbologías, dígito verificador EAN-13, validación de contenido, layout del código dentro de la caja y umbrales de legibilidad (mm por módulo). No importa DOM ni bwip-js.
- `barcodes.js`: genera QR/códigos con bwip-js y devuelve **SVG interno** (vectorial) + metadatos (`kind`, `naturalWidth/Height`, `modulePx`, `modules`) con caché de 150 entradas. QR usa `fixedeclevel: true`; sin eso BWIPP sube el nivel de corrección solo y la opción L/M/Q/H no cambia el resultado.
- La quiet zone se aplica **recortando el área de dibujo** en `codeLayout()`, no con padding de bwip. El código se escala por separado en X/Y dentro de la caja; los códigos matriciales se centran en un cuadrado.
- `data/preview.js`: resuelve solo variables de vista previa (`{{serial}}`, `{{prefijo}}`, `{{sufijo}}`, `{{fecha:...}}`, `{{hora}}`). La serialización completa es Fase 5; no duplicar esa lógica aquí.
- `app/properties-panel.js`: panel dinámico por tipo de elemento. Usa `data-prop` + `data-live` y `beginTransient()`/`commitTransient()` en foco para que arrastrar/teclear produzca un solo paso de undo. Al añadir propiedades, actualiza también `sync()` (evita pisar el campo enfocado).
- Texto: `autoFit` mide con `getBBox()` y cachea el tamaño por contenido/fuente/estilo/caja en `renderer.js`; `editor.preloadFonts()` carga todas las fuentes con `document.fonts.load()` y llama a `renderer.refreshFonts()` para invalidar la caché.
- Fuentes empaquetadas: **Inter** y **Roboto Mono** vía `@fontsource/*` (CSS `latin-*` importado en `app.js`, pesos 400/700 e itálicas de Inter). No añadir fuentes del sistema al modelo.
- Imágenes: se leen con `FileReader` como data URL base64 y se guardan en `element.src`; límite 4 MB y tipos PNG/JPG/WEBP/SVG. Se dibujan con `<image>` y `preserveAspectRatio` según `fit`.
- Los avisos de legibilidad se calculan con el tamaño real del módulo en mm; el renderer pinta un badge `!` en `#layer-overlay` y el panel muestra el detalle. Los umbrales viven en `MIN_MODULE_MM`.

## Seguridad y gotchas

- Electron: `contextIsolation: true`, `nodeIntegration: false`; toda API nativa vía IPC del `preload`. No relajar esto por conveniencia.
- Tema: paleta fija definida en `plan.md` (tokens.css); el rojo `#a4161a` solo para acciones principales/selección/foco.
- Impresión: el mayor riesgo es el descuadre por márgenes del driver. Probar calibración en fases 6-7, no al final; validar siempre con impresora virtual PDF antes de gastar etiquetas reales.
- Fuentes: empaquetar 2-3 fuentes locales con la app (la impresión debe ser idéntica en cualquier equipo).
- Imágenes de elementos se embeben en base64 dentro del JSON de plantilla.
