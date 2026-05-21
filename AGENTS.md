# Project Notes for Agents

## Product Context

This is a React + Vite browser-only calculator for Ozon FBS logistics. It reads XLSX files locally in the browser and never uploads seller data to a server.

The app supports two XLSX inputs:

1. Ozon logistics tariff file.
   - Main sheet: `Логистика РФ`
   - Default tariff sheet: `Тарифы по умолчанию`
   - Main tariff columns:
     - B: `Объём товара`
     - C: `Кластер отправления`
     - D: `Кластер доставки`
     - E: `Для товаров до 300 руб.`
     - F: `Для товаров свыше 300 руб.`
   - Default tariff columns:
     - B: `Объём товара`
     - C: `Для товаров до 300 руб.`
     - D: `Для товаров свыше 300 руб.`

2. Ozon seller product report file.
   - Sheet: `Товары`
   - Header row is usually row 2.
   - Important columns:
     - `Артикул`
     - `SKU`
     - `Barcode`
     - `Название товара`
     - `Статус товара`
     - `Категория`
     - `Тип`
     - `Объем товара, л`
     - `Доступно к продаже по схеме FBS, шт.`
     - `Текущая цена с учетом скидки, ₽`

## Core Rules

- The app must stay fully client-side.
- Do not add backend, API keys, account scraping, or server calls unless explicitly requested.
- Manual calculator mode must always remain available.
- Manual dimensions are entered in millimeters.
- Manual volume formula: `lengthMm * widthMm * heightMm / 1_000_000`.
- Do not round volume before matching tariff ranges.
- Product report mode uses Ozon's ready `Объем товара, л`; do not recalculate product report volume from dimensions.
- Price column selection:
  - `price <= 300` uses `Для товаров до 300 руб.`
  - `price > 300` uses `Для товаров свыше 300 руб.`
- Min / average / max are calculated from route tariffs only.
- Universal tariff is shown as a reference value from `Тарифы по умолчанию`; it does not replace route tariffs when route tariffs exist.

## Code Map

- `src/App.jsx`: UI, file uploads, selected product state, manual inputs, result rendering.
- `src/tariffs.js`: tariff XLSX parsing, volume range parsing, logistics calculation.
- `src/products.js`: product report XLSX parsing and product status filtering.
- `src/tariffs.test.mjs`: tests for tariff parsing and calculation.
- `src/products.test.mjs`: tests for product report parsing and filtering.
- `src/styles.css`: app styling.

## Validation Commands

Use these before committing meaningful changes:

```bash
npm run test:logic
npm run build
```

In the Codex Windows sandbox, Vite can sometimes fail on path/access issues even when the code is valid. If that happens, rerun the actual build command outside the sandbox with approval.

## Known Good Sample Checks

Tariff XLSX sample:

- File name used during development: `logistika-fbo-fbs-01052026_1777018200 (2).xlsx`
- For cluster `Алматы`, price `2222`, volume `10.648 л`:
  - volume bucket: `10,001-11 л`
  - directions: `31`
  - min: `123`
  - average: `198.68`
  - max: `264`
  - universal tariff: `102`
- For cluster `Алматы`, price `222`, volume `10.648 л`:
  - directions: `31`
  - min / average / max: `79.30`
  - universal tariff: `79.30`

Product report XLSX sample:

- File name used during development: `Товары_21.05.2026 (1).xlsx`
- Expected parsed products: `135`
- Active products (`Продается` + `Готов к продаже`): `133`
- Product `п50`:
  - price: `850`
  - volume: `4.52 л`
- Product `п75`:
  - price: `500`
  - volume: `6.78 л`

## UX Notes

- Interface language is Russian.
- Keep the UI compact, clear, and work-focused.
- Do not replace manual inputs with product import; product import is an optional helper.
- Product status filter defaults to `Продаются и готовые`.
- The millimeter update notice is controlled by `ozon-mm-notice-v1` in `localStorage` with a cookie fallback.
