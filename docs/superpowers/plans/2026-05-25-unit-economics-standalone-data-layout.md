# Standalone Unit Economics Data Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/unit-economics` a fully standalone page where the user can upload tariffs, upload products, choose a product, choose a source cluster, load commission rates, and calculate unit economics without first visiting the logistics page.

**Architecture:** Keep the current logistics page behavior intact, but extract repeated upload/product-picker UI into shared React components used by both pages. Shared state can remain in `App.jsx` for this iteration, because both pages already live there; the layout should become clearer without changing parsing/calculation modules.

**Tech Stack:** React 19, Vite 6, browser-only XLSX parsing with `xlsx`, existing CSS in `src/styles.css`, existing logic tests with `node --test`.

---

## File Structure

- Modify `src/App.jsx`
  - Extract shared UI blocks from the logistics page:
    - `TariffUploadPanel`
    - `ProductReportPanel`
    - optional small `SelectedProductSummary`
  - Pass tariff/product state and handlers into `UnitEconomicsPage`.
  - Add logistics setup controls to `/unit-economics`.
  - Preserve current logistics page JSX behavior.
- Modify `src/styles.css`
  - Add compact standalone unit-economics data layout styles.
  - Reuse existing `panel`, `notice`, `field`, `product-picker-grid`, and button styles.
- Modify `src/unitEconomics.test.mjs` only if a logic regression is discovered.
  - This task should be mostly layout/state wiring; existing logic tests should remain enough.
- Do not modify `src/tariffs.js`, `src/products.js`, `src/commissionRates.js`, or `src/unitEconomics.js` unless tests reveal a real logic bug.

## UX Target

The unit-economics page should have this order:

1. Header with title, guide button, and back-to-logistics button.
2. Small guide link: “Не уверены, что вводить в поля?”
3. New panel: “Данные для расчёта”
   - upload logistics tariff XLSX;
   - upload product report XLSX;
   - choose product filter and product;
   - choose source cluster for logistics;
   - show selected product summary;
   - show concise source messages.
4. Existing summary panel.
5. Existing income/expense form and result panel.

Manual unit-economics inputs must remain available even if no files are loaded.

## Task 1: Extract Tariff Upload Panel

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Create a reusable component near existing small components**

Add this component after `Field`:

```jsx
function TariffUploadPanel({ fileName, status, onFileChange, showDownloadNote = false }) {
  return (
    <section className="panel data-panel" aria-label="Загрузка тарифов логистики Ozon">
      <div className="panel-heading panel-heading-spread">
        <div>
          <p className="eyebrow">Обязательно для логистики</p>
          <h2>Тарифы логистики Ozon</h2>
        </div>
        <label className="ghost-upload-button" title="Загрузить XLSX с тарифами">
          <Icon symbol="↑" />
          <span>Загрузить тарифы</span>
          <input accept=".xlsx,.xls" onChange={onFileChange} type="file" />
        </label>
      </div>

      <div className={`notice ${status.tone}`}>
        <Icon symbol={status.tone === "success" ? "✓" : status.tone === "danger" ? "!" : "i"} />
        <span>{status.text}</span>
      </div>

      {fileName ? <p className="file-name">Файл тарифов: {fileName}</p> : null}

      {showDownloadNote ? (
        <p className="tariff-link-note">
          Файл с актуальными тарифами можно скачать на{" "}
          <a href={OZON_TARIFFS_URL} rel="noreferrer" target="_blank">
            странице Ozon Seller
          </a>
          .
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Replace the logistics-page inline tariff upload markup**

On the logistics page, keep the header upload button as it is for now. Replace only the status/file/note block under the header with:

```jsx
<div className={`notice ${status.tone}`}>
  <Icon symbol={status.tone === "success" ? "✓" : "!"} />
  <span>{status.text}</span>
</div>

{fileName ? <p className="file-name">Файл: {fileName}</p> : null}
<p className="tariff-link-note">
  Файл с актуальными тарифами можно скачать на{" "}
  <a href={OZON_TARIFFS_URL} rel="noreferrer" target="_blank">
    странице Ozon Seller
  </a>
  .
