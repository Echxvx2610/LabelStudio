/**
 * Controlador de divisores redimensionables (splitters)
 */

export function setupSplitters() {
  const splitterH = document.getElementById('splitter-sidebar');
  const sidebar = document.getElementById('sidebar');

  const splitterV = document.getElementById('splitter-matrix');
  const matrixZone = document.getElementById('matrix-zone');
  const editorZone = document.getElementById('editor-zone');

  // Divisor horizontal (Sidebar)
  if (splitterH && sidebar) {
    let isDraggingH = false;

    splitterH.addEventListener('mousedown', (e) => {
      isDraggingH = true;
      splitterH.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingH) return;
      const newWidth = Math.min(Math.max(e.clientX, 260), 480);
      sidebar.style.width = `${newWidth}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingH) {
        isDraggingH = false;
        splitterH.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Divisor vertical (Zona de Edición / Matriz)
  if (splitterV && matrixZone && editorZone) {
    let isDraggingV = false;

    splitterV.addEventListener('mousedown', (e) => {
      isDraggingV = true;
      splitterV.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingV) return;
      const workspace = matrixZone.parentElement;
      const workspaceRect = workspace.getBoundingClientRect();
      const newHeight = workspaceRect.bottom - e.clientY;

      if (newHeight >= 120 && newHeight <= workspaceRect.height - 180) {
        matrixZone.style.height = `${newHeight}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingV) {
        isDraggingV = false;
        splitterV.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
}

