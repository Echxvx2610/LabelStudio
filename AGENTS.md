# AGENTS.md - Label Studio (editor de etiquetas de escritorio)

## Estado del repo

- **Fases 1 y 2 completadas:** Scaffolding, arquitectura, sistema de diseño, shell de UI y IPC listos.
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

## Seguridad y gotchas

- Electron: `contextIsolation: true`, `nodeIntegration: false`; toda API nativa vía IPC del `preload`. No relajar esto por conveniencia.
- Tema: paleta fija definida en `plan.md` (tokens.css); el rojo `#a4161a` solo para acciones principales/selección/foco.
- Impresión: el mayor riesgo es el descuadre por márgenes del driver. Probar calibración en fases 6-7, no al final; validar siempre con impresora virtual PDF antes de gastar etiquetas reales.
- Fuentes: empaquetar 2-3 fuentes locales con la app (la impresión debe ser idéntica en cualquier equipo).
- Imágenes de elementos se embeben en base64 dentro del JSON de plantilla.
