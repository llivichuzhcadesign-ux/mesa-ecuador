/* Persistent recipe camera controls + explicit camera roll choice */
(() => {
  const STYLE_ID = 'mesaRecipeCameraControlsStyle';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mesa-recipe-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      #recipePageCameraBtn{white-space:nowrap}
      @media(max-width:760px){
        #recipeCameraBtn .camera-label{display:inline!important}
        #recipeCameraBtn{display:inline-flex!important;visibility:visible!important;opacity:1!important;min-width:auto!important;padding:10px 12px!important}
      }
      @media(max-width:520px){
        #recipePageCameraBtn{width:100%;justify-content:center;min-height:48px;font-size:16px}
      }
    `;
    document.head.appendChild(style);
  }

  function getScannerButton() {
    return document.getElementById('recipeCameraBtn');
  }

  function ensureHeaderButtonVisible() {
    const source = getScannerButton();
    if (!source) return;
    source.style.display = 'inline-flex';
    source.style.visibility = 'visible';
    source.style.opacity = '1';
    const label = source.querySelector('.camera-label');
    if (label) label.style.display = 'inline';
  }

  function ensureRecipePageButton() {
    if (typeof view === 'undefined' || view !== 'recipes') return;
    const source = getScannerButton();
    if (!source || !window.mainEl) return;
    const head = mainEl.querySelector('.head');
    if (!head) return;

    let pageButton = document.getElementById('recipePageCameraBtn');
    if (!pageButton) {
      pageButton = document.createElement('button');
      pageButton.id = 'recipePageCameraBtn';
      pageButton.type = 'button';
      pageButton.className = 'btn primary';
      pageButton.textContent = '📷 Nueva receta';
      pageButton.setAttribute('aria-label', 'Escanear o subir una nueva receta');
      pageButton.addEventListener('click', () => source.click());
      head.appendChild(pageButton);
    }
  }

  function upgradeImageChoices() {
    const dialog = document.getElementById('recipeScanDialog');
    const originalInput = document.getElementById('scanFile');
    const originalChoose = document.getElementById('scanChoose');
    if (!dialog || !originalInput || !originalChoose || document.getElementById('scanGallery')) return;

    // Keep the existing input dedicated to taking a new photo.
    originalInput.setAttribute('accept', 'image/*');
    originalInput.setAttribute('capture', 'environment');
    originalChoose.textContent = '📷 Tomar foto';

    // A second input without `capture` opens the iPhone/Android photo library.
    const galleryInput = document.createElement('input');
    galleryInput.id = 'scanGallery';
    galleryInput.type = 'file';
    galleryInput.accept = 'image/*';
    galleryInput.hidden = true;
    originalInput.insertAdjacentElement('afterend', galleryInput);

    const galleryButton = document.createElement('button');
    galleryButton.id = 'scanGalleryBtn';
    galleryButton.type = 'button';
    galleryButton.className = 'btn';
    galleryButton.textContent = '🖼️ Elegir de Fotos';

    const actions = originalChoose.closest('.scan-actions');
    if (actions) {
      actions.classList.add('mesa-recipe-actions');
      originalChoose.insertAdjacentElement('afterend', galleryButton);
    }

    galleryButton.addEventListener('click', () => galleryInput.click());

    galleryInput.addEventListener('change', () => {
      const file = galleryInput.files && galleryInput.files[0];
      if (!file) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        originalInput.files = dt.files;
        originalInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (error) {
        // Safari fallback: temporarily reuse the scanner input without capture.
        originalInput.removeAttribute('capture');
        originalInput.click();
        setTimeout(() => originalInput.setAttribute('capture', 'environment'), 1000);
      }
    });
  }

  function maintain() {
    ensureHeaderButtonVisible();
    ensureRecipePageButton();
    upgradeImageChoices();
  }

  maintain();

  // Sheets refreshes and page navigation replace portions of the DOM. Re-attach controls automatically.
  const observer = new MutationObserver(() => maintain());
  observer.observe(document.body, { childList: true, subtree: true });

  // Also hook navigation/render events without depending on a specific render implementation.
  document.addEventListener('click', event => {
    if (event.target.closest('[data-view]')) setTimeout(maintain, 0);
  });
})();