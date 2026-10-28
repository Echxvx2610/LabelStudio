/**
 * Controlador del panel lateral (Sidebar)
 */

export function setupSidebar() {
  const accordionSections = document.querySelectorAll('.accordion-section');

  accordionSections.forEach((section) => {
    const header = section.querySelector('.accordion-header');
    if (!header) return;

    header.addEventListener('click', () => {
      // Toggle current section
      section.classList.toggle('open');
    });
  });

  // Tab controllers within sidebar if any
  const tabContainers = document.querySelectorAll('.tabs-container');
  tabContainers.forEach((container) => {
    const tabBtns = container.querySelectorAll('.tab-btn');
    const tabContents = container.querySelectorAll('.tab-content');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        tabBtns.forEach((b) => b.classList.remove('active'));
        tabContents.forEach((c) => c.classList.remove('active'));

        btn.classList.add('active');
        container.querySelector(`.tab-content[data-tab-content="${targetTab}"]`)?.classList.add('active');
      });
    });
  });
}

