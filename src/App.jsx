import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  calculateLogistics,
  calculateVolumeLiters,
  parseTariffSheets,
  parseProductPrice,
} from "./tariffs.js";

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

function formatRuble(value) {
  return rubleFormatter.format(value);
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

export default function App() {
  const [inputs, setInputs] = useState(initialInputs);
  const [parsed, setParsed] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState({
    tone: "muted",
    text: "Загрузите XLSX-файл с тарифами Ozon.",
  });
  const [showAll, setShowAll] = useState(false);

  const volume = useMemo(() => calculateVolumeLiters(inputs), [inputs]);

  const result = useMemo(() => {
    if (!parsed) {
      return { status: "empty", message: "Загрузите XLSX-файл с тарифами." };
    }

    return calculateLogistics({
      tariffs: parsed.tariffs,
      defaultTariffs: parsed.defaultTariffs,
      productPrice: inputs.productPrice,
      volume,
      sourceCluster: selectedCluster,
    });
  }, [inputs.productPrice, parsed, selectedCluster, volume]);

  const productPrice = parseProductPrice(inputs.productPrice);
  const selectedPriceColumn =
    productPrice === null
      ? "—"
      : productPrice <= 300
        ? "Для товаров до 300 руб."
        : "Для товаров свыше 300 руб.";

  function updateInput(name, value) {
    setInputs((current) => ({ ...current, [name]: value }));
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

  const visibleRows = result.status === "ok" ? result.rows : [];

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="intro">
          <div>
            <p className="eyebrow">Ozon FBS</p>
            <h1>Калькулятор логистики</h1>
          </div>
          <label className="upload-button" title="Загрузить XLSX с тарифами">
            <Icon symbol="↑" />
            <span>Загрузить XLSX</span>
            <input accept=".xlsx,.xls" onChange={handleFileChange} type="file" />
          </label>
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
    </main>
  );
}
