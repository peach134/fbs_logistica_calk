const LOGISTICS_SHEET = "Логистика РФ";
const DEFAULT_SHEET = "Тарифы по умолчанию";
const EPSILON = 0.0000001;

const HEADER_ALIASES = {
  volume: ["объем товара", "объём товара"],
  sourceCluster: ["кластер отправления", "кластер отправки"],
  destination: ["кластер доставки", "кластер назначения", "направление"],
  priceUnder300: ["для товаров до 300 руб", "для товаров до 300"],
  priceOver300: ["для товаров свыше 300 руб", "для товаров свыше 300"],
};

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/g, "")
    .trim();
}

export function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/₽|руб\.?|р\.?/gi, "")
    .replace(",", ".")
    .trim();

  if (!text || text === "-" || text === "—") {
    return null;
  }

  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

export function parseProductPrice(value) {
  if (isBlank(value)) {
    return null;
  }

  const price = parseMoney(value);
  return price !== null && price >= 0 ? price : null;
}

export function parseDecimal(value) {
  const text = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

export function parseVolumeRange(label) {
  const text = normalizeText(label);
  const numbers = text.match(/\d+(?:[,.]\d+)?/g)?.map(parseDecimal) ?? [];

  if (!numbers.length) {
    return { volumeMin: null, volumeMax: null };
  }

  if (text.startsWith("от")) {
    return { volumeMin: numbers[0], volumeMax: null };
  }

  if (text.startsWith("до")) {
    return { volumeMin: null, volumeMax: numbers[0] };
  }

  if (numbers.length >= 2) {
    return { volumeMin: numbers[0], volumeMax: numbers[1] };
  }

  return { volumeMin: numbers[0], volumeMax: numbers[0] };
}

export function volumeMatches(tariff, volume) {
  if (!Number.isFinite(volume)) {
    return false;
  }

  const hasMin = tariff.volumeMin !== null && tariff.volumeMin !== undefined;
  const hasMax = tariff.volumeMax !== null && tariff.volumeMax !== undefined;
  const minOk = !hasMin || volume + EPSILON >= tariff.volumeMin;
  const maxOk = !hasMax || volume - EPSILON <= tariff.volumeMax;
  return minOk && maxOk;
}

export function choosePrice(tariff, productPrice) {
  const value = Number(productPrice);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value <= 300 ? tariff.priceUnder300 : tariff.priceOver300;
}

export function findUniversalPrice(defaultTariffs, volume, productPrice) {
  const normalizedProductPrice = parseProductPrice(productPrice);
  if (normalizedProductPrice === null || !Number.isFinite(volume)) {
    return null;
  }

  const defaultTariff = defaultTariffs.find((tariff) => volumeMatches(tariff, volume));
  if (!defaultTariff) {
    return null;
  }

  return choosePrice(defaultTariff, normalizedProductPrice);
}

function findSheetName(sheetNames, exactName, fallbackNeedle) {
  if (sheetNames.includes(exactName)) {
    return exactName;
  }

  const normalizedNeedle = normalizeText(fallbackNeedle);
  return sheetNames.find((name) => normalizeText(name).includes(normalizedNeedle)) ?? null;
}

function findHeaderMap(rows, requiredKeys) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const map = {};

    row.forEach((cell, columnIndex) => {
      const header = normalizeText(cell);
      Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
        if (aliases.some((alias) => header.includes(normalizeText(alias)))) {
          map[key] = columnIndex;
        }
      });
    });

    if (requiredKeys.every((key) => Number.isInteger(map[key]))) {
      return { rowIndex, map };
    }
  }

  return null;
}

function matchesHeader(cell, key) {
  const header = normalizeText(cell);
  return HEADER_ALIASES[key].some((alias) => header.includes(normalizeText(alias)));
}

function hasExpectedFixedHeader(rows, fixedColumns, requiredKeys) {
  const headerRow = rows[2] ?? [];
  return requiredKeys.every((key) => matchesHeader(headerRow[fixedColumns[key]], key));
}

function parseTariffRow(row, columns, fallbackSource, fallbackDestination) {
  const volumeLabel = String(row[columns.volume] ?? "").trim();
  if (!volumeLabel) {
    return null;
  }

  const priceUnder300 = parseMoney(row[columns.priceUnder300]);
  const priceOver300 = parseMoney(row[columns.priceOver300]);
  if (priceUnder300 === null && priceOver300 === null) {
    return null;
  }

  const { volumeMin, volumeMax } = parseVolumeRange(volumeLabel);
  if (volumeMin === null && volumeMax === null) {
    return null;
  }

  return {
    sourceCluster: String(row[columns.sourceCluster] ?? fallbackSource).trim(),
    destination: String(row[columns.destination] ?? fallbackDestination).trim(),
    volumeLabel,
    volumeMin,
    volumeMax,
    priceUnder300,
    priceOver300,
  };
}

