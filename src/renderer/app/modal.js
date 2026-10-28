/**
 * Controlador de Modales
 */

export class ModalController {
  constructor() {
    this.backdrop = document.getElementById('modal-backdrop');
    this.titleEl = document.getElementById('modal-title');
    this.bodyEl = document.getElementById('modal-body');
    this.footerEl = document.getElementById('modal-footer');
    this.closeBtn = document.getElementById('modal-close-btn');

    this.initEvents();
  }

  initEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.backdrop) {
      this.backdrop.addEventListener('click', (e) => {
        if (e.target === this.backdrop) {
          this.close();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen() {
    return this.backdrop && this.backdrop.classList.contains('open');
  }

  open({ title = '', content = '', footer = null }) {
    if (!this.backdrop) return;
    this.titleEl.textContent = title;

    if (typeof content === 'string') {
      this.bodyEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.bodyEl.innerHTML = '';
      this.bodyEl.appendChild(content);
    }

    if (footer) {
      this.footerEl.style.display = 'flex';
      if (typeof footer === 'string') {
        this.footerEl.innerHTML = footer;
      } else if (footer instanceof HTMLElement) {
        this.footerEl.innerHTML = '';
        this.footerEl.appendChild(footer);
      }
    } else {
      this.footerEl.style.display = 'flex';
      this.footerEl.innerHTML = '<button class="btn btn-secondary" id="modal-default-close">Cerrar</button>';
      document.getElementById('modal-default-close')?.addEventListener('click', () => this.close());
    }

    this.backdrop.classList.add('open');
  }

  close() {
    if (this.backdrop) {
      this.backdrop.classList.remove('open');
    }
  }
}

export const modal = new ModalController();

