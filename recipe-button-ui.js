/* Make recipe scanner action obvious on every screen size */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    @media(max-width:760px){
      .recipe-camera .camera-label{display:inline!important}
      .recipe-camera{min-width:auto!important;padding:10px 12px!important;margin-right:6px!important}
    }
    #recipePageCameraBtn{white-space:nowrap}
    @media(max-width:520px){
      #recipePageCameraBtn{width:100%;justify-content:center}
      main .head:has(#recipePageCameraBtn){align-items:stretch;flex-direction:column}
    }
  `;
  document.head.appendChild(style);

  function mountRecipeAction() {
    const source = document.getElementById('recipeCameraBtn');
    if (!source || typeof view === 'undefined' || view !== 'recipes') return;
    if (document.getElementById('recipePageCameraBtn')) return;
    const headEl = mainEl && mainEl.querySelector ? mainEl.querySelector('.head') : null;
    if (!headEl) return;
    const button = document.createElement('button');
    button.id = 'recipePageCameraBtn';
    button.type = 'button';
    button.className = 'btn primary';
    button.textContent = '📷 Nueva receta';
    button.setAttribute('aria-label','Escanear y agregar una nueva receta');
    button.addEventListener('click', () => source.click());
    headEl.appendChild(button);
  }

  const previousRender = render;
  render = function(...args) {
    const result = previousRender.apply(this, args);
    queueMicrotask(mountRecipeAction);
    return result;
  };

  mountRecipeAction();
})();