function parseRows(rows, fixedColumns, requiredKeys, fallbackSource, fallbackDestination) {
  if (hasExpectedFixedHeader(rows, fixedColumns, requiredKeys)) {
    const fixedStartRow = 3;
    const fixedTariffs = rows
      .slice(fixedStartRow)
      .map((row) => parseTariffRow(row, fixedColumns, fallbackSource, fallbackDestination))
      .filter(Boolean);

    if (fixedTariffs.length) {
      return fixedTariffs;
    }
  }

  const header = findHeaderMap(rows, requiredKeys);
  if (!header) {
    return [];
  }

  return rows
    .slice(header.rowIndex + 1)
    .map((row) => parseTariffRow(row, header.map, fallbackSource, fallbackDestination))
    .filter(Boolean);
}

export function parseTariffSheets(sheetsByName) {
  const sheetNames = Object.keys(sheetsByName);
  const logisticsSheetName = findSheetName(sheetNames, LOGISTICS_SHEET, "логистика");
  const defaultSheetName = findSheetName(sheetNames, DEFAULT_SHEET, "по умолчанию");
  const logisticsRows = logisticsSheetName ? sheetsByName[logisticsSheetName] : null;
  const defaultRows = defaultSheetName ? sheetsByName[defaultSheetName] : null;

  if (!logisticsRows?.length) {
    throw new Error("Не найден лист «Логистика РФ» с тарифами.");
  }

  const tariffs = parseRows(
    logisticsRows,
    {
      volume: 1,
      sourceCluster: 2,
      destination: 3,
      priceUnder300: 4,
      priceOver300: 5,
    },
    ["volume", "sourceCluster", "destination", "priceUnder300", "priceOver300"],
    "",
    "",
  );

  if (!tariffs.length) {
    throw new Error("Не удалось прочитать тарифы на листе «Логистика РФ».");
  }

  const defaultTariffs = defaultRows?.length
    ? parseRows(
        defaultRows,
        {
          volume: 1,
          priceUnder300: 2,
          priceOver300: 3,
          sourceCluster: -1,
          destination: -1,
        },
        ["volume", "priceUnder300", "priceOver300"],
        "Тариф по умолчанию",
        "Тариф по умолчанию",
      )
    : [];

  const sourceClusters = Array.from(
    new Set(tariffs.map((tariff) => tariff.sourceCluster).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "ru"));

  return {
    tariffs,
    defaultTariffs,
    sourceClusters,
    meta: {
      logisticsSheetName,
      defaultSheetName,
      logisticsCount: tariffs.length,
      defaultCount: defaultTariffs.length,
    },
  };
}

export function calculateVolumeLiters({ length, width, height }) {
  const values = [length, width, height].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  return (values[0] * values[1] * values[2]) / 1_000_000;
}

export function calculateLogistics({ tariffs, defaultTariffs, productPrice, volume, sourceCluster }) {
  const normalizedProductPrice = parseProductPrice(productPrice);

  if (normalizedProductPrice === null) {
    return { status: "empty", message: "Введите цену товара." };
  }

  if (!Number.isFinite(volume) || volume <= 0) {
    return { status: "empty", message: "Введите корректные размеры товара." };
  }

  if (!sourceCluster) {
    return { status: "empty", message: "Выберите кластер отправления." };
  }

  const buildRows = (items) =>
    items
      .filter((tariff) => volumeMatches(tariff, volume))
      .map((tariff) => ({
        ...tariff,
        price: choosePrice(tariff, normalizedProductPrice),
      }))
      .filter((tariff) => tariff.price !== null && Number.isFinite(tariff.price));

  const universalPrice = findUniversalPrice(defaultTariffs, volume, normalizedProductPrice);
  const primaryRows = buildRows(
    tariffs.filter((tariff) => normalizeText(tariff.sourceCluster) === normalizeText(sourceCluster)),
  );

  const usedDefault = primaryRows.length === 0;
  const rows = (usedDefault ? buildRows(defaultTariffs) : primaryRows).map((row) => ({
    ...row,
    universalPrice,
  }));

  if (!rows.length) {
    return {
      status: "not-found",
      usedDefault,
      message: usedDefault
        ? "Для этого объёма не найден тариф по умолчанию."
        : "Для выбранного кластера и объёма не найден тариф.",
    };
  }

  const prices = rows.map((row) => row.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;

  return {
    status: "ok",
    usedDefault,
    universalPrice,
    rows,
    stats: {
      min,
      average,
      max,
      count: rows.length,
    },
  };
}
