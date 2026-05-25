# AGENTS.md

## WHAT

React + Vite browser-only app for Ozon FBS calculations. It must stay fully client-side: seller XLSX files are parsed in the browser and are not uploaded to a server.

Current pages:

- `/` — fast Ozon FBS logistics calculator.
- `/unit-economics` — planned unit economics / margin calculator.
- `/unit-economics-guide` — detailed Russian guide for filling unit-economics fields.

Core files:

- `src/App.jsx` — UI, routing, uploads, page state, notices.
- `src/tariffs.js` — logistics tariff parsing and logistics calculation.
- `src/products.js` — Ozon `Товары` report parsing and status filtering.
- `src/commissionRates.js` — Ozon FBS commission-rate table parsing and lookup.
- `src/unitEconomics.js` — profit, margin, ROI calculation.
- `src/*.test.mjs` — logic tests.
- `src/styles.css` — app styling.
- `vercel.json` — SPA rewrites for direct links like `/unit-economics`.

Supported XLSX inputs:

- Logistics tariff XLSX:
  - sheet `Логистика РФ`: B volume, C source cluster, D destination, E under 300 rub, F over 300 rub.
  - sheet `Тарифы по умолчанию`: B volume, C under 300 rub, D over 300 rub.
- Product report XLSX:
  - sheet `Товары`, usually headers on row 2.
  - important columns: `Артикул`, `SKU`, `Barcode`, `Название товара`, `Статус товара`, `Категория`, `Тип`, `Объем товара, л`, `Доступно к продаже по схеме FBS, шт.`, `Текущая цена с учетом скидки, ₽`.
- Commission-rate XLSX:
  - official Ozon `Таблица категорий для расчёта вознаграждения`.
  - current known sheet: `Прайс РФ (БЗ)`.
  - FBS block columns are parsed from header `FBS`; current file has FBS in columns O:T.
  - lookup is strict `category + product type + price range`; no fuzzy matching.

## WHY

The app helps a seller quickly estimate:

- FBS logistics by Ozon tariff XLSX.
- Min / average / max route logistics by source cluster.
- Universal/default logistics tariff as a reference.
- Planned unit economics: profit, margin, ROI, and expense breakdown.
- Ozon commission percentage from the official commission-rate XLSX when an exact match is available.

The logistics calculator must remain a fast standalone tool. Unit economics is a separate page so the logistics flow does not become overloaded.

## HOW

Important product rules:

- Manual dimensions are in millimeters.
- Manual volume formula: `lengthMm * widthMm * heightMm / 1_000_000`.
- Never round volume before tariff matching.
- Product-report mode uses Ozon `Объем товара, л`; do not recalculate it from dimensions.
- Price column selection for logistics:
  - `price <= 300` → `Для товаров до 300 руб.`
  - `price > 300` → `Для товаров свыше 300 руб.`
- Min / average / max are calculated from route tariffs only.
- Universal tariff is reference-only and must not replace route tariffs when route tariffs exist.
- Default tariff fallback is used only when route tariffs cannot be found.
- Unit economics is a planned estimate, not an official Ozon accounting report.
- Manual inputs must always remain available, especially commission, tax, packaging, advertising, and other expenses.

Commission import rules:

- Support only FBS for now.
- Convert Excel rates like `0.47` to `47%`.
- Match only exact normalized `category + type`.
- Normalization may trim, lowercase, replace `ё` with `е`, and collapse spaces.
- Do not guess by category only or product type only.
- If no exact match, ambiguous match, missing file, or missing price: keep commission manual.
- If user edits commission manually, treat it as manual until they explicitly apply the table rate again.

Notices:

- One-time notices use `localStorage` with cookie fallback.
- Known keys:
  - `ozon-mm-notice-v1`
  - `ozon-product-import-notice-v1`
  - `ozon-unit-economics-notice-v1`
  - `ozon-commission-import-notice-v1`
- New notices should be sequential, not stacked on top of each other.

Validation before commit:

```bash
npm run test:logic
npm run build
```

On this Windows/Codex setup, `npm.ps1` or sandbox path handling may fail. Use the bundled Node/Vite command or rerun with approval when the failure is environment-related, not code-related.

Known sample checks:

- Logistics file `logistika-fbo-fbs-01052026_1777018200 (2).xlsx`.
- Cluster `Алматы`, price `2222`, volume `10.648 л`:
  - bucket `10,001-11 л`, directions `31`, min `123`, avg `198.68`, max `264`, universal `102`.
- Cluster `Алматы`, price `222`, volume `10.648 л`:
  - directions `31`, min / avg / max `79.30`, universal `79.30`.
- Product file `Товары_21.05.2026 (1).xlsx`:
  - parsed products `135`.
  - product `п50`: price `850`, volume `4.52 л`.
  - product `п75`: price `500`, volume `6.78 л`.
- Commission file `Таблица_категорий_для_расчёта_вознаграждения_06042026-2_1773932702.xlsx`:
  - parsed FBS rates `9511`, duplicate count `1`.
  - with the sample product file, `135/135` products matched by exact category + type.

Coding conventions:

- Keep UI Russian.
- Keep UI compact, clear, work-focused, and responsive.
- Prefer existing patterns over new dependencies.
- Do not add backend, account scraping, API keys, or automatic Ozon login unless explicitly requested.
- Do not change the logistics page when working only on unit-economics features.
- Add focused tests for parsing, range matching, fallback behavior, and manual override behavior.
