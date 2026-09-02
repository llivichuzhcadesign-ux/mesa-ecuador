/* Mesa Ecuador recipe camera + OCR intake */
(() => {
  const BACKEND = 'https://script.google.com/macros/s/AKfycbwhBMW5tKQa_AYM3TkWQ-PSnlZ9DFSN1mWc-FeSELSDWA22QyHBcaiCFClczwo7nzk9/exec';
  if (document.getElementById('recipeCameraBtn')) return;

  const style = document.createElement('style');
  style.textContent = `
    .recipe-camera{display:inline-flex;align-items:center;gap:7px;margin-right:8px}.scan-modal{width:min(94vw,680px)}
    .scan-preview{width:100%;max-height:260px;object-fit:contain;border:1px solid var(--line);border-radius:14px;background:var(--soft);display:none}
    .scan-grid{display:grid;grid-template-columns:1fr 150px;gap:12px}.scan-textarea{min-height:105px;resize:vertical}.scan-status{padding:10px 12px;border-radius:12px;background:var(--soft);font-size:13px;margin:10px 0}.scan-status[hidden]{display:none}
    .scan-progress{height:8px;border-radius:999px;background:var(--line);overflow:hidden;margin-top:7px}.scan-progress span{display:block;height:100%;width:0;background:var(--green);transition:width .2s}
    .scan-actions{display:flex;gap:8px;flex-wrap:wrap}.raw-ocr{white-space:pre-wrap;max-height:170px;overflow:auto;font-size:12px;color:var(--muted)}
    @media(max-width:760px){.recipe-camera .camera-label{display:none}.recipe-camera{min-width:44px;justify-content:center;padding:10px}.scan-grid{grid-template-columns:1fr}.scan-modal{width:96vw}.scan-actions .btn{flex:1 1 140px}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'recipeCameraBtn';
  button.className = 'btn primary recipe-camera';
  button.type = 'button';
  button.innerHTML = '📷 <span class="camera-label">Nueva receta</span>';
  button.setAttribute('aria-label', 'Escanear una nueva receta con la cámara');
  settingsBtn.parentElement.insertBefore(button, settingsBtn);

  const dialog = document.createElement('dialog');
  dialog.id = 'recipeScanDialog';
  dialog.className = 'scan-modal';
  dialog.innerHTML = `<div class="modal">
    <div class="head" style="margin-bottom:10px"><div><h2 style="font-size:28px">Escanear receta</h2><p>Fotografía una receta impresa, manuscrita clara o una captura de pantalla.</p></div><button type="button" class="btn small" id="scanClose">✕</button></div>
    <input id="scanFile" type="file" accept="image/*" capture="environment" hidden>
    <img id="scanPreview" class="scan-preview" alt="Vista previa de la receta">
    <div id="scanStatus" class="scan-status">Toma una foto. Antes de guardar podrás corregir todo.</div>
    <div id="scanProgress" class="scan-progress" hidden><span></span></div>
    <div class="scan-actions" style="margin:12px 0"><button type="button" class="btn primary" id="scanChoose">📷 Tomar foto / elegir imagen</button><button type="button" class="btn" id="scanAgain" hidden>Otra foto</button></div>
    <form id="scanForm" hidden>
      <div class="scan-grid"><div class="field"><label for="scanName">Nombre</label><input id="scanName" required></div><div class="field"><label for="scanType">Tipo</label><select id="scanType"><option>Desayuno</option><option selected>Almuerzo</option><option>Cena</option></select></div></div>
      <div class="field"><label for="scanMinutes">Tiempo aproximado (minutos)</label><input id="scanMinutes" type="number" min="1" max="600" value="30"></div>
      <div class="field"><label for="scanIngredients">Ingredientes — uno por línea</label><textarea id="scanIngredients" class="scan-textarea" required placeholder="arroz\npollo\ncebolla"></textarea></div>
      <div class="field"><label for="scanInstructions">Preparación</label><textarea id="scanInstructions" class="scan-textarea" required></textarea></div>
      <details><summary>Ver texto leído de la foto</summary><pre id="scanRaw" class="raw-ocr"></pre></details>
      <div class="scan-actions" style="margin-top:14px"><button class="btn primary" type="submit" id="scanSave">Guardar en Google Sheets</button><button class="btn" type="button" id="scanCancel">Cancelar</button></div>
    </form>
  </div>`;
  document.body.appendChild(dialog);

  const fileInput = document.getElementById('scanFile');
  const preview = document.getElementById('scanPreview');
  const status = document.getElementById('scanStatus');
  const progress = document.getElementById('scanProgress');
  const progressBar = progress.querySelector('span');
  const form = document.getElementById('scanForm');

  function reset() {
    fileInput.value = '';
    preview.removeAttribute('src');
    preview.style.display = 'none';
    form.hidden = true;
    document.getElementById('scanAgain').hidden = true;
    status.hidden = false;
    status.textContent = 'Toma una foto. Antes de guardar podrás corregir todo.';
    progress.hidden = true;
    progressBar.style.width = '0%';
  }

  button.addEventListener('click', () => { reset(); dialog.showModal(); });
  document.getElementById('scanClose').addEventListener('click', () => dialog.close());
  document.getElementById('scanCancel').addEventListener('click', () => dialog.close());
  document.getElementById('scanChoose').addEventListener('click', () => fileInput.click());
  document.getElementById('scanAgain').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    preview.style.display = 'block';
    status.textContent = 'Preparando imagen…';
    progress.hidden = false;
    progressBar.style.width = '4%';
    form.hidden = true;
    try {
      await loadTesseract();
      const canvas = await imageForOcr(file);
      status.textContent = 'Leyendo la receta… la primera vez puede tardar un poco.';
      const result = await Tesseract.recognize(canvas, 'spa+eng', { logger: m => { if (m.status === 'recognizing text') progressBar.style.width = Math.round((m.progress || 0) * 100) + '%'; } });
      const text = String(result && result.data && result.data.text || '').trim();
      if (!text) throw new Error('No se detectó texto. Intenta con más luz y la cámara recta.');
      const parsed = parseRecipeText(text);
      document.getElementById('scanName').value = parsed.name;
      document.getElementById('scanType').value = parsed.type;
      document.getElementById('scanMinutes').value = parsed.minutes;
      document.getElementById('scanIngredients').value = parsed.ingredients.join('\n');
      document.getElementById('scanInstructions').value = parsed.instructions;
      document.getElementById('scanRaw').textContent = text;
      status.textContent = '✓ Escaneo terminado. Revisa los datos antes de guardar.';
      progressBar.style.width = '100%';
      form.hidden = false;
      document.getElementById('scanAgain').hidden = false;
    } catch (error) {
      console.error(error);
      status.textContent = '⚠ ' + (error.message || 'No se pudo leer la imagen.');
      progress.hidden = true;
      document.getElementById('scanAgain').hidden = false;
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('scanName').value.trim();
    const ingredients = uniqueLines(document.getElementById('scanIngredients').value);
    const instructions = document.getElementById('scanInstructions').value.trim();
    if (!name || !ingredients.length || !instructions) {
      status.textContent = '⚠ Revisa nombre, ingredientes y preparación.';
      return;
    }
    if (RECIPES.some(r => r.name.trim().toLowerCase() === name.toLowerCase())) {
      status.textContent = '⚠ Ya existe una receta con ese nombre.';
      return;
    }
    const saveButton = document.getElementById('scanSave');
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando…';
    status.textContent = 'Guardando la receta y sus ingredientes en Google Sheets…';
    try {
      const body = new URLSearchParams({
        action: 'add_recipe',
        nombre: name,
        tipo: document.getElementById('scanType').value,
        minutos: String(document.getElementById('scanMinutes').value || 30),
        ingredientes: ingredients.join('|'),
        instrucciones,
        foto_archivo: ''
      });
      await fetch(BACKEND, { method: 'POST', body, mode: 'no-cors' });
      await new Promise(resolve => setTimeout(resolve, 1200));
      await pullCloud();
      const saved = RECIPES.some(r => r.name.trim().toLowerCase() === name.toLowerCase());
      if (!saved) throw new Error('Falta actualizar la implementación de Apps Script con el nuevo Code.gs.');
      view = 'recipes';
      render();
      dialog.close();
      toast('✓ Receta agregada a Google Sheets');
    } catch (error) {
      console.error(error);
      status.textContent = '⚠ ' + (error.message || 'No se pudo guardar la receta.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Guardar en Google Sheets';
    }
  });

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (window.__mesaTesseractPromise) return window.__mesaTesseractPromise;
    window.__mesaTesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar el lector de texto. Revisa tu conexión.'));
      document.head.appendChild(script);
    });
    return window.__mesaTesseractPromise;
  }

  function imageForOcr(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1800;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')); };
      img.src = url;
    });
  }

  function parseRecipeText(text) {
    const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
    const heading = /^(ingredientes?|preparaci[oó]n|instrucciones?|procedimiento|elaboraci[oó]n|directions?|ingredients?)\s*:?\s*$/i;
    const name = (lines.find(line => !heading.test(line) && !/^\d+\s*(min|minutos?|minutes?)/i.test(line)) || 'Nueva receta').slice(0, 90);
    const joined = lines.join(' ');
    const timeMatch = joined.match(/(?:tiempo[^\d]{0,12})?(\d{1,3})\s*(?:min|minutos?|minutes?)/i);
    const minutes = timeMatch ? Math.max(1, Math.min(600, Number(timeMatch[1]))) : 30;
    let type = 'Almuerzo';
    if (/desayuno|breakfast|panque|tostada|huevo|bol[oó]n|tigrillo|humita/i.test(name + ' ' + joined.slice(0, 180))) type = 'Desayuno';
    else if (/cena|dinner/i.test(joined.slice(0, 220))) type = 'Cena';
    const ingIndex = lines.findIndex(line => /^ingredientes?\s*:?$/i.test(line) || /^ingredients?\s*:?$/i.test(line));
    const prepIndex = lines.findIndex(line => /^(preparaci[oó]n|instrucciones?|procedimiento|elaboraci[oó]n|directions?)\s*:?$/i.test(line));
    let ingredientLines = [];
    let instructionLines = [];
    if (ingIndex >= 0) ingredientLines = lines.slice(ingIndex + 1, prepIndex > ingIndex ? prepIndex : lines.length);
    else ingredientLines = lines.slice(1).filter(looksLikeIngredient).slice(0, 20);
    if (prepIndex >= 0) instructionLines = lines.slice(prepIndex + 1);
    else {
      const ingredientSet = new Set(ingredientLines);
      instructionLines = lines.slice(1).filter(line => !ingredientSet.has(line) && !/^(tiempo|porciones|servings?)\b/i.test(line));
    }
    const ingredients = [...new Set(ingredientLines.map(simplifyIngredient).filter(Boolean))].slice(0, 30);
    return { name, type, minutes, ingredients: ingredients.length ? ingredients : ['ingrediente'], instructions: instructionLines.join('\n').trim() || 'Revisa la fotografía y escribe aquí los pasos de preparación.' };
  }

  function cleanLine(line) {
    return String(line || '').replace(/[•●▪■►]/g, ' ').replace(/^[-–—*]+\s*/, '').replace(/\s+/g, ' ').trim();
  }

  function looksLikeIngredient(line) {
    return /^(?:\d+[\d\s\/.,-]*|½|¼|¾|una?\b|dos\b|tres\b)|\b(?:taza|tazas|cucharad|cucharada|kg|kilo|gram|g\b|lb\b|libra|onza|ml\b|litro|unidad|diente|rama|al gusto)\b/i.test(line);
  }

  function simplifyIngredient(line) {
    let s = cleanLine(line).toLowerCase();
    s = s.replace(/^\d+[\d\s\/.,-]*\s*/, '').replace(/^[½¼¾]\s*/, '');
    s = s.replace(/^(?:una?|dos|tres|cuatro|cinco|seis)\s+/i, '');
    s = s.replace(/^(?:(?:tazas?|cucharaditas?|cucharadas?|kg|kilos?|kilogramos?|g|gr|gramos?|lb|libras?|oz|onzas?|ml|mililitros?|litros?|unidades?|dientes?|ramas?)\s+(?:de\s+)?)*/i, '');
    s = s.replace(/,.*$/, '').replace(/\([^)]*\)/g, '').replace(/\b(?:al gusto|para fre[ií]r|para servir|picad[oa]s?|cortad[oa]s?|finamente|opcional)\b.*$/i, '').trim();
    return s.replace(/^de\s+/, '').trim();
  }

  function uniqueLines(value) {
    const seen = new Set();
    const out = [];
    for (const raw of String(value || '').split(/\r?\n|\|/)) {
      const item = simplifyIngredient(raw);
      const key = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (item && !seen.has(key)) { seen.add(key); out.push(item); }
    }
    return out;
  }
})();
