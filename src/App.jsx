import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  calculateLogistics,
  calculateVolumeLiters,
  parseTariffSheets,
  parseProductPrice,
} from "./tariffs.js";
import {
  filterProductsByStatus,
  parseProductReportSheets,
  PRODUCT_STATUS_FILTERS,
} from "./products.js";
import {
  calculateUnitEconomics,
  LOGISTICS_MODES,
  makeEmptyUnitEconomicsInputs,
} from "./unitEconomics.js";

const initialInputs = {
  productPrice: "",
  length: "",
  width: "",
  height: "",
};

const rubleFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 3,
});

const OZON_TARIFFS_URL =
  "https://seller-edu.ozon.ru/libra/commissions-tariffs/legal-information/full-actual-commissions?utm_source=Prices&mode=small&collapsed=false&source=faq#2-3-3-логистика";
const MM_NOTICE_KEY = "ozon-mm-notice-v1";
const PRODUCT_IMPORT_NOTICE_KEY = "ozon-product-import-notice-v1";
const UNIT_ECONOMICS_NOTICE_KEY = "ozon-unit-economics-notice-v1";
const UNIT_ECONOMICS_DRAFT_KEY = "ozon-unit-economics-draft-v1";

function noticeCookie(key) {
  return `${key}=seen`;
}

function shouldShowNotice(key) {
  try {
    return window.localStorage.getItem(key) !== "seen";
  } catch {
    return !document.cookie.split("; ").includes(noticeCookie(key));
  }
}

function rememberNotice(key) {
  try {
    window.localStorage.setItem(key, "seen");
  } catch {
    // The cookie below keeps the notice one-time even if the browser blocks localStorage.
  }

  document.cookie = `${noticeCookie(key)}; max-age=31536000; path=/; SameSite=Lax`;
}

function formatRuble(value) {
  return rubleFormatter.format(value);
}

function getProductKey(product) {
  return `${product.article}|${product.sku}|${product.barcode}`;
}

function formatProductOption(product) {
  const title = product.article ? `${product.article} — ${product.name}` : product.name;
  return `${title} · ${numberFormatter.format(product.volumeLiters)} л · ${formatRuble(product.price)}`;
}

function readWorkbookSheets(workbook) {
  return Object.fromEntries(
    workbook.SheetNames.map((sheetName) => [
      sheetName,
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: true,
        defval: null,
      }),
    ]),
  );
}

function getInitialPage() {
  return window.location.pathname === "/unit-economics" ? "unit-economics" : "logistics";
}

function readSavedUnitEconomicsDraft() {
  try {
    const rawDraft = window.sessionStorage.getItem(UNIT_ECONOMICS_DRAFT_KEY);
    return rawDraft ? JSON.parse(rawDraft) : null;
  } catch {
    return null;
  }
}

