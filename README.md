# Mesa Ecuador

A simple family meal planner for Ecuadorian breakfast, lunch, and dinner.

## Current features

- Today view with breakfast, lunch, and dinner
- 7-day meal calendar
- Food-available ingredient bubbles
- Automatic replacement of incompatible unlocked meals
- Grocery list based on missing ingredients
- Starter Ecuadorian recipe library
- Local device storage
- Optional Google Sheets family sync
- Responsive layout for MacBook and iPhone

## Publishing

GitHub Pages deployment is configured in `.github/workflows/pages.yml`. Once GitHub Pages is enabled with **GitHub Actions** as the source, every push to `main` deploys automatically.

## Family sync

The UI already supports a Google Apps Script web app URL and a shared family key. The Apps Script backend can be added next so all family devices share the same pantry, calendar, and grocery data.
