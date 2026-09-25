(() => {
  'use strict';

  // Kaydırınca header gölgesi
  const header = document.querySelector('[data-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Arama çubuğu
  const searchToggle = document.querySelector('[data-search-toggle]');
  const search = document.querySelector('[data-search]');
  if (searchToggle && search) {
    searchToggle.addEventListener('click', () => {
      const open = search.hidden;
      search.hidden = !open;
      searchToggle.setAttribute('aria-expanded', String(open));
      if (open) search.querySelector('input').focus();
    });
  }

  // Mobil menü
  const navToggle = document.querySelector('[data-nav-toggle]');
  const mobileNav = document.querySelector('[data-mobile-nav]');
  if (navToggle && mobileNav) {
    const setOpen = (open) => {
      mobileNav.hidden = !open;
      navToggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) mobileNav.querySelector('[data-nav-close]').focus();
    };
    navToggle.addEventListener('click', () => setOpen(true));
    mobileNav.addEventListener('click', (e) => {
      if (e.target === mobileNav || e.target.closest('[data-nav-close]')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !mobileNav.hidden) { setOpen(false); navToggle.focus(); }
    });
  }

  // Ürün galerisi
  const gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    const main = gallery.querySelector('[data-gallery-main]');
    gallery.querySelectorAll('.gallery__thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        if (!main || thumb.classList.contains('is-active')) return;
        gallery.querySelectorAll('.gallery__thumb').forEach((t) => t.classList.remove('is-active'));
        thumb.classList.add('is-active');
        main.classList.add('is-fading');
        setTimeout(() => { main.src = thumb.dataset.src; main.classList.remove('is-fading'); }, 180);
      });
    });
  }

  // Filtre formu: seçim değişince otomatik gönder
  const autoForm = document.querySelector('[data-autosubmit]');
  if (autoForm) {
    autoForm.querySelectorAll('select, input[type="checkbox"]').forEach((el) => {
      el.addEventListener('change', () => autoForm.requestSubmit ? autoForm.requestSubmit() : autoForm.submit());
    });
  }
})();
