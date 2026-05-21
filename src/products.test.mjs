import assert from "node:assert/strict";
import test from "node:test";
import {
  filterProductsByStatus,
  normalizeProductStatus,
  parseProductReportSheets,
  PRODUCT_STATUS_FILTERS,
} from "./products.js";

function buildReportRows() {
  return [
    ["Отчёт по товарам"],
    [
      "Артикул",
      "Ozon Product ID",
      "SKU",
      "Barcode",
      "Название товара",
      "Контент-рейтинг",
      "Бренд",
      "Статус товара",
      "Метки",
      "Отзывы",
      "Рейтинг",
      "Причины скрытия",
      "Дата создания",
      "Категория",
      "Тип",
      "Объем товара, л",
      "Объемный вес, кг",
      "Доступно к продаже по схеме FBO, шт.",
      "Зарезервировано, шт",
      "Доступно к продаже по схеме FBS, шт.",
      "Доступно к продаже по схеме realFBS, шт.",
      "Зарезервировано на моих складах, шт",
      "Текущая цена с учетом скидки, ₽",
    ],
    [
      "'п50",
      849338869,
      1400096896,
      "OZN1400096896",
      "Папка регистратор А4 Комус",
      "'87.5",
      "Комус",
      "Продается",
      "",
      39,
      4.9,
      "",
      "2024-01-23 10:12:06",
      "Папки и файлы",
      "Папка",
      4.52,
      0.9,
      0,
      0,
      4,
      0,
      0,
      "850.00",
    ],
    [
      "'п75",
      849536279,
      1400276224,
      "OZN1400276224",
      "Папка 75мм для документов",
      "'87.5",
      "Комус",
      "Готов к продаже",
      "",
      24,
      4.9,
      "",
      "2024-01-23 11:37:25",
      "Папки и файлы",
      "Папка",
      "6,78",
      1.4,
      0,
      0,
      0,
      0,
      0,
      "500,00",
    ],
    [
      "'bad",
      1,
      2,
      "OZN2",
      "Товар без цены",
      "",
      "",
      "Не продается",
      "",
      0,
      0,
      "",
      "",
      "Категория",
      "Тип",
      1.2,
      0.4,
      0,
      0,
      0,
      0,
      0,
      "",
    ],
  ];
}

test("parses Ozon product report with headers on the second row", () => {
  const parsed = parseProductReportSheets({
    Товары: buildReportRows(),
  });

  assert.equal(parsed.meta.sheetName, "Товары");
  assert.equal(parsed.meta.count, 2);
  assert.equal(parsed.products.length, 2);
  assert.deepEqual(parsed.products[0], {
    article: "п50",
    sku: "1400096896",
    barcode: "OZN1400096896",
    name: "Папка регистратор А4 Комус",
    status: "Продается",
    category: "Папки и файлы",
    type: "Папка",
    volumeLiters: 4.52,
    price: 850,
    fbsStock: 4,
  });
  assert.equal(parsed.products[1].volumeLiters, 6.78);
  assert.equal(parsed.products[1].price, 500);
});

test("filters products by Ozon status", () => {
  const products = parseProductReportSheets({
    Товары: [
      ...buildReportRows().slice(0, 4),
      [
        "'off",
        1,
        2,
        "OZN3",
        "Неактивный товар",
        "",
        "",
        "Не продается",
        "",
        0,
        0,
        "",
        "",
        "Категория",
        "Тип",
        2,
        0.4,
        0,
        0,
        0,
        0,
        0,
        200,
      ],
    ],
  }).products;

  assert.equal(normalizeProductStatus("Продается"), PRODUCT_STATUS_FILTERS.SELLING);
  assert.equal(normalizeProductStatus("Готов к продаже"), PRODUCT_STATUS_FILTERS.READY);
  assert.equal(normalizeProductStatus("Не продается"), PRODUCT_STATUS_FILTERS.NOT_SELLING);
  assert.equal(filterProductsByStatus(products, PRODUCT_STATUS_FILTERS.ALL).length, 3);
  assert.equal(filterProductsByStatus(products, PRODUCT_STATUS_FILTERS.ACTIVE).length, 2);
  assert.equal(filterProductsByStatus(products, PRODUCT_STATUS_FILTERS.SELLING).length, 1);
  assert.equal(filterProductsByStatus(products, PRODUCT_STATUS_FILTERS.READY).length, 1);
  assert.equal(filterProductsByStatus(products, PRODUCT_STATUS_FILTERS.NOT_SELLING).length, 1);
});

test("throws helpful errors for invalid product reports", () => {
  assert.throws(
    () => parseProductReportSheets({ Other: [] }),
    /Не найден лист «Товары»/,
  );
  assert.throws(
    () => parseProductReportSheets({ Товары: [["Артикул", "Название товара"]] }),
    /Не найдены нужные колонки/,
  );
});
