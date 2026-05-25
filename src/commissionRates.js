import { normalizeText, parseProductPrice } from "./tariffs.js";

const DEFAULT_SHEET_NEEDLE = "прайс";
const SUPPORTED_SCHEME = "FBS";

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function normalizeCommissionKey(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function makeProductKey(category, productType) {
  return `${normalizeCommissionKey(category)}|${normalizeCommissionKey(productType)}`;
}

function findSheetName(sheetNames) {
  return sheetNames.find((name) => normalizeText(name).includes(DEFAULT_SHEET_NEEDLE)) ?? sheetNames[0] ?? null;
}

function parseRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const percent = value <= 1 ? value * 100 : value;
  return Number(percent.toFixed(6));
}

function findSchemeRange(row, schemeName) {
  const normalizedScheme = normalizeText(schemeName);
  const start = row.findIndex((cell) => normalizeText(cell) === normalizedScheme);
  if (start < 0) {
    return null;
  }

  let end = row.length;
  for (let index = start + 1; index < row.length; index += 1) {
    if (!isBlank(row[index])) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function parsePriceRange(label) {
  const text = normalizeText(label).replace(/\s+/g, " ");
  const numbers =
    text.match(/\d[\d\s]*(?:[,.]\d+)?/g)?.map((value) => Number(value.replace(/\s/g, "").replace(",", "."))) ?? [];

  if (!numbers.length) {
    return null;
  }

  if (text.startsWith("до")) {
    return {
      label: String(label ?? "").replace(/\s+/g, " ").trim(),
      min: null,
      max: numbers[0],
      minExclusive: false,
      maxInclusive: true,
    };
  }

  if (text.startsWith("свыше") && numbers.length === 1) {
    return {
      label: String(label ?? "").replace(/\s+/g, " ").trim(),
      min: numbers[0],
      max: null,
      minExclusive: true,
      maxInclusive: false,
    };
  }

  if (text.startsWith("свыше") && numbers.length >= 2) {
    return {
      label: String(label ?? "").replace(/\s+/g, " ").trim(),
      min: numbers[0],
      max: numbers[1],
      minExclusive: true,
      maxInclusive: true,
    };
  }

  return null;
}

export function priceInRange(price, range) {
  if (!Number.isFinite(price)) {
    return false;
  }

  const minOk = range.min === null || (range.minExclusive ? price > range.min : price >= range.min);
  const maxOk = range.max === null || (range.maxInclusive ? price <= range.max : price < range.max);
  return minOk && maxOk;
}

export function parseCommissionRateSheets(sheetsByName) {
  const sheetNames = Object.keys(sheetsByName);
  const sheetName = findSheetName(sheetNames);
  const rows = sheetName ? sheetsByName[sheetName] : null;

  if (!rows?.length) {
    throw new Error("Не найден лист с таблицей вознаграждения Ozon.");
  }

  const schemeHeaderRow = rows[0] ?? [];
  const priceHeaderRow = rows[1] ?? [];
  const schemeRange = findSchemeRange(schemeHeaderRow, SUPPORTED_SCHEME);

  if (!schemeRange) {
    throw new Error("В таблице вознаграждения не найден блок FBS.");
  }

  const priceRanges = [];
  for (let columnIndex = schemeRange.start; columnIndex < schemeRange.end; columnIndex += 1) {
    const range = parsePriceRange(priceHeaderRow[columnIndex]);
    if (range) {
      priceRanges.push({ ...range, columnIndex });
    }
  }

  if (!priceRanges.length) {
    throw new Error("В блоке FBS не найдены ценовые диапазоны.");
  }

  const rates = [];
  const duplicates = [];
  const byKey = new Map();

  for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const category = String(row[0] ?? "").trim();
    const productType = String(row[1] ?? "").trim();

    if (!category || !productType) {
      continue;
    }

    const priceRangesWithRates = priceRanges
      .map((range) => ({
        label: range.label,
        min: range.min,
        max: range.max,
        minExclusive: range.minExclusive,
        maxInclusive: range.maxInclusive,
        ratePercent: parseRate(row[range.columnIndex]),
      }))
      .filter((range) => range.ratePercent !== null);

    if (!priceRangesWithRates.length) {
      continue;
    }

    const item = {
      category,
      productType,
      scheme: SUPPORTED_SCHEME,
      priceRanges: priceRangesWithRates,
      sourceRow: rowIndex + 1,
    };
    const key = makeProductKey(category, productType);
    const existing = byKey.get(key);

    if (existing) {
      duplicates.push({ firstRow: existing.sourceRow, duplicateRow: item.sourceRow, category, productType });
    }

    byKey.set(key, [...(existing ? [existing] : []), item].flat());
    rates.push(item);
  }

  if (!rates.length) {
    throw new Error("В таблице вознаграждения не найдено ставок FBS.");
  }

  return {
    rates,
    byKey,
    meta: {
      sheetName,
      count: rates.length,
      duplicateCount: duplicates.length,
      duplicates,
      scheme: SUPPORTED_SCHEME,
    },
  };
}

function rangesAreEqual(left, right) {
  if (left.priceRanges.length !== right.priceRanges.length) {
    return false;
  }

  return left.priceRanges.every((range, index) => {
    const other = right.priceRanges[index];
    return (
      range.label === other.label &&
      range.min === other.min &&
      range.max === other.max &&
      range.ratePercent === other.ratePercent
    );
  });
}

export function findCommissionRate({ commissionRates, category, productType, productPrice }) {
  const normalizedProductPrice = parseProductPrice(productPrice);

  if (!commissionRates?.byKey) {
    return {
      status: "missing-file",
      message: "Загрузите таблицу вознаграждения Ozon или введите комиссию вручную.",
    };
  }

  if (!category || !productType) {
    return {
      status: "not-found",
      message: "Для автопоиска комиссии нужен товар с категорией и типом.",
    };
  }

  if (normalizedProductPrice === null) {
    return {
      status: "not-found",
      message: "Для автопоиска комиссии нужна цена продажи.",
    };
  }

  const matches = commissionRates.byKey.get(makeProductKey(category, productType)) ?? [];

  if (!matches.length) {
    return {
      status: "not-found",
      message: "Ставка не найдена по категории и типу товара, введите комиссию вручную.",
    };
  }

  const first = matches[0];
  const allSame = matches.every((match) => rangesAreEqual(first, match));

  if (!allSame) {
    return {
      status: "ambiguous",
      message: "Найдено несколько разных ставок, оставьте ручное значение.",
      matchedCategory: category,
      matchedType: productType,
    };
  }

  const priceRange = first.priceRanges.find((range) => priceInRange(normalizedProductPrice, range));

  if (!priceRange) {
    return {
      status: "not-found",
      message: "Для этой цены не найден диапазон ставки FBS.",
      matchedCategory: first.category,
      matchedType: first.productType,
      sourceRow: first.sourceRow,
    };
  }

  return {
    status: "found",
    message: `Ставка найдена в таблице Ozon: FBS, ${priceRange.label}`,
    ratePercent: priceRange.ratePercent,
    matchedCategory: first.category,
    matchedType: first.productType,
    priceRangeLabel: priceRange.label,
    sourceRow: first.sourceRow,
  };
}
