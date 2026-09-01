/* Mesa Ecuador — Google Sheets live connector */
(() => {
  const MESA_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwhBMW5tKQa_AYM3TkWQ-PSnlZ9DFSN1mWc-FeSELSDWA22QyHBcaiCFClczwo7nzk9/exec';
  const TYPE_FROM_SHEET = { Desayuno: 'breakfast', Almuerzo: 'lunch', Cena: 'dinner' };
  const ING_FROM_SHEET = Object.fromEntries(Object.entries(LABELS).map(([key, value]) => [value.toLowerCase(), key]));

  const sheetIngredient = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return ING_FROM_SHEET[normalized] || String(value || '').trim();
  };

  const persistLocal = () => {
    state._updatedAt = Date.now();
    state.syncUrl = MESA_SHEETS_URL;
    state.syncToken = 'sheets-connected';
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  };

  // Replace the legacy whole-state sync. Each user action now writes its own row change.
  save = function () { persistLocal(); };
  pushCloud = async function () { return true; };

  async function postSheet(action, data = {}) {
    const body = new URLSearchParams({ action, ...data });
    await fetch(MESA_SHEETS_URL, { method: 'POST', body, mode: 'no-cors' });
  }

  function fetchSheetData() {
    return new Promise((resolve, reject) => {
      const callback = '__mesaSheets_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const timer = setTimeout(() => finish(new Error('Tiempo de espera agotado')), 15000);

      function finish(error, data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { delete window[callback]; } catch {}
        script.remove();
        error ? reject(error) : resolve(data);
      }

      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('No se pudo cargar Google Sheets'));
      script.src = MESA_SHEETS_URL + '?action=bootstrap&callback=' + encodeURIComponent(callback) + '&_=' + Date.now();
      document.head.appendChild(script);
    });
  }

  function updateConnectionUi(statusText) {
    if (typeof syncUrlEl !== 'undefined' && syncUrlEl) {
      syncUrlEl.value = MESA_SHEETS_URL;
      const field = syncUrlEl.closest('.field');
      if (field) field.style.display = 'none';
    }
    if (typeof syncTokenEl !== 'undefined' && syncTokenEl) {
      syncTokenEl.value = 'sheets-connected';
      const field = syncTokenEl.closest('.field');
      if (field) field.style.display = 'none';
    }
    if (typeof disconnectEl !== 'undefined' && disconnectEl) disconnectEl.style.display = 'none';
    if (typeof pullNowEl !== 'undefined' && pullNowEl) pullNowEl.style.display = 'none';
    if (typeof syncNowEl !== 'undefined' && syncNowEl) syncNowEl.textContent = 'Actualizar desde Sheets';

    const modal = document.querySelector('#settingsDialog .modal');
    if (modal) {
      const heading = modal.querySelector('h3');
      const note = modal.querySelector('.note');
      if (heading) heading.textContent = 'Google Sheets';
      if (note) note.innerHTML = statusText || 'Conectando con <strong>Mesa Ecuador — Datos</strong>…';
    }
  }

  pullCloud = async function () {
    const data = await fetchSheetData();
    if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo leer Google Sheets');

    if (Array.isArray(data.recipes) && data.recipes.length) {
      const rows = data.recipes
        .filter(row => String(row.activo).toLowerCase() !== 'false')
        .map(row => ({
          id: row.id,
          name: row.nombre,
          type: TYPE_FROM_SHEET[row.tipo] || 'dinner',
          mins: Number(row.minutos) || 30,
          ings: String(row.ingredientes || '').split('|').filter(Boolean).map(sheetIngredient),
          steps: row.instrucciones || '',
          file: row.foto_archivo || ''
        }));
      if (rows.length) RECIPES.splice(0, RECIPES.length, ...rows);
    }

    state.pantry = {};
    for (const ingredient of ING) state.pantry[ingredient] = true;
    for (const food of (data.foods || [])) {
      const ingredient = sheetIngredient(food.id || food.nombre);
      state.pantry[ingredient] = String(food.disponible).toLowerCase() === 'true';
    }

    state.plan = {};
    state.locked = {};
    for (const meal of (data.plan || [])) {
      const type = TYPE_FROM_SHEET[meal.tipo];
      if (!type || !meal.fecha || !meal.receta_id) continue;
      state.plan[meal.fecha] ||= {};
      state.plan[meal.fecha][type] = meal.receta_id;
      state.locked[meal.fecha + '|' + type] = String(meal.bloqueada).toLowerCase() === 'true';
    }

    for (const row of (data.settings || [])) {
      if (row.clave === 'familia_tamaño') state.familySize = Number(row.valor) || state.familySize;
    }

    persistLocal();
    ensureWeek();
    render();
    updateConnectionUi('✓ Conectado a <strong>Mesa Ecuador — Datos</strong>. Las recetas, alimentos y el plan vienen de Google Sheets; tus cambios se guardan allí.');
    toast('Datos actualizados desde Google Sheets');
    return data;
  };

  const syncMeal = (day, type) => postSheet('set_meal', {
    fecha: day,
    tipo: TYPE_LABEL[type],
    receta_id: state.plan[day][type]
  });

  const syncVisibleWeek = async () => {
    const writes = [];
    for (let n = 0; n < 7; n++) {
      const day = iso(dateAt(n));
      if (!state.plan[day]) continue;
      for (const type of TYPES) if (state.plan[day][type]) writes.push(syncMeal(day, type));
    }
    await Promise.allSettled(writes);
  };

  replaceMeal = function (day, type) {
    state.plan[day] ||= {};
    state.plan[day][type] = pick(type, [state.plan[day][type]]).id;
    persistLocal();
    syncMeal(day, type).catch(console.warn);
    render();
    toast('Comida cambiada y guardada');
  };

  toggleLock = function (day, type) {
    const key = day + '|' + type;
    state.locked[key] = !state.locked[key];
    persistLocal();
    postSheet('set_lock', { fecha: day, tipo: TYPE_LABEL[type], bloqueada: String(state.locked[key]) }).catch(console.warn);
    render();
  };

  regenerateToday = function () {
    const day = iso(dateAt(0));
    const changed = [];
    for (const type of TYPES) {
      if (!state.locked[day + '|' + type]) {
        state.plan[day][type] = pick(type, [state.plan[day][type]]).id;
        changed.push(type);
      }
    }
    persistLocal();
    Promise.allSettled(changed.map(type => syncMeal(day, type)));
    render();
    toast('Comidas de hoy actualizadas');
  };

  generateWeek = function () {
    ensureWeek(true);
    persistLocal();
    syncVisibleWeek().catch(console.warn);
    render();
    toast('Semana regenerada y guardada');
  };

  toggleFood = function (ingredient) {
    state.pantry[ingredient] = !state.pantry[ingredient];
    state.done[ingredient] = false;
    repair();
    persistLocal();
    postSheet('set_food', { id: label(ingredient), disponible: String(state.pantry[ingredient]) }).catch(console.warn);
    syncVisibleWeek().catch(console.warn);
    render();
  };

  setAll = function (value) {
    for (const ingredient of ING) state.pantry[ingredient] = value;
    repair();
    persistLocal();
    Promise.allSettled(ING.map(ingredient => postSheet('set_food', { id: label(ingredient), disponible: String(value) })));
    syncVisibleWeek().catch(console.warn);
    render();
  };

  bought = function (ingredient) {
    state.done[ingredient] = !state.done[ingredient];
    if (state.done[ingredient]) {
      state.pantry[ingredient] = true;
      repair();
      postSheet('set_food', { id: label(ingredient), disponible: 'true' }).catch(console.warn);
      syncVisibleWeek().catch(console.warn);
    }
    persistLocal();
    render();
  };

  state.syncUrl = MESA_SHEETS_URL;
  state.syncToken = 'sheets-connected';
  persistLocal();
  updateConnectionUi();

  if (typeof closeSettingsEl !== 'undefined' && closeSettingsEl) {
    closeSettingsEl.addEventListener('click', () => {
      postSheet('set_setting', { clave: 'familia_tamaño', valor: String(state.familySize) }).catch(console.warn);
    });
  }

  pullCloud().catch(error => {
    console.error('Mesa Ecuador: Google Sheets connection failed', error);
    updateConnectionUi('⚠ No se pudo leer Google Sheets. La app seguirá mostrando los datos guardados en este dispositivo; usa <strong>Actualizar desde Sheets</strong> para volver a intentar.');
  });
})();
