/* Mesa Ecuador recipe camera + smarter OCR intake */
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
    .scan-hint{font-size:12px;color:var(--muted);margin-top:5px}
    @media(max-width:760px){.recipe-camera{min-width:44px;justify-content:center;padding:10px}.scan-grid{grid-template-columns:1fr}.scan-modal{width:96vw}.scan-actions .btn{flex:1 1 140px}}
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
    <div class="head" style="margin-bottom:10px"><div><h2 style="font-size:28px">Escanear receta</h2><p>Fotografía una receta, captura de pantalla o página con ingredientes.</p></div><button type="button" class="btn small" id="scanClose">✕</button></div>
    <input id="scanFile" type="file" accept="image/*" capture="environment" hidden>
    <img id="scanPreview" class="scan-preview" alt="Vista previa de la receta">
    <div id="scanStatus" class="scan-status">Toma una foto. La app intentará entender la receta, no solo copiar el texto.</div>
    <div id="scanProgress" class="scan-progress" hidden><span></span></div>
    <div class="scan-actions" style="margin:12px 0"><button type="button" class="btn primary" id="scanChoose">📷 Tomar foto / elegir imagen</button><button type="button" class="btn" id="scanAgain" hidden>Otra foto</button></div>
    <form id="scanForm" hidden>
      <div class="scan-grid"><div class="field"><label for="scanName">Nombre</label><input id="scanName" required></div><div class="field"><label for="scanType">Tipo</label><select id="scanType"><option>Desayuno</option><option selected>Almuerzo</option><option>Cena</option></select></div></div>
      <div class="field"><label for="scanMinutes">Tiempo aproximado (minutos)</label><input id="scanMinutes" type="number" min="1" max="600" value="30"></div>
      <div class="field"><label for="scanIngredients">Ingredientes — uno por línea</label><textarea id="scanIngredients" class="scan-textarea" required placeholder="arroz\npollo\ncebolla"></textarea></div>
      <div class="field"><label for="scanInstructions">Preparación</label><textarea id="scanInstructions" class="scan-textarea" required></textarea><div id="scanInstructionHint" class="scan-hint"></div></div>
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
    document.getElementById('scanInstructionHint').textContent = '';
    status.hidden = false;
    status.textContent = 'Toma una foto. La app intentará entender la receta, no solo copiar el texto.';
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
    status.textContent = 'Preparando y mejorando la imagen…';
    progress.hidden = false;
    progressBar.style.width = '4%';
    form.hidden = true;
    try {
      await loadTesseract();
      const canvas = await imageForOcr(file);
      status.textContent = 'Leyendo y entendiendo la receta…';
      const result = await Tesseract.recognize(canvas, 'spa+eng', {
        logger: m => { if (m.status === 'recognizing text') progressBar.style.width = Math.round((m.progress || 0) * 100) + '%'; },
        preserve_interword_spaces: '1'
      });
      const text = String(result && result.data && result.data.text || '').trim();
      if (!text) throw new Error('No se detectó texto. Intenta con más luz y la cámara recta.');
      const parsed = parseRecipeText(text);
      document.getElementById('scanName').value = parsed.name;
      document.getElementById('scanType').value = parsed.type;
      document.getElementById('scanMinutes').value = parsed.minutes;
      document.getElementById('scanIngredients').value = parsed.ingredients.join('\n');
      document.getElementById('scanInstructions').value = parsed.instructions;
      document.getElementById('scanInstructionHint').textContent = parsed.instructionsDetected ? '' : 'No encontré pasos de preparación claros en esta imagen. Añádelos antes de guardar.';
      document.getElementById('scanRaw').textContent = text;
      status.textContent = parsed.confidence === 'high' ? '✓ Receta entendida. Revisa antes de guardar.' : '✓ Escaneo terminado. Revisa los campos que no estaban claros.';
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
    if (!name || !ingredients.length || !instructions || /^No se detectaron instrucciones/i.test(instructions)) {
      status.textContent = '⚠ Revisa nombre, ingredientes y preparación antes de guardar.';
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
      if (!saved) throw new Error('No pude confirmar que Google Sheets guardó la receta.');
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
        const max = 2200;
        const scale = Math.min(2, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Improve photos of screens / dark pages: grayscale + contrast + auto-invert dark backgrounds.
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let avg = 0;
        for (let i = 0; i < data.data.length; i += 4) avg += (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
        avg /= data.data.length / 4;
        const invert = avg < 115;
        for (let i = 0; i < data.data.length; i += 4) {
          let g = .299 * data.data[i] + .587 * data.data[i + 1] + .114 * data.data[i + 2];
          if (invert) g = 255 - g;
          g = Math.max(0, Math.min(255, (g - 128) * 1.45 + 128));
          data.data[i] = data.data[i + 1] = data.data[i + 2] = g;
        }
        ctx.putImageData(data, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')); };
      img.src = url;
    });
  }

  function parseRecipeText(text) {
    const rawLines = text.split(/\r?\n/).map(s => String(s || '').trim()).filter(Boolean);
    const lines = rawLines.map(cleanLine).filter(Boolean);
    const joined = lines.join(' ');
    const lower = joined.toLowerCase();
    const heading = /^(core\s+)?(ingredientes?|ingredients?|preparaci[oó]n|instrucciones?|procedimiento|elaboraci[oó]n|directions?|method|preparation)\s*:?\s*$/i;

    let name = detectRecipeName(lines, joined);
    const timeMatch = joined.match(/(?:tiempo|time|prep(?:aration)?\s*time|cook(?:ing)?\s*time)?[^\d]{0,18}(\d{1,3})\s*(?:min|minutos?|minutes?)/i);
    const minutes = timeMatch ? Math.max(1, Math.min(600, Number(timeMatch[1]))) : 30;

    let type = 'Almuerzo';
    if (/desayuno|breakfast|pancake|panque|tostada|huevo|bol[oó]n|tigrillo|humita|waffle|cereal/.test((name + ' ' + lower).toLowerCase())) type = 'Desayuno';
    else if (/cena|dinner|supper/.test(lower.slice(0, 500))) type = 'Cena';

    const ingIndex = lines.findIndex(line => /^(core\s+)?(ingredientes?|ingredients?)\s*:?$/i.test(line));
    const prepIndex = lines.findIndex(line => /^(preparaci[oó]n|instrucciones?|procedimiento|elaboraci[oó]n|directions?|method|preparation)\s*:?$/i.test(line));
    let ingredientLines = [];

    if (ingIndex >= 0) {
      const end = prepIndex > ingIndex ? prepIndex : Math.min(lines.length, ingIndex + 20);
      ingredientLines = lines.slice(ingIndex + 1, end).filter(line => !isUiNoise(line));
    }

    // Bullet-style explanatory pages: "White rum: The clear alcohol base..."
    const colonIngredients = lines
      .filter(line => !heading.test(line) && !isUiNoise(line) && /^[•\-]?\s*[^:]{2,45}:\s+.{4,}/.test(rawLineForMatch(line)))
      .map(line => line.split(':')[0].replace(/^[-•]\s*/, '').trim())
      .filter(looksLikeFoodName);
    ingredientLines.push(...colonIngredients);

    // Paragraph-style pages: "A classic mojito contains white rum, fresh mint..."
    const containsMatch = joined.match(/(?:a|an|un|una)\s+(?:classic\s+)?([a-záéíóúñü][a-záéíóúñü\s'-]{1,35}?)\s+(?:contains?|contiene|lleva)\s+(.+?)(?:\.|$)/i);
    if (containsMatch) ingredientLines.push(...splitIngredientSentence(containsMatch[2]));

    if (!ingredientLines.length) ingredientLines = lines.filter(looksLikeIngredient).slice(0, 25);

    const ingredients = dedupe(
      ingredientLines.map(simplifyIngredientSmart).filter(x => x && x.length <= 70 && !isUiNoise(x))
    ).slice(0, 30);

    let instructionLines = [];
    let instructionsDetected = false;
    if (prepIndex >= 0) {
      instructionLines = lines.slice(prepIndex + 1).filter(line => !isUiNoise(line));
      instructionsDetected = instructionLines.length > 0;
    } else {
      instructionLines = lines.filter(line => /\b(?:mix|stir|cook|boil|bake|fry|add|combine|serve|heat|pour|blend|whisk|simmer|mezcla|cocina|hierve|hornea|fr[ií]e|agrega|añade|sirve|calienta|vierte|licua|bate|sofr[ií]e)\b/i.test(line) && !isUiNoise(line));
      instructionsDetected = instructionLines.length >= 2;
    }

    const instructions = instructionsDetected
      ? dedupe(instructionLines).join('\n')
      : 'No se detectaron instrucciones de preparación en esta imagen.';

    const confidence = name !== 'Nueva receta' && ingredients.length >= 3 ? 'high' : 'medium';
    return { name, type, minutes, ingredients: ingredients.length ? ingredients : ['ingrediente'], instructions, instructionsDetected, confidence };
  }

  function detectRecipeName(lines, joined) {
    const patterns = [
      /(?:a|an|un|una)\s+(?:classic\s+)?([a-záéíóúñü][a-záéíóúñü\s'-]{1,35}?)\s+(?:contains?|contiene|lleva)\b/i,
      /\b([a-záéíóúñü][a-záéíóúñü\s'-]{1,35}?)\s+(?:ingredients?|ingredientes?)\b/i,
      /(?:recipe|receta)\s+(?:for|de|para)\s+([a-záéíóúñü][a-záéíóúñü\s'-]{1,35})/i,
      /(?:how to make|c[oó]mo hacer)\s+([a-záéíóúñü][a-záéíóúñü\s'-]{1,35})/i
    ];
    for (const pattern of patterns) {
      const m = joined.match(pattern);
      if (m) {
        const candidate = cleanTitle(m[1]);
        if (candidate) return candidate;
      }
    }

    const candidates = lines.filter(line => !isUiNoise(line) && !/^(core\s+)?ingredients?|ingredientes?|preparaci[oó]n|instructions?|directions?$/i.test(line) && line.length >= 3 && line.length <= 70);
    for (const line of candidates) {
      if (!looksLikeSentence(line) && !looksLikeIngredient(line)) return cleanTitle(line);
    }
    return 'Nueva receta';
  }

  function cleanTitle(value) {
    let s = String(value || '').trim().replace(/^(?:classic|receta de|recipe for)\s+/i, '').replace(/\s+/g, ' ');
    s = s.replace(/\b(?:ingredients?|ingredientes?)\s*$/i, '').trim();
    if (!s || s.length > 60 || /search|images|videos|shopping|forums/i.test(s)) return '';
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }

  function splitIngredientSentence(value) {
    return String(value || '')
      .replace(/\band\b/gi, ',')
      .replace(/\by\b/gi, ',')
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function rawLineForMatch(line) { return String(line || ''); }

  function cleanLine(line) {
    return String(line || '').replace(/[●▪■►]/g, '•').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
  }

  function isUiNoise(line) {
    const s = String(line || '').toLowerCase();
    return /\b(?:ai mode|ai overview|all|short videos|images|videos|shopping|forums|tools|ask anything|learn more|sign in|google|search|results?|sponsored|share|would you like me|you can check out|the kitchen)\b/.test(s)
      || /^[|+_\-=<>\s]{3,}$/.test(s);
  }

  function looksLikeSentence(line) {
    const s = String(line || '');
    return s.length > 55 || /[.!?]$/.test(s) || /\b(?:the|this|that|with|para|que|con|una|uno|del|los|las)\b/i.test(s) && s.split(/\s+/).length > 8;
  }

  function looksLikeFoodName(line) {
    const s = String(line || '').trim();
    if (!s || s.length > 45 || isUiNoise(s)) return false;
    return !/\b(?:flavor|taste|step|instructions?|recipe|overview|base|liquid|freshly|gently|poured|finish|check|share)\b/i.test(s);
  }

  function looksLikeIngredient(line) {
    const s = String(line || '');
    if (isUiNoise(s)) return false;
    return /^(?:[•\-]\s*)?(?:\d+[\d\s\/.,-]*|½|¼|¾|una?\b|dos\b|tres\b)|\b(?:taza|tazas|cup|cups|cucharad|cucharada|tbsp|tsp|kg|kilo|gram|grams?|g\b|lb\b|libra|onza|oz|ml\b|litro|unidad|diente|rama|al gusto)\b/i.test(s)
      || /^[•\-]\s*[a-záéíóúñü]/i.test(s);
  }

  function simplifyIngredientSmart(line) {
    let s = cleanLine(line).replace(/^[•\-]\s*/, '').trim();
    if (s.includes(':')) s = s.split(':')[0].trim();
    s = s.replace(/^\d+[\d\s\/.,-]*\s*/, '').replace(/^[½¼¾]\s*/, '');
    s = s.replace(/^(?:una?|dos|tres|cuatro|cinco|seis)\s+/i, '');
    s = s.replace(/^(?:(?:tazas?|cups?|cucharaditas?|cucharadas?|tbsp|tsp|kg|kilos?|kilogramos?|g|gr|gramos?|grams?|lb|libras?|oz|onzas?|ml|mililitros?|litros?|unidades?|dientes?|ramas?)\s+(?:de\s+)?)*/i, '');
    s = s.replace(/\([^)]*\)/g, '').replace(/,.*$/, '').trim();
    s = s.replace(/\b(?:fresh|freshly|fresco|fresca|finely|finamente|chopped|picado|picada|sliced|cortado|cortada|optional|opcional|to taste|al gusto)\b.*$/i, '').trim();
    return s.replace(/^de\s+/, '').trim().toLowerCase();
  }

  function simplifyIngredient(line) { return simplifyIngredientSmart(line); }

  function dedupe(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = String(item || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      if (key && !seen.has(key)) { seen.add(key); out.push(item); }
    }
    return out;
  }

  function uniqueLines(value) {
    return dedupe(String(value || '').split(/\r?\n|\|/).map(simplifyIngredientSmart).filter(Boolean));
  }
})();