import { normalizeText, parseMoney } from "./tariffs.js";

const PRODUCTS_SHEET = "Товары";

const PRODUCT_HEADER_ALIASES = {
  article: ["артикул"],
  sku: ["sku"],
  barcode: ["barcode", "штрихкод"],
  name: ["название товара"],
  status: ["статус товара"],
  category: ["категория"],
  type: ["тип"],
  volumeLiters: ["объем товара, л", "объём товара, л", "объем товара л", "объём товара л"],
  price: ["текущая цена с учетом скидки", "текущая цена с учётом скидки"],
  fbsStock: ["доступно к продаже по схеме fbs"],
};

export const PRODUCT_STATUS_FILTERS = {
  ACTIVE: "active",
  ALL: "all",
  SELLING: "selling",
  READY: "ready",
  NOT_SELLING: "not-selling",
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanArticle(value) {
  return cleanText(value).replace(/^'+/, "");
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const number = Number.parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
  const number = parseNumber(value);
  return number === null ? null : Math.trunc(number);
}

function findSheetName(sheetNames) {
  if (sheetNames.includes(PRODUCTS_SHEET)) {
    return PRODUCTS_SHEET;
  }

  return sheetNames.find((name) => normalizeText(name).includes("товары")) ?? null;
}

function headerMatches(cell, key) {
  const header = normalizeText(cell);
  return PRODUCT_HEADER_ALIASES[key].some((alias) => header.includes(normalizeText(alias)));
}

function findHeaderMap(rows) {
  const requiredKeys = ["article", "name", "volumeLiters", "price"];

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const map = {};

    row.forEach((cell, columnIndex) => {
      Object.keys(PRODUCT_HEADER_ALIASES).forEach((key) => {
        if (map[key] === undefined && headerMatches(cell, key)) {
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

function parseProductRow(row, map) {
  const volumeLiters = parseNumber(row[map.volumeLiters]);
  const price = parseMoney(row[map.price]);

  if (volumeLiters === null || volumeLiters <= 0 || price === null || price < 0) {
    return null;
  }

  const name = cleanText(row[map.name]);
  if (!name) {
    return null;
  }

  return {
    article: cleanArticle(row[map.article]),
    sku: cleanText(row[map.sku]),
    barcode: cleanText(row[map.barcode]),
    name,
    status: cleanText(row[map.status]),
    category: cleanText(row[map.category]),
    type: cleanText(row[map.type]),
    volumeLiters,
    price,
    fbsStock: parseInteger(row[map.fbsStock]),
  };
}

export function normalizeProductStatus(status) {
  const text = normalizeText(status);

  if (text === "продается" || text === "продаётся") {
    return PRODUCT_STATUS_FILTERS.SELLING;
  }

  if (text === "готов к продаже") {
    return PRODUCT_STATUS_FILTERS.READY;
  }

  if (text === "не продается" || text === "не продаётся") {
    return PRODUCT_STATUS_FILTERS.NOT_SELLING;
  }

  return "other";
}

export function filterProductsByStatus(products, filter) {
  if (filter === PRODUCT_STATUS_FILTERS.ALL) {
    return products;
  }

  return products.filter((product) => {
    const status = normalizeProductStatus(product.status);

    if (filter === PRODUCT_STATUS_FILTERS.ACTIVE) {
      return status === PRODUCT_STATUS_FILTERS.SELLING || status === PRODUCT_STATUS_FILTERS.READY;
    }

    return status === filter;
  });
}

export function parseProductReportSheets(sheetsByName) {
  const sheetNames = Object.keys(sheetsByName);
  const sheetName = findSheetName(sheetNames);
  const rows = sheetName ? sheetsByName[sheetName] : null;

  if (!rows?.length) {
    throw new Error("Не найден лист «Товары» с отчётом по товарам.");
  }

  const header = findHeaderMap(rows);
  if (!header) {
    throw new Error("Не найдены нужные колонки отчёта товаров: артикул, название, объём и текущая цена.");
  }

  const products = rows
    .slice(header.rowIndex + 1)
    .map((row) => parseProductRow(row, header.map))
    .filter(Boolean);

  if (!products.length) {
    throw new Error("В отчёте товаров нет строк с валидной ценой и объёмом.");
  }

  return {
    products,
    meta: {
      sheetName,
      count: products.length,
    },
  };
}