function saveUnitEconomicsDraft(draft) {
  try {
    window.sessionStorage.setItem(UNIT_ECONOMICS_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The draft is a convenience for page refreshes; the calculator still works without storage.
  }
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${numberFormatter.format(value)} %`;
}

function formatInputRuble(value) {
  const amount = parseProductPrice(value);
  return amount === null ? "—" : formatRuble(amount);
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Icon({ symbol }) {
  return (
    <span className="icon" aria-hidden="true">
      {symbol}
    </span>
  );
}

function Field({ label, value, onChange, placeholder, suffix }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          inputMode="decimal"
          min="0"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="number"
          value={value}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

function UnitEconomicsPage({
  unitInputs,
  unitContext,
  onBackToLogistics,
  onInputChange,
  onLogisticsModeChange,
}) {
  const economics = useMemo(() => calculateUnitEconomics(unitInputs), [unitInputs]);
  const isProfitable = economics.status === "ok" && economics.profit >= 0;
  const resultTone = economics.status !== "ok" ? "muted" : isProfitable ? "success" : "danger";

  return (
    <section className="workspace unit-workspace">
      <div className="intro">
        <div>
          <p className="eyebrow">Ozon FBS</p>
          <h1>Юнит-экономика</h1>
        </div>
        <button className="ghost-button" onClick={onBackToLogistics} type="button">
          <Icon symbol="←" />
          <span>Вернуться к логистике</span>
        </button>
      </div>

      <section className="panel unit-summary-panel" aria-label="Источник данных для расчёта">
        <div className="panel-heading panel-heading-spread">
          <div>
            <p className="eyebrow">Плановый расчёт</p>
            <h2>{unitContext.productName || "Ручной расчёт товара"}</h2>
          </div>
          <span className="source-pill">{unitContext.source || "Введено вручную"}</span>
        </div>
        <div className="context-grid">
          <div>
            <span>Цена</span>
            <strong>{formatInputRuble(unitInputs.salePrice)}</strong>
          </div>
          <div>
            <span>Объём</span>
            <strong>{unitContext.volume ? `${numberFormatter.format(unitContext.volume)} л` : "—"}</strong>
          </div>
          <div>
            <span>Кластер</span>
            <strong>{unitContext.sourceCluster || "—"}</strong>
          </div>
          <div>
            <span>Логистика</span>
            <strong>{formatInputRuble(unitInputs.logistics)}</strong>
          </div>
        </div>
      </section>

      <section className="unit-grid">
        <div className="panel unit-form-panel">
          <div className="panel-heading">
            <Icon symbol="₽" />
            <h2>Доход и расходы</h2>
          </div>

          <div className="form-grid unit-form-grid">
            <Field
              label="Цена продажи"
              onChange={(value) => onInputChange("salePrice", value)}
              placeholder="1000"
              suffix="₽"
              value={unitInputs.salePrice}
            />
            <Field
              label="Себестоимость"
              onChange={(value) => onInputChange("cost", value)}
              placeholder="400"
              suffix="₽"
              value={unitInputs.cost}
            />
            <Field
              label="Комиссия Ozon"
              onChange={(value) => onInputChange("commissionPercent", value)}
              placeholder="15"
              suffix="%"
              value={unitInputs.commissionPercent}
            />
            <Field
              label="Эквайринг"
              onChange={(value) => onInputChange("acquiringPercent", value)}
              placeholder="1,5"
              suffix="%"
              value={unitInputs.acquiringPercent}
            />
            <Field
              label="Обработка отправления"
              onChange={(value) => onInputChange("processing", value)}
              placeholder="30"
              suffix="₽"
              value={unitInputs.processing}
            />
            <Field
              label="Доставка до места выдачи"
              onChange={(value) => onInputChange("destinationDelivery", value)}
              placeholder="25"
              suffix="₽"
              value={unitInputs.destinationDelivery}
            />
            <Field
              label="Упаковка"
              onChange={(value) => onInputChange("packaging", value)}
              placeholder="15"
              suffix="₽"
              value={unitInputs.packaging}
            />
            <Field
              label="Реклама"
              onChange={(value) => onInputChange("advertising", value)}
              placeholder="50"
              suffix="₽"
              value={unitInputs.advertising}
            />
            <Field
              label="Налог"
              onChange={(value) => onInputChange("taxPercent", value)}
              placeholder="6"
              suffix="%"
              value={unitInputs.taxPercent}
            />
            <Field
              label="Прочие расходы"
              onChange={(value) => onInputChange("otherExpenses", value)}
              placeholder="0"
              suffix="₽"
              value={unitInputs.otherExpenses}
            />
          </div>

          <div className="logistics-choice">
            <label className="field">
              <span>Логистика для расчёта</span>
              <select onChange={(event) => onLogisticsModeChange(event.target.value)} value={unitInputs.logisticsMode}>
                <option disabled={!unitContext.logisticsStats} value={LOGISTICS_MODES.AVERAGE}>
                  Средняя из расчёта логистики
                </option>
                <option disabled={!unitContext.logisticsStats} value={LOGISTICS_MODES.MIN}>
                  Минимальная из расчёта логистики
                </option>
                <option disabled={!unitContext.logisticsStats} value={LOGISTICS_MODES.MAX}>
                  Максимальная из расчёта логистики
                </option>
                <option value={LOGISTICS_MODES.MANUAL}>Ввести вручную</option>
              </select>
            </label>
            <Field
              label="Сумма логистики"
              onChange={(value) => onInputChange("logistics", value)}
              placeholder="120"
              suffix="₽"
              value={unitInputs.logistics}
            />
          </div>
        </div>

        <aside className="panel unit-result-panel" aria-label="Итог юнит-экономики">
          <div className={`unit-profit-card ${resultTone}`}>
            <span>Прибыль</span>
            <strong>{economics.status === "ok" ? formatRuble(economics.profit) : "—"}</strong>
            <p>{economics.status === "ok" ? (isProfitable ? "Товар в плюсе" : "Товар в минусе") : economics.message}</p>
          </div>

          {economics.status === "ok" ? (
            <>
              <div className="unit-metrics">
                <StatCard label="Маржинальность" value={formatPercent(economics.marginPercent)} />
                <StatCard label="ROI" value={formatPercent(economics.roiPercent)} />
                <StatCard label="Расходы всего" value={formatRuble(economics.expenses.total)} />
              </div>

              <div className="expense-list">
                <div>
                  <span>Себестоимость</span>
                  <strong>{formatRuble(economics.expenses.cost)}</strong>
                </div>
                <div>
                  <span>Комиссия Ozon</span>
                  <strong>{formatRuble(economics.expenses.commission)}</strong>
                </div>
                <div>
                  <span>Эквайринг</span>
                  <strong>{formatRuble(economics.expenses.acquiring)}</strong>
                </div>
                <div>
                  <span>Логистика</span>
                  <strong>{formatRuble(economics.expenses.logistics)}</strong>
                </div>
                <div>
                  <span>Остальные расходы</span>
                  <strong>
                    {formatRuble(
                      economics.expenses.processing +
                        economics.expenses.destinationDelivery +
                        economics.expenses.packaging +
                        economics.expenses.advertising +
                        economics.expenses.tax +
                        economics.expenses.otherExpenses,
                    )}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">{economics.message}</div>
          )}
        </aside>
      </section>
    </section>
  );
}

export default function App() {
  const savedUnitDraft = useMemo(readSavedUnitEconomicsDraft, []);
  const [inputs, setInputs] = useState(initialInputs);
  const [parsed, setParsed] = useState(null);
  const [productReport, setProductReport] = useState(null);
  const [page, setPage] = useState(getInitialPage);
  const [selectedCluster, setSelectedCluster] = useState("");
  const [fileName, setFileName] = useState("");
  const [productFileName, setProductFileName] = useState("");
  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState(PRODUCT_STATUS_FILTERS.ACTIVE);
  const [showMillimeterNotice, setShowMillimeterNotice] = useState(() => shouldShowNotice(MM_NOTICE_KEY));
  const [showProductImportNotice, setShowProductImportNotice] = useState(() =>
    shouldShowNotice(PRODUCT_IMPORT_NOTICE_KEY),
  );
  const [showUnitEconomicsNotice, setShowUnitEconomicsNotice] = useState(() =>
    shouldShowNotice(UNIT_ECONOMICS_NOTICE_KEY),
  );
  const [unitInputs, setUnitInputs] = useState(() => ({
    ...makeEmptyUnitEconomicsInputs(),
    ...(savedUnitDraft?.inputs ?? {}),
  }));
  const [unitContext, setUnitContext] = useState(() => savedUnitDraft?.context ?? {});
  const [status, setStatus] = useState({
    tone: "muted",
    text: "Загрузите XLSX-файл с тарифами Ozon.",
  });
  const [productStatus, setProductStatus] = useState({
    tone: "muted",
    text: "Отчёт товаров можно загрузить позже, ручной ввод уже доступен.",
  });
  const [showAll, setShowAll] = useState(false);

  const products = productReport?.products ?? [];
  const filteredProducts = useMemo(
    () => filterProductsByStatus(products, productStatusFilter),
    [productStatusFilter, products],
  );
  const selectedProduct = useMemo(
    () => products.find((product) => getProductKey(product) === selectedProductKey) ?? null,
    [products, selectedProductKey],
  );
  const manualVolume = useMemo(() => calculateVolumeLiters(inputs), [inputs]);
  const volume = selectedProduct ? selectedProduct.volumeLiters : manualVolume;
  const activeProductPrice = selectedProduct ? selectedProduct.price : inputs.productPrice;

  const result = useMemo(() => {
    if (!parsed) {
      return { status: "empty", message: "Загрузите XLSX-файл с тарифами." };
    }

    return calculateLogistics({
      tariffs: parsed.tariffs,
      defaultTariffs: parsed.defaultTariffs,
      productPrice: activeProductPrice,
      volume,
      sourceCluster: selectedCluster,
    });
  }, [activeProductPrice, parsed, selectedCluster, volume]);

  const productPrice = selectedProduct ? selectedProduct.price : parseProductPrice(inputs.productPrice);
  const selectedPriceColumn =
    productPrice === null
      ? "—"
      : productPrice <= 300
        ? "Для товаров до 300 руб."
        : "Для товаров свыше 300 руб.";

  useEffect(() => {
    function handlePopState() {
      setPage(getInitialPage());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    saveUnitEconomicsDraft({ inputs: unitInputs, context: unitContext });
  }, [unitContext, unitInputs]);

  function navigateTo(nextPage) {
    const path = nextPage === "unit-economics" ? "/unit-economics" : "/";
    window.history.pushState({}, "", path);
    setPage(nextPage);
  }

  function getLogisticsAmount(mode) {
    if (result.status !== "ok") {
      return null;
    }

    if (mode === LOGISTICS_MODES.MIN) {
      return result.stats.min;
    }

    if (mode === LOGISTICS_MODES.MAX) {
      return result.stats.max;
    }

    return result.stats.average;
  }

  function buildUnitEconomicsDraft() {
    const logisticsAmount = getLogisticsAmount(LOGISTICS_MODES.AVERAGE);
    return {
      inputs: {
        ...unitInputs,
        salePrice: productPrice === null ? unitInputs.salePrice : String(productPrice),
        logistics: logisticsAmount === null ? unitInputs.logistics : logisticsAmount.toFixed(2),
        logisticsMode: logisticsAmount === null ? LOGISTICS_MODES.MANUAL : LOGISTICS_MODES.AVERAGE,
      },
      context: {
        productName: selectedProduct?.name ?? "",
        article: selectedProduct?.article ?? "",
        sku: selectedProduct?.sku ?? "",
        category: selectedProduct?.category ?? "",
        source: selectedProduct ? "Товар из отчёта Ozon" : "Из расчёта логистики",
        sourceCluster: selectedCluster,
        volume,
        logisticsStats: result.status === "ok" ? result.stats : null,
      },
    };
  }

  function goToUnitEconomics() {
    const draft = buildUnitEconomicsDraft();
    setUnitInputs(draft.inputs);
    setUnitContext(draft.context);
    saveUnitEconomicsDraft(draft);
    navigateTo("unit-economics");
  }

  function goToLogistics() {
    navigateTo("logistics");
  }

  function updateUnitInput(name, value) {
    setUnitInputs((current) => ({
      ...current,
      [name]: value,
      ...(name === "logistics" ? { logisticsMode: LOGISTICS_MODES.MANUAL } : {}),
    }));
  }

  function updateUnitLogisticsMode(mode) {
    const logisticsAmount = getLogisticsAmount(mode);
    setUnitInputs((current) => ({
      ...current,
      logisticsMode: mode,
      logistics:
        mode === LOGISTICS_MODES.MANUAL || logisticsAmount === null ? current.logistics : logisticsAmount.toFixed(2),
    }));
  }

  function updateInput(name, value) {
    setInputs((current) => ({ ...current, [name]: value }));
  }

  function closeMillimeterNotice() {
    rememberNotice(MM_NOTICE_KEY);
    setShowMillimeterNotice(false);
  }

  function closeProductImportNotice() {
    rememberNotice(PRODUCT_IMPORT_NOTICE_KEY);
    setShowProductImportNotice(false);
  }

  function closeUnitEconomicsNotice() {
    rememberNotice(UNIT_ECONOMICS_NOTICE_KEY);
    setShowUnitEconomicsNotice(false);
  }

  function resetSelectedProduct() {
    setSelectedProductKey("");
    setShowAll(false);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setShowAll(false);
    setStatus({ tone: "muted", text: "Читаю файл в браузере..." });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetsByName = readWorkbookSheets(workbook);
      const nextParsed = parseTariffSheets(sheetsByName);

      setParsed(nextParsed);
      setSelectedCluster(nextParsed.sourceClusters[0] ?? "");
      setStatus({
        tone: "success",
        text: `Файл загружен: ${nextParsed.meta.logisticsCount.toLocaleString("ru-RU")} маршрутных тарифов, ${nextParsed.meta.defaultCount.toLocaleString("ru-RU")} тарифов по умолчанию.`,
      });
    } catch (error) {
      setParsed(null);
      setSelectedCluster("");
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Не удалось прочитать XLSX-файл.",
      });
    } finally {
      event.target.value = "";
    }
  }

  async function handleProductFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setProductFileName(file.name);
    setSelectedProductKey("");
    setShowAll(false);
    setProductStatus({ tone: "muted", text: "Читаю отчёт товаров в браузере..." });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetsByName = readWorkbookSheets(workbook);
      const nextReport = parseProductReportSheets(sheetsByName);

      setProductReport(nextReport);
      setProductStatus({
        tone: "success",
        text: `Отчёт загружен: ${nextReport.meta.count.toLocaleString("ru-RU")} товаров с ценой и объёмом.`,
      });
    } catch (error) {
      setProductReport(null);
      setProductStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Не удалось прочитать отчёт товаров.",
      });
    } finally {
      event.target.value = "";
    }
  }

  const visibleRows = result.status === "ok" ? result.rows : [];

  return (
    <main className="app-shell">
      {showMillimeterNotice ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="millimeter-notice-text"
            aria-labelledby="millimeter-notice-title"
            className="update-modal"
            role="dialog"
          >
            <p className="modal-kicker">Обновление калькулятора</p>
            <h2 id="millimeter-notice-title">Габариты теперь в миллиметрах</h2>
            <p id="millimeter-notice-text">
              Вводите длину, ширину и высоту в мм — как в карточке товара Ozon. Объём считается без округления,
              поэтому разница даже в 1 мм может повлиять на тарифный диапазон.
            </p>
            <button className="modal-button" onClick={closeMillimeterNotice} type="button">
              Понятно
            </button>
          </section>
        </div>
      ) : null}
      {!showMillimeterNotice && showProductImportNotice ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="product-import-notice-text"
            aria-labelledby="product-import-notice-title"
            className="update-modal"
            role="dialog"
          >
            <p className="modal-kicker">Новое обновление</p>
            <h2 id="product-import-notice-title">Можно выбирать товары из отчёта Ozon</h2>
            <p id="product-import-notice-text">
              Теперь можно загрузить XLSX-отчёт «Товары», выбрать товар, и калькулятор сам возьмёт цену и объём из
              файла. Ручной ввод цены и габаритов в миллиметрах остался на месте.
            </p>
            <button className="modal-button" onClick={closeProductImportNotice} type="button">
              Отлично
            </button>
          </section>
        </div>
      ) : null}
      {!showMillimeterNotice && !showProductImportNotice && showUnitEconomicsNotice ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="unit-economics-notice-text"
            aria-labelledby="unit-economics-notice-title"
            className="update-modal"
            role="dialog"
          >
            <p className="modal-kicker">Новое обновление</p>
            <h2 id="unit-economics-notice-title">Появился полный расчёт юнит-экономики</h2>
            <p id="unit-economics-notice-text">
              Логистика осталась отдельным быстрым калькулятором. Теперь из неё можно перейти на новую страницу и
              посчитать прибыль, маржинальность и ROI с учётом себестоимости, комиссии, эквайринга и других расходов.
            </p>
            <button className="modal-button" onClick={closeUnitEconomicsNotice} type="button">
              Хорошо
            </button>
          </section>
        </div>
      ) : null}
      {page === "unit-economics" ? (
        <UnitEconomicsPage
          onBackToLogistics={goToLogistics}
          onInputChange={updateUnitInput}
          onLogisticsModeChange={updateUnitLogisticsMode}
          unitContext={unitContext}
          unitInputs={unitInputs}
        />
      ) : (
      <section className="workspace">
        <div className="intro">
          <div>
            <p className="eyebrow">Ozon FBS</p>
            <h1>Калькулятор логистики</h1>
          </div>
          <div className="intro-actions">
            <button className="ghost-button unit-nav-button" onClick={goToUnitEconomics} type="button">
              <Icon symbol="→" />
              <span>Перейти в полный расчёт юнит-экономики</span>
            </button>
            <label className="upload-button" title="Загрузить XLSX с тарифами">
              <Icon symbol="↑" />
              <span>Загрузить XLSX</span>
              <input accept=".xlsx,.xls" onChange={handleFileChange} type="file" />
            </label>
          </div>
        </div>

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

        <section className="panel products-panel" aria-label="Импорт товаров из отчёта Ozon">
          <div className="panel-heading panel-heading-spread">
            <div>
              <p className="eyebrow">Необязательно</p>
              <h2>Товары из отчёта Ozon</h2>
            </div>
            <label className="ghost-upload-button" title="Загрузить XLSX-отчёт товаров">
              <Icon symbol="↑" />
              <span>Загрузить товары</span>
              <input accept=".xlsx,.xls" onChange={handleProductFileChange} type="file" />
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
                <select
                  onChange={(event) => {
                    setProductStatusFilter(event.target.value);
                    resetSelectedProduct();
                  }}
                  value={productStatusFilter}
                >
                  <option value={PRODUCT_STATUS_FILTERS.ACTIVE}>Продаются и готовые</option>
                  <option value={PRODUCT_STATUS_FILTERS.ALL}>Все</option>
                  <option value={PRODUCT_STATUS_FILTERS.SELLING}>Продаются</option>
                  <option value={PRODUCT_STATUS_FILTERS.READY}>Готовы к продаже</option>
                  <option value={PRODUCT_STATUS_FILTERS.NOT_SELLING}>Не продаются</option>
                </select>
              </label>

              <label className="field product-select-field">
                <span>Товар</span>
                <select
                  disabled={!filteredProducts.length}
                  onChange={(event) => {
                    setSelectedProductKey(event.target.value);
                    setShowAll(false);
                  }}
                  value={selectedProductKey}
                >
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

          {selectedProduct ? (
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
              <button className="ghost-button compact-button" onClick={resetSelectedProduct} type="button">
                Ручной ввод
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel inputs-panel" aria-label="Параметры расчёта">
          <div className="panel-heading">
            <Icon symbol="=" />
            <h2>Параметры</h2>
          </div>

          <div className="form-grid">
            <Field
              label="Цена товара"
              onChange={(value) => updateInput("productPrice", value)}
              placeholder="300"
              suffix="₽"
              value={inputs.productPrice}
            />
            <Field
              label="Длина"
              onChange={(value) => updateInput("length", value)}
              placeholder="220"
              suffix="мм"
              value={inputs.length}
            />
            <Field
              label="Ширина"
              onChange={(value) => updateInput("width", value)}
              placeholder="220"
              suffix="мм"
              value={inputs.width}
            />
            <Field
              label="Высота"
              onChange={(value) => updateInput("height", value)}
              placeholder="220"
              suffix="мм"
              value={inputs.height}
            />
          </div>

          <label className="field cluster-field">
            <span>Кластер отправления</span>
            <select
              disabled={!parsed?.sourceClusters.length}
              onChange={(event) => {
                setSelectedCluster(event.target.value);
                setShowAll(false);
              }}
              value={selectedCluster}
            >
              {!parsed?.sourceClusters.length ? <option>Сначала загрузите файл</option> : null}
              {parsed?.sourceClusters.map((cluster) => (
                <option key={cluster} value={cluster}>
                  {cluster}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel result-panel" aria-label="Результат расчёта">
          <div className="result-topline">
            <div>
              <p className="muted">Объём товара</p>
              <strong>{volume ? `${numberFormatter.format(volume)} л` : "—"}</strong>
            </div>
            <div>
              <p className="muted">Источник расчёта</p>
              <strong>{selectedProduct ? "Товар из отчёта" : "Ручной ввод"}</strong>
            </div>
            <div>
              <p className="muted">Тарифная колонка</p>
              <strong>{selectedPriceColumn}</strong>
            </div>
          </div>

          {result.status === "ok" ? (
            <>
              {result.usedDefault ? (
                <div className="notice warning">
                  <Icon symbol="!" />
                  <span>Применён тариф по умолчанию, потому что маршрутный тариф не найден.</span>
                </div>
              ) : null}

              <div className="stats-grid">
                <StatCard label="Минимум" value={formatRuble(result.stats.min)} />
                <StatCard label="Средняя" value={formatRuble(result.stats.average)} />
                <StatCard label="Максимум" value={formatRuble(result.stats.max)} />
              </div>

              <div className="result-actions">
                <p>
                  Найдено направлений: <strong>{result.stats.count.toLocaleString("ru-RU")}</strong>
                </p>
                <button className="ghost-button" onClick={() => setShowAll((value) => !value)} type="button">
                  <Icon symbol="▦" />
                  <span>{showAll ? "Скрыть направления" : "Показать все направления"}</span>
                  <Icon symbol={showAll ? "↑" : "↓"} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">{result.message}</div>
          )}
        </section>

        {showAll && visibleRows.length ? (
          <section className="panel table-panel" aria-label="Все направления и тарифы">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Кластер доставки</th>
                    <th>Объём</th>
                    <th>Универсальный тариф</th>
                    <th>Тариф по направлению</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => (
                    <tr key={`${row.destination}-${row.volumeLabel}-${index}`}>
                      <td>{row.destination}</td>
                      <td>{row.volumeLabel}</td>
                      <td>{row.universalPrice === null ? "—" : formatRuble(row.universalPrice)}</td>
                      <td>
                        <strong>{formatRuble(row.price)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
      )}
    </main>
  );
}
