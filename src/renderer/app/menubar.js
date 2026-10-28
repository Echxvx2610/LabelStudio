/**
 * Controlador de la barra de menú HTML propia
 */

export function setupMenubar(onMenuAction) {
  const menuItems = document.querySelectorAll('.menu-item');
  let activeMenu = null;

  function closeAll() {
    menuItems.forEach((item) => item.classList.remove('active'));
    activeMenu = null;
  }

  menuItems.forEach((item) => {
    const btn = item.querySelector('.menu-btn');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeMenu === item) {
        closeAll();
      } else {
        closeAll();
        item.classList.add('active');
        activeMenu = item;
      }
    });

    btn.addEventListener('mouseenter', () => {
      if (activeMenu && activeMenu !== item) {
        closeAll();
        item.classList.add('active');
        activeMenu = item;
      }
    });
  });

  // Manejar clics en opciones del dropdown
  document.querySelectorAll('.menu-dropdown-item').forEach((dropdownItem) => {
    dropdownItem.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = dropdownItem.getAttribute('data-action');
      closeAll();
      if (action && onMenuAction) {
        onMenuAction(action);
      }
    });
  });

  // Cerrar al hacer clic en cualquier lugar fuera de los menús
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.menubar')) {
      closeAll();
    }
  });

  // Cerrar con Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeMenu) {
      closeAll();
    }
  });
}

