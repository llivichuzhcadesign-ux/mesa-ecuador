# Conectar Mesa Ecuador con Google Sheets

La hoja principal ya fue creada:

**Mesa Ecuador — Datos**

Spreadsheet ID:
`1me3pEaNWjnK7OV7WBru7wRjK_UEcMnuL5Qt1mo36qmk`

## 1. Abrir la hoja

https://docs.google.com/spreadsheets/d/1me3pEaNWjnK7OV7WBru7wRjK_UEcMnuL5Qt1mo36qmk/edit

## 2. Abrir Apps Script

En Google Sheets:

**Extensiones → Apps Script**

Borra el contenido inicial de `Code.gs`.

## 3. Copiar el backend

Copia el contenido del archivo del repositorio:

`google-apps-script/Code.gs`

y pégalo en `Code.gs` dentro de Apps Script.

El código ya contiene el Spreadsheet ID correcto.

## 4. Desplegar como aplicación web

En Apps Script:

1. Pulsa **Implementar**.
2. Elige **Nueva implementación**.
3. Tipo: **Aplicación web**.
4. Ejecutar como: **Yo**.
5. Quién tiene acceso: **Cualquier persona**.
6. Pulsa **Implementar**.
7. Autoriza el acceso cuando Google lo solicite.
8. Copia la URL que termina en `/exec`.

## 5. Conectar Mesa Ecuador

Abre Mesa Ecuador → **Ajustes**.

Pega la URL `/exec` en **URL de Apps Script**.

La clave familiar no es necesaria para esta primera versión.

## Estructura de datos

- `Recetas`: catálogo real de recetas.
- `Alimentos`: disponibilidad actual de ingredientes.
- `Plan semanal`: desayuno, almuerzo y cena por fecha.
- `Compras`: lista derivada de alimentos faltantes.
- `Ajustes`: tamaño familiar, idioma y configuración.

El backend soporta:

- `GET ?action=bootstrap`
- `POST action=set_food`
- `POST action=set_meal`
- `POST action=set_lock`
- `POST action=set_setting`
