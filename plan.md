# Label Studio: Plan de acción

Editor/generador de etiquetas de escritorio (Electron + JS) con edición en vivo, matriz de impresión, seriales autoincrementables e impresión directa.

> Marca las casillas `[x]` conforme avances. Los tiempos son días de trabajo efectivo.

---

## Índice

- [Decisiones técnicas base](#decisiones-técnicas-base)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Fase 0: Definición](#fase-0-definición)
- [Fase 1: Scaffolding y arquitectura](#fase-1-scaffolding-y-arquitectura)
- [Fase 2: Sistema de diseño y shell de la UI](#fase-2-sistema-de-diseño-y-shell-de-la-ui)
- [Fase 3: Núcleo del editor](#fase-3-núcleo-del-editor)
- [Fase 4: Elementos de etiqueta](#fase-4-elementos-de-etiqueta)
- [Fase 5: Variables, fechas y serialización](#fase-5-variables-fechas-y-serialización)
- [Fase 6: Matriz de impresión](#fase-6-matriz-de-impresión)
- [Fase 7: Impresión e impresoras](#fase-7-impresión-e-impresoras)
- [Fase 8: Datos externos](#fase-8-datos-externos)
- [Fase 9: Plantillas, archivos e historial](#fase-9-plantillas-archivos-e-historial)
- [Fase 10: Pulido, pruebas y distribución](#fase-10-pulido-pruebas-y-distribución)
- [Cronograma](#cronograma)
- [Riesgos](#riesgos)

---

## Decisiones técnicas base

| Tema | Decisión | Por qué |
|---|---|---|
| Lienzo de edición | **SVG** con unidades en mm | Vectorial, nítido al imprimir, escala exacta; el preview y la impresión usan el mismo render |
| Códigos | **bwip-js** (QR, Code128, EAN, DataMatrix, etc.) | Una sola librería, salida SVG, muchas simbologías |
| Estado | **Modelo JSON de plantilla** como única fuente de verdad | Editor, preview, matriz e impresión solo lo "renderizan" |
| UI | JS modular (ES modules) + CSS puro con variables | Sin framework, control total del tema |
| Menú | **Barra de menú HTML propia** (no el menú nativo) | El menú nativo no respeta la paleta en Linux/Windows |
| Persistencia | JSON en `userData`; SQLite solo si el historial crece | Simple primero |
| Seguridad Electron | `contextIsolation: true`, `nodeIntegration: false`, IPC vía `preload` | Evita deuda de seguridad desde el día 1 |

---

## Estructura del proyecto

```
label-studio/
├─ src/
│  ├─ main/            # proceso principal: ventana, IPC, impresoras, archivos
│  ├─ preload/         # contextBridge (API segura hacia el renderer)
│  └─ renderer/
│     ├─ app/          # layout, menubar, sidebar, atajos
│     ├─ editor/       # canvas SVG, selección, herramientas, undo/redo
│     ├─ elements/     # text, barcode, qr, shape, image
│     ├─ data/         # variables, seriales, import CSV/Excel
│     ├─ sheet/        # matriz de impresión y paginación
│     ├─ print/        # generación de salida y envío a impresora
│     └─ styles/       # tokens.css, base.css, components/
├─ templates/          # plantillas de ejemplo
└─ tests/
```

---

## Fase 0: Definición

**Duración:** 1-2 días

- [ ] Reunir 3 a 5 etiquetas reales del trabajo (fotos o PDFs) como casos de prueba
- [ ] Definir el MVP: *etiqueta con texto + QR/barras, serial autoincremental, matriz en A4, imprimir*
- [ ] Documentar el esquema JSON de la plantilla (ejemplo abajo)
- [ ] Averiguar qué impresoras se usan (térmica de rollo, láser/inyección con hojas, o ambas)
- [ ] Averiguar qué sistema operativo usan los equipos donde se instalará

### Esquema JSON de plantilla (borrador)

```json
{
  "version": 1,
  "name": "Etiqueta equipo",
  "label": { "width": 50, "height": 30, "unit": "mm", "radius": 1 },
  "elements": [
    { "id": "e1", "type": "text", "x": 3, "y": 4, "w": 30, "h": 6,
      "content": "{{prefijo}}-{{serial}}", "font": "Inter", "size": 11, "bold": true },
    { "id": "e2", "type": "qr", "x": 34, "y": 3, "w": 14, "h": 14,
      "content": "{{serial}}" },
    { "id": "e3", "type": "text", "x": 3, "y": 22, "content": "{{fecha:DD/MM/YYYY}}" }
  ],
  "serial": { "prefix": "EQ-", "start": 1, "step": 1, "padding": 4, "suffix": "", "base": "dec" },
  "sheet": { "page": "A4", "cols": 3, "rows": 8, "marginTop": 10, "marginLeft": 5,
             "gapX": 2, "gapY": 2, "startAt": 1 }
}
```

**Entregable:** documento de alcance + esquema JSON + etiquetas de referencia.

---

## Fase 1: Scaffolding y arquitectura

**Duración:** 1-2 días

- [x] Inicializar proyecto con Electron + Vite o Electron Forge (solo empaquetado y recarga en caliente; el código sigue siendo JS plano)
- [x] Configurar ventana principal y `preload.js`
- [x] Canal IPC básico de prueba (`ping`)
- [x] ESLint + Prettier
- [x] Repositorio Git y estructura de carpetas
- [x] Vitest para pruebas unitarias (seriales y matriz)

**Entregable:** app que abre una ventana vacía con IPC funcionando.

---

## Fase 2: Sistema de diseño y shell de la UI

**Duración:** 3-4 días

### Tokens de color (`styles/tokens.css`)

Paleta base: `#0b090a`, `#161a1d`, `#660708`, `#a4161a`, `#ba181b`, `#e5383b`, `#b1a7a6`, `#d3d3d3`, `#f5f3f4`, `#ffffff`

```css
:root {
  /* Primarios (claros) */
  --bg-app: #f5f3f4;
  --bg-surface: #ffffff;
  --border: #d3d3d3;
  --text-muted: #b1a7a6;

  /* Secundarios (oscuros) */
  --ink: #0b090a;
  --ink-soft: #161a1d;

  /* Acento (rojos) */
  --accent-deep: #660708;
  --accent: #a4161a;
  --accent-hover: #ba181b;
  --accent-bright: #e5383b;
}
```

Criterio de uso: fondo `#f5f3f4`, paneles `#ffffff`, bordes `#d3d3d3`, texto `#0b090a`, barra de menú oscura `#161a1d`. El rojo `#a4161a` se reserva para acciones principales, selección y foco.

### Layout (CSS Grid, según boceto)

```
┌──────────────────────────────────────────┐
│ Barra de menú (Archivo Editar Ver ...)   │
├────────────┬─────────────────────────────┤
│            │  Zona de edición en vivo    │
│  Sidebar   ├─────────────────────────────┤
│  opciones  │  Matriz de impresión        │
│            │                             │
└────────────┴─────────────────────────────┘
```

### Tareas

- [x] `tokens.css` y `base.css` (reset, tipografía, scrollbars)
- [x] Grid principal con sidebar + zona de edición + zona de matriz
- [x] Divisores redimensionables (sidebar y edición/matriz)
- [x] Sidebar con secciones colapsables: Etiqueta, Elemento seleccionado, Datos, Serialización, Matriz, Impresión
- [x] Componentes base: botón, input numérico con unidad, select, toggle, color, tabs, tooltip, modal
- [x] Barra de menú HTML con submenús y atajos visibles
- [x] Gestor de atajos de teclado centralizado

### Menús

- **Archivo:** Nuevo, Abrir, Guardar, Guardar como, Importar datos, Exportar (PDF/PNG/SVG), Salir
- **Editar:** Deshacer, Rehacer, Copiar, Pegar, Duplicar, Eliminar, Seleccionar todo
- **Insertar:** Texto, Código QR, Código de barras, Imagen, Línea, Rectángulo, Campo variable
- **Ver:** Zoom, Cuadrícula, Reglas, Guías
- **Impresión:** Configurar matriz, Vista previa, Imprimir, Impresoras
- **Ayuda:** Atajos, Acerca de

**Entregable:** interfaz navegable con el tema aplicado, aún sin lógica de edición.

---

## Fase 3: Núcleo del editor

**Duración:** 5-7 días (la fase más pesada)

- [x] Lienzo SVG con `viewBox` en mm
- [x] Zoom (rueda + Ctrl) y desplazamiento
- [x] Reglas y cuadrícula
- [x] Snap a cuadrícula, bordes y otros elementos
- [x] Selección: clic, múltiple (Shift), caja de selección
- [x] Manejadores de redimensión y rotación
- [x] Mover con ratón y con flechas (Shift = paso mayor)
- [x] Historial undo/redo (snapshots del JSON)
- [x] Panel de propiedades sincronizado con el elemento seleccionado (X, Y, ancho, alto, rotación)
- [x] Orden de capas (traer al frente / enviar atrás)
- [x] Alinear y distribuir
- [x] Configuración de etiqueta: presets + tamaño personalizado, orientación, radio de esquinas

**Entregable:** crear una etiqueta con rectángulos y moverlos con precisión.

---

## Fase 4: Elementos de etiqueta

**Duración:** 4-5 días

- [x] **Texto:** fuente, tamaño (pt), negrita/cursiva, alineación, interlineado, multilínea, ajuste automático a la caja
- [x] Empaquetar 2-3 fuentes locales (impresión idéntica en cualquier equipo)
- [x] **QR:** nivel de corrección de errores, margen (quiet zone), contenido con variables
- [x] **Códigos de barras:** Code128, Code39, EAN-13, ITF, DataMatrix; opción de texto legible
- [x] **Imagen / logo:** PNG/JPG/SVG embebido en base64 dentro de la plantilla
- [x] **Formas:** línea, rectángulo, elipse (borde y relleno)
- [x] Validación de contenido según simbología (ej. EAN-13 solo numérico)
- [x] Aviso cuando un código queda demasiado pequeño para leerse

**Entregable:** reproducir al menos una etiqueta real de referencia.

---

## Fase 5: Variables, fechas y serialización

**Duración:** 4-5 días

Aislar en un módulo **puro y testeado** (`data/serial.js`).

- [ ] Sistema de variables `{{nombre}}` en texto, QR y barras
- [ ] Fechas con formato: `{{fecha:DD/MM/YYYY}}`, `{{hora}}`, `{{fecha:+30d}}`
- [ ] Generador de seriales: prefijo, sufijo, inicio, paso, relleno con ceros
- [ ] Bases: decimal, hexadecimal, alfabética (A…Z, AA…), alfanumérica
- [ ] Cantidad total (n) y reinicio (por día, por lote, manual)
- [ ] Persistir último valor usado por plantilla (editable manualmente)
- [ ] Modos de contenido en la matriz:
  - **Serial:** n etiquetas con ID distinto
  - **Copias:** n copias idénticas
  - **Lista de datos:** una fila por etiqueta (Fase 8)
- [ ] Vista previa de la secuencia ("EQ-0001 … EQ-0050") antes de imprimir
- [ ] Pruebas unitarias: desbordes de padding, cambio de base, pasos negativos

**Entregable:** etiquetas con ID autoincremental funcionando en el preview.

---

## Fase 6: Matriz de impresión

**Duración:** 4-5 días

- [ ] Configuración de página: A4, Carta, personalizada, orientación
- [ ] Parámetros: columnas, filas, márgenes, separación horizontal/vertical
- [ ] Cálculo automático de columnas/filas según tamaño de etiqueta
- [ ] Posición de inicio (clic sobre la matriz para reaprovechar hojas usadas)
- [ ] Paginación automática cuando n supera la capacidad de una hoja
- [ ] Vista previa con navegación por páginas y zoom
- [ ] Marcas de corte opcionales
- [ ] Perfiles guardables de hojas comerciales (ej. "3×8 de 63.5×33.9 mm")
- [ ] Modo rollo continuo (sin matriz) para térmicas
- [ ] Calibración fina de desplazamiento X/Y

**Entregable:** matriz con n etiquetas seriadas distribuidas correctamente en páginas.

---

## Fase 7: Impresión e impresoras

**Duración:** 5-7 días

### Ruta A: Driver del sistema (hacer primero)

- [ ] Listar impresoras con `webContents.getPrintersAsync()`
- [ ] Ventana oculta que renderiza solo las páginas de la matriz
- [ ] Imprimir con `webContents.print({ deviceName, silent, pageSize, margins })`
- [ ] Selector de impresora y número de copias
- [ ] Exportar a PDF (`printToPDF`) como respaldo y para pruebas sin papel
- [ ] Guardar última impresora usada por plantilla
- [ ] Probar primero con impresora virtual PDF antes de gastar etiquetas
- [ ] Verificar medida real con regla (50 mm en pantalla = 50 mm en papel)

### Ruta B: Térmicas en modo directo (solo si hace falta)

- [ ] Definir lenguaje: ZPL (Zebra), TSPL (TSC) o ESC/POS
- [ ] Envío por red (socket puerto 9100), USB o `lp -o raw` en CUPS
- [ ] Empezar con etiqueta rasterizada como imagen (funciona con cualquier lenguaje)
- [ ] Pasar a comandos nativos solo si la calidad lo exige

**Entregable:** imprimir una hoja completa y una tira de rollo en una impresora real.

---

## Fase 8: Datos externos

**Duración:** 3-4 días

- [ ] Importar CSV y Excel (`xlsx`/SheetJS) con vista previa de tabla
- [ ] Mapeo de columnas a variables `{{columna}}` (automático por encabezado)
- [ ] Una fila = una etiqueta; opción de repetir cada fila k veces
- [ ] Combinar con serial (columna de datos + ID autoincremental)
- [ ] Filtros básicos
- [ ] Validación de filas vacías o con errores antes de imprimir

---

## Fase 9: Plantillas, archivos e historial

**Duración:** 3-4 días

- [ ] Guardar/abrir plantillas (`.label.json` o extensión propia)
- [ ] Autoguardado y recuperación tras cierre inesperado
- [ ] Biblioteca de plantillas con miniaturas y ejemplos incluidos
- [ ] Historial de impresiones: fecha, plantilla, rango de serial, cantidad, impresora
- [ ] SQLite (`better-sqlite3`) para el historial si el volumen crece
- [ ] Exportar etiqueta individual como PNG/SVG/PDF
- [ ] Ajustes de aplicación: unidades (mm/cm/in), idioma, impresora por defecto

---

## Fase 10: Pulido, pruebas y distribución

**Duración:** 4-5 días

- [ ] Atajos de teclado completos y panel de ayuda
- [ ] Accesibilidad básica: foco visible, contraste, navegación por teclado en menús
- [ ] Prueba de rendimiento con 1000+ etiquetas (renderizar páginas bajo demanda)
- [ ] Pruebas unitarias: seriales, layout de matriz, conversión de unidades
- [ ] Pruebas e2e con Playwright para Electron (crear etiqueta → serializar → exportar PDF)
- [ ] Manejo de errores amigable (impresora desconectada, archivo corrupto)
- [ ] Empaquetado con electron-builder: AppImage/RPM (Fedora) y NSIS (Windows) según corresponda
- [ ] Autoactualización opcional

---

## Cronograma

| Fase | Duración | Acumulado |
|---|---|---|
| 0. Definición | 1-2 d | ~2 d |
| 1. Scaffolding | 1-2 d | ~4 d |
| 2. UI y tema | 3-4 d | ~8 d |
| 3. Núcleo del editor | 5-7 d | ~15 d |
| 4. Elementos | 4-5 d | ~20 d |
| 5. Variables y seriales | 4-5 d | ~25 d |
| 6. Matriz | 4-5 d | ~30 d |
| 7. Impresión | 5-7 d | ~37 d |
| 8-9. Datos y plantillas | 6-8 d | ~45 d |
| 10. Pulido y distribución | 4-5 d | ~50 d |

**MVP útil (fases 0 a 7):** ~37 días. Versión recortada para imprimir antes: fases 1, 2, 3 (básica), 4 (texto + QR), 5 (serial simple), 6 y 7 (Ruta A).

---

## Riesgos

- **Descuadre al imprimir:** el navegador y el driver aplican márgenes propios. Mitigar con calibración X/Y y probar en las fases 6-7, no al final.
- **Tamaño físico real:** validar con regla desde la primera impresión.
- **Fuentes distintas entre equipos:** empaquetarlas con la app.
- **Códigos ilegibles:** validar tamaño mínimo y contraste; probar con un lector real.
- **Alcance creciente:** manda el MVP definido en la Fase 0.

---

## Preguntas abiertas

- [ ] ¿Impresora de rollo térmico (Zebra, TSC, Brother…) o de hojas de etiquetas (láser/inyección)?
- [ ] ¿Qué sistema operativo usan los equipos del trabajo?
- [ ] ¿Cuántas etiquetas se imprimen por lote normalmente? (define el rendimiento objetivo)
- [ ] ¿Se necesita trazabilidad de seriales entre varios equipos o basta con uso local?