</p>
```

This keeps the current logistics page visually unchanged. The reusable panel will be used first on the unit-economics page.

- [ ] **Step 3: Verify no visual change on `/`**

Run:

```bash
npm run test:logic
```

Expected: all existing logic tests pass.

## Task 2: Extract Product Report Panel

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Create `SelectedProductSummary`**

Add near shared components:

```jsx
function SelectedProductSummary({ selectedProduct, onResetSelectedProduct }) {
  if (!selectedProduct) {
    return null;
  }

  return (
    <div className="selected-product">
      <div>
        <span>Выбран товар из отчёта</span>
        <strong>{selectedProduct.name}</strong>
        <p>
          {selectedProduct.article ? `${selectedProduct.article} · ` : ""}
          {selectedProduct.status || "Без статуса"} · {numberFormatter.format(selectedProduct.volumeLiters)} л ·{" "}
          {formatRuble(selectedProduct.price)}
        </p>
      </div>
      <button className="ghost-button compact-button" onClick={onResetSelectedProduct} type="button">
        Ручной ввод
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `ProductReportPanel`**

Add:

```jsx
function ProductReportPanel({
  productFileName,
  productReport,
  productStatus,
  productStatusFilter,
  filteredProducts,
  selectedProductKey,
  selectedProduct,
  onProductFileChange,
  onProductStatusFilterChange,
  onProductSelect,
  onResetSelectedProduct,
}) {
  return (
    <section className="panel products-panel" aria-label="Импорт товаров из отчёта Ozon">
      <div className="panel-heading panel-heading-spread">
        <div>
          <p className="eyebrow">Необязательно</p>
          <h2>Товары из отчёта Ozon</h2>
        </div>
        <label className="ghost-upload-button" title="Загрузить XLSX-отчёт товаров">
          <Icon symbol="↑" />
          <span>Загрузить товары</span>
          <input accept=".xlsx,.xls" onChange={onProductFileChange} type="file" />
        </label>
      </div>

      <div className={`notice ${productStatus.tone}`}>
        <Icon symbol={productStatus.tone === "success" ? "✓" : productStatus.tone === "danger" ? "!" : "i"} />
        <span>{productStatus.text}</span>
      </div>

      {productFileName ? <p className="file-name">Файл товаров: {productFileName}</p> : null}

      {productReport ? (
        <div className="product-picker-grid">
          <label className="field">
            <span>Фильтр товаров</span>
            <select onChange={(event) => onProductStatusFilterChange(event.target.value)} value={productStatusFilter}>
              <option value={PRODUCT_STATUS_FILTERS.ACTIVE}>Продаются и готовые</option>
              <option value={PRODUCT_STATUS_FILTERS.ALL}>Все</option>
              <option value={PRODUCT_STATUS_FILTERS.SELLING}>Продаются</option>
              <option value={PRODUCT_STATUS_FILTERS.READY}>Готовы к продаже</option>
              <option value={PRODUCT_STATUS_FILTERS.NOT_SELLING}>Не продаются</option>
            </select>
          </label>

          <label className="field product-select-field">
            <span>Товар</span>
            <select disabled={!filteredProducts.length} onChange={(event) => onProductSelect(event.target.value)} value={selectedProductKey}>
              <option value="">Ручной ввод</option>
              {filteredProducts.map((product) => (
                <option key={getProductKey(product)} value={getProductKey(product)}>
                  {formatProductOption(product)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <SelectedProductSummary selectedProduct={selectedProduct} onResetSelectedProduct={onResetSelectedProduct} />
    </section>
  );
}
```

- [ ] **Step 3: Replace duplicated product JSX on logistics page**

Replace the current product import `<section className="panel products-panel"...>` with:

```jsx
<ProductReportPanel
  filteredProducts={filteredProducts}
  onProductFileChange={handleProductFileChange}
  onProductSelect={(value) => {
    setSelectedProductKey(value);
    setShowAll(false);
  }}
  onProductStatusFilterChange={(value) => {
    setProductStatusFilter(value);
    resetSelectedProduct();
  }}
  onResetSelectedProduct={resetSelectedProduct}
  productFileName={productFileName}
  productReport={productReport}
  productStatus={productStatus}
  productStatusFilter={productStatusFilter}
  selectedProduct={selectedProduct}
  selectedProductKey={selectedProductKey}
/>
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:logic
```

Expected: all existing logic tests pass.

## Task 3: Add Standalone Data Panel to Unit Economics Page

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Extend `UnitEconomicsPage` props**

Add these props:

```jsx
fileName,
filteredProducts,
onClusterChange,
onFileChange,
onProductFileChange,
onProductSelect,
onProductStatusFilterChange,
onResetSelectedProduct,
parsed,
productFileName,
productReport,
productStatus,
productStatusFilter,
selectedCluster,
selectedProduct,
selectedProductKey,
status,
```

- [ ] **Step 2: Render a new standalone setup panel before `unit-summary-panel`**

Inside `UnitEconomicsPage`, after the guide note, add:

```jsx
<section className="unit-data-grid" aria-label="Файлы и товар для расчёта">
  <TariffUploadPanel fileName={fileName} onFileChange={onFileChange} showDownloadNote status={status} />

  <ProductReportPanel
    filteredProducts={filteredProducts}
    onProductFileChange={onProductFileChange}
    onProductSelect={onProductSelect}
    onProductStatusFilterChange={onProductStatusFilterChange}
    onResetSelectedProduct={onResetSelectedProduct}
    productFileName={productFileName}
    productReport={productReport}
    productStatus={productStatus}
    productStatusFilter={productStatusFilter}
    selectedProduct={selectedProduct}
    selectedProductKey={selectedProductKey}
  />

  <section className="panel data-panel logistics-source-panel" aria-label="Кластер отправления для расчёта логистики">
    <div className="panel-heading">
      <Icon symbol="↗" />
      <h2>Кластер отправления</h2>
    </div>
    <label className="field cluster-field standalone-cluster-field">
      <span>Кластер отправления</span>
      <select disabled={!parsed?.sourceClusters.length} onChange={(event) => onClusterChange(event.target.value)} value={selectedCluster}>
        {!parsed?.sourceClusters.length ? <option>Сначала загрузите тарифы</option> : null}
        {parsed?.sourceClusters.map((cluster) => (
          <option key={cluster} value={cluster}>
            {cluster}
          </option>
        ))}
      </select>
    </label>
    <p className="helper-text">
      Этот кластер нужен, чтобы автоматически подставить логистику в расчёт. Если тарифы не загружены, сумму логистики можно ввести вручную ниже.
    </p>
  </section>
</section>
```

- [ ] **Step 3: Pass props from `App`**

In the `UnitEconomicsPage` call, pass:

```jsx
fileName={fileName}
filteredProducts={filteredProducts}
onClusterChange={(value) => {
  setSelectedCluster(value);
  setShowAll(false);
}}
onFileChange={handleFileChange}
onProductFileChange={handleProductFileChange}
onProductSelect={(value) => {
  setSelectedProductKey(value);
  setShowAll(false);
}}
onProductStatusFilterChange={(value) => {
  setProductStatusFilter(value);
  resetSelectedProduct();
}}
onResetSelectedProduct={resetSelectedProduct}
parsed={parsed}
productFileName={productFileName}
productReport={productReport}
productStatus={productStatus}
productStatusFilter={productStatusFilter}
selectedCluster={selectedCluster}
selectedProduct={selectedProduct}
selectedProductKey={selectedProductKey}
status={status}
```

- [ ] **Step 4: Add CSS**

Add before the current `@media` block:

```css
.unit-data-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.unit-data-grid .products-panel,
.unit-data-grid .data-panel {
  margin-top: 0;
  padding: 22px;
}

.logistics-source-panel {
  grid-column: 1 / -1;
}

.standalone-cluster-field {
  margin-top: 0;
}

.helper-text {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14px;
}
```

In the existing `@media (max-width: 820px)` grid list, add `.unit-data-grid` so it becomes one column on mobile.

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:logic
```

Expected: all existing logic tests pass.

## Task 4: Preserve Unit Economics Auto-Fill Behavior

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Check current data flow**

Confirm these current values still drive unit economics:

```jsx
const volume = selectedProduct ? selectedProduct.volumeLiters : manualVolume;
const activeProductPrice = selectedProduct ? selectedProduct.price : inputs.productPrice;
const result = useMemo(() => calculateLogistics(...), [...]);
const unitContext = useMemo(() => ({ ... }), [...]);
```

- [ ] **Step 2: Keep manual override behavior**

Do not automatically overwrite manually edited fields except where current code already does it. The user must still be able to:

- type `salePrice`;
- type `logistics`;
- type `commissionPercent`;
- choose `LOGISTICS_MODES.MANUAL`.

- [ ] **Step 3: Verify direct URL scenario**

Open `/unit-economics` directly in the browser after a fresh load.

Expected:

- page loads without visiting `/`;
- tariff upload is visible;
- product upload is visible;
- commission upload is visible;
- manual fields are usable before any file upload;
- logistics field can be manual when tariffs are absent.

## Task 5: Browser Layout Verification

**Files:**
- Modify only if verification reveals visual bugs:
  - `src/App.jsx`
  - `src/styles.css`

- [ ] **Step 1: Build the app**

Run:

```bash
npm run build
```

Expected: Vite production build completes.

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev
```

Expected: local Vite URL is available.

- [ ] **Step 3: Check desktop**

Open:

```text
http://localhost:5173/unit-economics
```

Expected:

- no horizontal overflow;
- upload panels align cleanly;
- result panel remains visible and not cramped;
- buttons do not wrap awkwardly;
- the page reads as an operational calculator, not as a landing page.

- [ ] **Step 4: Check mobile width**

Use browser responsive mode around `390px` wide.

Expected:

- all panels stack in one column;
- file upload buttons fit;
- product select does not break layout;
- result cards do not overlap text.

## Task 6: Final Verification and Commit

**Files:**
- Commit all files changed by implementation.

- [ ] **Step 1: Run logic tests**

Run:

```bash
npm run test:logic
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 3: Review git diff**

Run:

```bash
git diff -- src/App.jsx src/styles.css
```

Expected:

- no unrelated changes;
- logistics page still has the same visible controls;
- unit-economics page has standalone file/product controls;
- no backend or network calls were added.

- [ ] **Step 4: Commit**

Use a focused commit message:

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: make unit economics page standalone"
```

## Self-Review

- Scope is limited to layout/state wiring for `/unit-economics`.
- Existing manual mode remains available.
- Existing logistics page remains standalone.
- No backend, API, Ozon login, scraping, or new dependencies are introduced.
- The plan does not require changing tariff, product, commission, or unit-economics calculation logic.
