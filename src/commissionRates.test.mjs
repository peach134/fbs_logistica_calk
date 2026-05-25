import assert from "node:assert/strict";
import test from "node:test";
import {
  findCommissionRate,
  normalizeCommissionKey,
  parseCommissionRateSheets,
  priceInRange,
} from "./commissionRates.js";

function buildCommissionRows(extraRows = []) {
  return [
    [null, null, "FBO", null, null, null, null, null, "FBO Fresh", null, null, null, null, null, "FBS", null, null, null, null, null],
    [
      "Категория",
      "Тип товара",
      "до 100 руб.",
      "свыше 100 до 300 руб.",
      "свыше 300 до 1500 руб.",
      "свыше 1500 до 5000 руб.",
      "свыше 5000 до 10 000 руб.",
      "свыше 10 000 руб.",
      "до 100 руб.",
      "свыше 100 до 300 руб.",
      "свыше 300 до 1500 руб.",
      "свыше 1500 до 5000 руб.",
      "свыше 5000 до 10 000 руб.",
      "свыше 10 000 руб.",
      "до 100 руб.",
      "свыше 100 до 300 руб.",
      "свыше 300 до 1500 руб.",
      "свыше 1500 до 5000 руб.",
      "свыше 5000 до 10 000 руб.",
      "свыше 10 000 руб.",
    ],
    [
      "Папки и файлы",
      "Папка",
      0.01,
      0.02,
      0.03,
      0.04,
      0.05,
      0.06,
      0.07,
      0.08,
      0.09,
      0.1,
      0.11,
      0.12,
      0.14,
      0.2,
      0.46,
      0.47,
      0.48,
      0.49,
    ],
    ...extraRows,
  ];
}

test("parses FBS commission rates from the Ozon table", () => {
  const parsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows(),
  });

  assert.equal(parsed.meta.sheetName, "Прайс РФ (БЗ)");
  assert.equal(parsed.meta.count, 1);
  assert.equal(parsed.rates[0].scheme, "FBS");
  assert.equal(parsed.rates[0].sourceRow, 3);
  assert.equal(parsed.rates[0].priceRanges.length, 6);
  assert.equal(parsed.rates[0].priceRanges[0].ratePercent, 14);
  assert.equal(parsed.rates[0].priceRanges[2].ratePercent, 46);
});

test("matches price boundaries for FBS ranges", () => {
  const parsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows(),
  });
  const ranges = parsed.rates[0].priceRanges;

  assert.equal(priceInRange(100, ranges[0]), true);
  assert.equal(priceInRange(100.01, ranges[1]), true);
  assert.equal(priceInRange(300, ranges[1]), true);
  assert.equal(priceInRange(300.01, ranges[2]), true);
  assert.equal(priceInRange(1500, ranges[2]), true);
  assert.equal(priceInRange(1500.01, ranges[3]), true);
  assert.equal(priceInRange(5000.01, ranges[4]), true);
  assert.equal(priceInRange(10000.01, ranges[5]), true);
});

test("finds commission by exact normalized category, product type, and price", () => {
  const parsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows(),
  });
  const result = findCommissionRate({
    commissionRates: parsed,
    category: "  папки   и файлы ",
    productType: "папка",
    productPrice: "850",
  });

  assert.equal(normalizeCommissionKey("Ёлки  новогодние"), "елки новогодние");
  assert.equal(result.status, "found");
  assert.equal(result.ratePercent, 46);
  assert.equal(result.priceRangeLabel, "свыше 300 до 1500 руб.");
});

test("does not guess when only category or type matches", () => {
  const parsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows(),
  });

  assert.equal(
    findCommissionRate({
      commissionRates: parsed,
      category: "Папки и файлы",
      productType: "Другой тип",
      productPrice: 850,
    }).status,
    "not-found",
  );
});

test("allows duplicated rows only when their rates are identical", () => {
  const sameDuplicate = [
    "Папки и файлы",
    "Папка",
    0.01,
    0.02,
    0.03,
    0.04,
    0.05,
    0.06,
    0.07,
    0.08,
    0.09,
    0.1,
    0.11,
    0.12,
    0.14,
    0.2,
    0.46,
    0.47,
    0.48,
    0.49,
  ];
  const differentDuplicate = [...sameDuplicate];
  differentDuplicate[16] = 0.41;

  const sameParsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows([sameDuplicate]),
  });
  assert.equal(
    findCommissionRate({
      commissionRates: sameParsed,
      category: "Папки и файлы",
      productType: "Папка",
      productPrice: 850,
    }).status,
    "found",
  );

  const differentParsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows([differentDuplicate]),
  });
  assert.equal(
    findCommissionRate({
      commissionRates: differentParsed,
      category: "Папки и файлы",
      productType: "Папка",
      productPrice: 850,
    }).status,
    "ambiguous",
  );
});

test("returns clear statuses for missing file, product, or price", () => {
  assert.equal(
    findCommissionRate({
      commissionRates: null,
      category: "Папки и файлы",
      productType: "Папка",
      productPrice: 850,
    }).status,
    "missing-file",
  );

  const parsed = parseCommissionRateSheets({
    "Прайс РФ (БЗ)": buildCommissionRows(),
  });
  assert.equal(
    findCommissionRate({
      commissionRates: parsed,
      category: "",
      productType: "Папка",
      productPrice: 850,
    }).status,
    "not-found",
  );
  assert.equal(
    findCommissionRate({
      commissionRates: parsed,
      category: "Папки и файлы",
      productType: "Папка",
      productPrice: "",
    }).status,
    "not-found",
  );
});
