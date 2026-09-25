(() => {
  'use strict';

  // Silme vb. işlemler için onay (satır içi JS kullanmadan; CSP ile uyumlu)
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // Seçim değişince formu gönder
  document.querySelectorAll('select[data-autosubmit]').forEach((sel) => {
    sel.addEventListener('change', () => sel.form && (sel.form.requestSubmit ? sel.form.requestSubmit() : sel.form.submit()));
  });

  // Mobil yan menü
  const side = document.querySelector('[data-side]');
  const sideToggle = document.querySelector('[data-side-toggle]');
  if (side && sideToggle) {
    sideToggle.addEventListener('click', (e) => { e.stopPropagation(); side.classList.toggle('is-open'); });
    document.addEventListener('click', (e) => {
      if (side.classList.contains('is-open') && !side.contains(e.target)) side.classList.remove('is-open');
    });
  }

  // Ürün adından otomatik URL önerisi (kullanıcı elle değiştirmediyse)
  const TR = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  const slugify = (s) => s.replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c]).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const src = document.querySelector('[data-slug-source]');
  const target = document.querySelector('[data-slug-target]');
  if (src && target) {
    let touched = target.value !== '';
    target.addEventListener('input', () => { touched = target.value !== ''; });
    src.addEventListener('input', () => { if (!touched) target.placeholder = slugify(src.value); });
    if (!touched) target.placeholder = slugify(src.value);
  }

  // Görsel önizleme + sürükle bırak
  const input = document.querySelector('[data-file-input]');
  const preview = document.querySelector('[data-preview]');
  const drop = document.querySelector('[data-drop]');
  if (input && preview) {
    input.addEventListener('change', () => {
      preview.replaceChildren();
      Array.from(input.files).slice(0, 10).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const img = document.createElement('img');
        img.alt = '';
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        preview.appendChild(img);
      });
    });
  }
  if (drop) {
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.add('is-over')));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  }
})();
