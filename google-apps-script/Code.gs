const SPREADSHEET_ID = '1me3pEaNWjnK7OV7WBru7wRjK_UEcMnuL5Qt1mo36qmk';
const SHEETS = { recipes: 'Recetas', foods: 'Alimentos', plan: 'Plan semanal', groceries: 'Compras', settings: 'Ajustes' };

function doGet(e) {
  try {
    const action = String((e.parameter && e.parameter.action) || 'bootstrap');
    const payload = action === 'bootstrap' ? bootstrap_() : { ok: false, error: 'Acción GET no válida' };
    return respond_(payload, e.parameter && e.parameter.callback);
  } catch (err) {
    return respond_({ ok: false, error: String(err && err.message || err) }, e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const params = e.parameter || {};
    const action = String(params.action || '');
    let result;
    if (action === 'set_food') result = setFood_(params.id, params.disponible);
    else if (action === 'set_meal') result = setMeal_(params.fecha, params.tipo, params.receta_id);
    else if (action === 'set_lock') result = setLock_(params.fecha, params.tipo, params.bloqueada);
    else if (action === 'set_setting') result = setSetting_(params.clave, params.valor);
    else if (action === 'add_recipe') result = addRecipe_(params);
    else result = { ok: false, error: 'Acción POST no válida' };
    return respond_(result);
  } catch (err) {
    return respond_({ ok: false, error: String(err && err.message || err) });
  }
}

function bootstrap_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    recipes: rowsToObjects_(ss.getSheetByName(SHEETS.recipes)),
    foods: rowsToObjects_(ss.getSheetByName(SHEETS.foods)),
    plan: rowsToObjects_(ss.getSheetByName(SHEETS.plan)),
    groceries: rowsToObjects_(ss.getSheetByName(SHEETS.groceries)),
    settings: rowsToObjects_(ss.getSheetByName(SHEETS.settings))
  };
}

function rowsToObjects_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => String(v).trim() !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function setFood_(id, disponible) {
  if (!id) throw new Error('Falta id de alimento');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.foods);
  const values = sheet.getDataRange().getValues();
  const wanted = normalize_(id);
  for (let i = 1; i < values.length; i++) {
    if (normalize_(values[i][0]) === wanted || normalize_(values[i][1]) === wanted) {
      sheet.getRange(i + 1, 4).setValue(toBool_(disponible));
      return { ok: true };
    }
  }
  const display = titleCase_(String(id).trim());
  sheet.appendRow([String(id).trim().toLowerCase(), display, categoryForFood_(id), toBool_(disponible)]);
  return { ok: true, created: true };
}

function setMeal_(fecha, tipo, recetaId) {
  if (!fecha || !tipo || !recetaId) throw new Error('Faltan datos de comida');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const plan = ss.getSheetByName(SHEETS.plan);
  const recipes = ss.getSheetByName(SHEETS.recipes).getDataRange().getValues();
  let recipeName = recetaId;
  for (let i = 1; i < recipes.length; i++) if (String(recipes[i][0]) === String(recetaId)) recipeName = recipes[i][1];
  const values = plan.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(fecha) && String(values[i][1]) === String(tipo)) {
      plan.getRange(i + 1, 3, 1, 2).setValues([[recetaId, recipeName]]);
      return { ok: true };
    }
  }
  plan.appendRow([fecha, tipo, recetaId, recipeName, false]);
  return { ok: true };
}

function setLock_(fecha, tipo, bloqueada) {
  const plan = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.plan);
  const values = plan.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(fecha) && String(values[i][1]) === String(tipo)) {
      plan.getRange(i + 1, 5).setValue(toBool_(bloqueada));
      return { ok: true };
    }
  }
  throw new Error('Comida no encontrada');
}

function setSetting_(clave, valor) {
  if (!clave) throw new Error('Falta clave');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.settings);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(clave)) {
      sheet.getRange(i + 1, 2).setValue(valor);
      return { ok: true };
    }
  }
  sheet.appendRow([clave, valor]);
  return { ok: true };
}

function addRecipe_(params) {
  const nombre = String(params.nombre || '').trim();
  const tipo = ['Desayuno', 'Almuerzo', 'Cena'].indexOf(String(params.tipo)) >= 0 ? String(params.tipo) : 'Almuerzo';
  const minutos = Math.max(1, Math.min(600, Number(params.minutos) || 30));
  const ingredientes = unique_(String(params.ingredientes || '').split('|').map(x => x.trim().toLowerCase()).filter(Boolean));
  const instrucciones = String(params.instrucciones || '').trim();
  const foto = String(params.foto_archivo || '').trim();
  if (!nombre) throw new Error('La receta necesita nombre');
  if (!ingredientes.length) throw new Error('La receta necesita ingredientes');
  if (!instrucciones) throw new Error('La receta necesita instrucciones');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const recipes = ss.getSheetByName(SHEETS.recipes);
  const values = recipes.getDataRange().getValues();
  const normalizedName = normalize_(nombre);
  for (let i = 1; i < values.length; i++) {
    if (normalize_(values[i][1]) === normalizedName) throw new Error('Ya existe una receta con ese nombre');
  }

  const usedIds = values.slice(1).map(row => String(row[0] || ''));
  const id = uniqueRecipeId_(slug_(nombre), usedIds);
  recipes.appendRow([id, nombre, tipo, minutos, ingredientes.join('|'), instrucciones, foto, true]);
  ensureFoods_(ss.getSheetByName(SHEETS.foods), ingredientes);
  return { ok: true, id: id, nombre: nombre };
}

function ensureFoods_(sheet, ingredients) {
  const values = sheet.getDataRange().getValues();
  const existing = {};
  for (let i = 1; i < values.length; i++) {
    existing[normalize_(values[i][0])] = true;
    existing[normalize_(values[i][1])] = true;
  }
  ingredients.forEach(name => {
    if (!existing[normalize_(name)]) {
      sheet.appendRow([name.toLowerCase(), titleCase_(name), categoryForFood_(name), false]);
      existing[normalize_(name)] = true;
    }
  });
}

function categoryForFood_(name) {
  const n = normalize_(name);
  if (/pollo|cerdo|res|carne|pescado|atun|albacora|camaron|huevo|huevos|pavo/.test(n)) return 'Proteínas';
  if (/queso|leche|mantequilla|yogur|crema/.test(n)) return 'Lácteos';
  if (/arroz|lenteja|frejol|frijol|mote|maiz|choclo|harina|avena|quinua|pasta/.test(n)) return 'Granos y harinas';
  if (/platano|banano|limon|naranja|manzana|mango|piña|pina|fruta/.test(n)) return 'Plátanos y frutas';
  if (/papa|yuca|tomate|cebolla|cilantro|aguacate|ajo|pimiento|zanahoria|lechuga|apio|perejil|vegetal/.test(n)) return 'Vegetales y hierbas';
  return 'Otros';
}

function slug_(value) {
  let s = normalize_(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || ('receta-' + new Date().getTime());
}

function uniqueRecipeId_(base, used) {
  let id = base;
  let n = 2;
  while (used.indexOf(id) >= 0) id = base + '-' + n++;
  return id;
}

function unique_(items) {
  const seen = {};
  return items.filter(x => {
    const k = normalize_(x);
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function normalize_(value) {
  return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function titleCase_(value) {
  return String(value || '').trim().replace(/\b\S/g, c => c.toUpperCase());
}

function toBool_(value) {
  const s = String(value).toLowerCase();
  return value === true || s === 'true' || s === '1' || s === 'yes' || s === 'si' || s === 'sí';
}

function respond_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(String(callback) + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
