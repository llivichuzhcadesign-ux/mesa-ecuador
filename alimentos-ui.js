/* Mesa Ecuador — editable Alimentos UI */
(() => {
  const BACKEND = 'https://script.google.com/macros/s/AKfycbwhBMW5tKQa_AYM3TkWQ-PSnlZ9DFSN1mWc-FeSELSDWA22QyHBcaiCFClczwo7nzk9/exec';
  let editMode = false;
  let pressTimer = null;
  const pendingRename = new Map();
  const pendingDelete = new Set();

  const style = document.createElement('style');
  style.textContent = `
    .food-add-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;margin:0 0 18px;box-shadow:var(--shadow)}
    .food-add-row{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center}
    .food-add-input{width:100%;min-height:46px;border:1px solid var(--line);border-radius:13px;background:var(--card);padding:11px 13px;font-size:16px}
    .food-helper{font-size:12px;color:var(--muted);margin-top:7px}
    .food-edit-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 12px}
    .food-edit-note{font-size:12px;color:var(--muted)}
    .food-chip-wrap{position:relative;display:inline-flex}
    .food-chip-wrap .chip{padding-right:13px;touch-action:manipulation;user-select:none;-webkit-user-select:none}
    .food-delete{display:none;position:absolute;right:-7px;top:-8px;width:24px;height:24px;border-radius:50%;border:2px solid var(--card);background:#c7382c;color:white;font-weight:900;line-height:18px;padding:0;align-items:center;justify-content:center;z-index:2}
    .food-editing .food-delete{display:flex}
    .food-editing .food-chip-wrap{animation:foodWiggle .28s ease-in-out infinite alternate}
    .food-editing .food-chip-wrap:nth-child(2n){animation-delay:-.13s}
    .food-editing .food-chip-wrap:nth-child(3n){animation-delay:-.21s}
    .food-editing .chip{padding-right:18px}
    @keyframes foodWiggle{from{transform:rotate(-1.1deg)}to{transform:rotate(1.1deg)}}
    @media(prefers-reduced-motion:reduce){.food-editing .food-chip-wrap{animation:none}}
    .food-rename-dialog{width:min(92vw,420px)}
    .food-rename-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    @media(max-width:560px){.food-add-row{grid-template-columns:1fr}.food-add-row .btn{width:100%}.food-edit-bar{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);

  const renameDialog = document.createElement('dialog');
  renameDialog.className = 'food-rename-dialog';
  renameDialog.innerHTML = `<div class="modal">
    <h2 style="margin-top:0">Editar alimento</h2>
    <div class="field"><label for="foodRenameInput">Nombre</label><input id="foodRenameInput" autocomplete="off"></div>
    <div class="food-rename-actions"><button type="button" class="btn" id="foodRenameCancel">Cancelar</button><button type="button" class="btn primary" id="foodRenameSave">Guardar nombre</button></div>
  </div>`;
  document.body.appendChild(renameDialog);
  const renameInput = renameDialog.querySelector('#foodRenameInput');
  let renameTarget = null;

  function foodRows() {
    const rows = Array.isArray(window.MESA_FOODS) ? window.MESA_FOODS : [];
    return rows.filter(row => !pendingDelete.has(String(row.id)));
  }

  function groupRows() {
    const groups = {};
    for (const row of foodRows()) {
      const category = row.categoria || 'Otros';
      (groups[category] ||= []).push(row);
    }
    return groups;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function displayName(row) {
    return pendingRename.get(String(row.id)) || row.nombre || row.id;
  }

  const originalPantry = pantry;
  pantry = function() {
    const groups = groupRows();
    const groupHtml = Object.entries(groups).map(([category, rows]) => `
      <section class="section">
        <h3>${esc(category)}</h3>
        <div class="chips food-chip-group">
          ${rows.map(row => {
            const id = String(row.id);
            const ingredient = typeof sheetIngredient === 'function' ? sheetIngredient(row.id || row.nombre) : id;
            const available = state.pantry[ingredient] !== false;
            return `<span class="food-chip-wrap" data-food-id="${esc(id)}" data-food-key="${esc(ingredient)}">
              <button type="button" class="chip food-chip ${available?'on':'off'}" data-food-id="${esc(id)}" data-food-key="${esc(ingredient)}">${available?'✓ ':''}${esc(displayName(row))}</button>
              <button type="button" class="food-delete" data-delete-food="${esc(id)}" aria-label="Eliminar ${esc(displayName(row))}">×</button>
            </span>`;
          }).join('')}
        </div>
      </section>`).join('');

    return head('Alimentos disponibles','Toca para marcar disponibilidad. Mantén presionado un alimento para editar.') +
      `<div class="food-add-card">
        <div class="food-add-row">
          <input id="foodAddInput" class="food-add-input" placeholder="Añadir alimentos: tomate, arroz, yogur griego" autocomplete="off">
          <button type="button" id="foodSaveAll" class="btn primary">Guardar alimentos</button>
        </div>
        <div class="food-helper">Puedes agregar varios a la vez. Sepáralos con comas.</div>
      </div>
      <div class="food-edit-bar">
        <div class="food-edit-note">${editMode?'Modo edición: toca un alimento para cambiar su nombre o × para eliminar.':'Mantén presionado cualquier alimento para editar la lista.'}</div>
        ${editMode?'<button type="button" class="btn small" id="foodEditDone">Listo</button>':''}
      </div>
      <div id="foodCatalog" class="${editMode?'food-editing':''}">${groupHtml || '<div class="card empty">No hay alimentos todavía.</div>'}</div>`;
  };

  function enterEditMode() {
    if (editMode) return;
    editMode = true;
    render();
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
  }

  function openRename(id) {
    const row = (window.MESA_FOODS || []).find(r => String(r.id) === String(id));
    if (!row) return;
    renameTarget = String(id);
    renameInput.value = displayName(row);
    renameDialog.showModal();
    setTimeout(() => { renameInput.focus(); renameInput.select(); }, 30);
  }

  renameDialog.querySelector('#foodRenameCancel').addEventListener('click', () => renameDialog.close());
  renameDialog.querySelector('#foodRenameSave').addEventListener('click', () => {
    const name = renameInput.value.trim();
    if (!renameTarget || !name) return;
    pendingRename.set(renameTarget, name);
    renameDialog.close();
    render();
  });

  function parseAdds() {
    const input = document.getElementById('foodAddInput');
    if (!input) return [];
    const seen = new Set();
    return input.value.split(',').map(x => x.trim()).filter(name => {
      const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function saveFoodChanges() {
    const adds = parseAdds().map(name => ({name}));
    const rename = [...pendingRename.entries()].filter(([id]) => !pendingDelete.has(id)).map(([id,name]) => ({id,name}));
    const del = [...pendingDelete];
    if (!adds.length && !rename.length && !del.length) {
      toast('No hay cambios por guardar');
      return;
    }
    const button = document.getElementById('foodSaveAll');
    if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
    try {
      const body = new URLSearchParams({
        action:'save_foods',
        changes:JSON.stringify({add:adds,rename,delete:del})
      });
      await fetch(BACKEND,{method:'POST',body,mode:'no-cors'});
      await new Promise(resolve => setTimeout(resolve,900));
      pendingRename.clear();
      pendingDelete.clear();
      editMode = false;
      await pullCloud();
      toast('Alimentos guardados');
    } catch (error) {
      console.error(error);
      toast('No se pudieron guardar los alimentos');
      if (button) { button.disabled = false; button.textContent = 'Guardar alimentos'; }
    }
  }

  function bindFoodUi() {
    if (typeof view === 'undefined' || view !== 'pantry') return;
    const catalog = document.getElementById('foodCatalog');
    if (!catalog || catalog.dataset.bound === '1') return;
    catalog.dataset.bound = '1';

    catalog.addEventListener('pointerdown', event => {
      const chip = event.target.closest('.food-chip');
      if (!chip || editMode) return;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => enterEditMode(), 520);
    });
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    catalog.addEventListener('pointerup', cancelPress);
    catalog.addEventListener('pointercancel', cancelPress);
    catalog.addEventListener('pointerleave', cancelPress);

    catalog.addEventListener('click', event => {
      const del = event.target.closest('[data-delete-food]');
      if (del) {
        event.preventDefault();
        event.stopPropagation();
        pendingDelete.add(String(del.dataset.deleteFood));
        render();
        return;
      }
      const chip = event.target.closest('.food-chip');
      if (!chip) return;
      if (editMode) {
        event.preventDefault();
        openRename(chip.dataset.foodId);
        return;
      }
      toggleFood(chip.dataset.foodKey);
    });

    document.getElementById('foodEditDone')?.addEventListener('click', () => {
      editMode = false;
      render();
    });
    document.getElementById('foodSaveAll')?.addEventListener('click', saveFoodChanges);
  }

  const oldRender = render;
  render = function(...args) {
    const result = oldRender.apply(this,args);
    queueMicrotask(bindFoodUi);
    return result;
  };

  const observer = new MutationObserver(() => {
    if (typeof view !== 'undefined' && view === 'pantry') bindFoodUi();
  });
  observer.observe(mainEl,{childList:true,subtree:true});

  if (typeof view !== 'undefined' && view === 'pantry') render();
})();