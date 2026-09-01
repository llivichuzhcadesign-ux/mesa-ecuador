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
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      sheet.getRange(i + 1, 4).setValue(toBool_(disponible));
      return { ok: true };
    }
  }
  throw new Error('Alimento no encontrado: ' + id);
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

function toBool_(value) {
  const s = String(value).toLowerCase();
  return value === true || s === 'true' || s === '1' || s === 'yes' || s === 'si' || s === 'sí';
}

function respond_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(String(callback) + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
