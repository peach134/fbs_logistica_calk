import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLogistics,
  calculateVolumeLiters,
  findUniversalPrice,
  parseMoney,
  parseProductPrice,
  parseTariffSheets,
  parseVolumeRange,
  volumeMatches,
} from "./tariffs.js";

test("parses Ozon volume ranges", () => {
  assert.deepEqual(parseVolumeRange("5,001-6 л"), { volumeMin: 5.001, volumeMax: 6 });
  assert.deepEqual(parseVolumeRange("6,001-7 л"), { volumeMin: 6.001, volumeMax: 7 });
  assert.deepEqual(parseVolumeRange("От 800,001 л"), { volumeMin: 800.001, volumeMax: null });
});

test("parses tariff prices with comma and dot decimals", () => {
  assert.equal(parseMoney("17,28 руб."), 17.28);
  assert.equal(parseMoney("17.28"), 17.28);
  assert.equal(parseMoney("—"), null);
  assert.equal(parseProductPrice(""), null);
});

test("matches volume by inclusive range bounds", () => {
  assert.equal(volumeMatches(parseVolumeRange("5,001-6 л"), 6), true);
  assert.equal(volumeMatches(parseVolumeRange("5,001-6 л"), 6.01), false);
  assert.equal(volumeMatches(parseVolumeRange("6,001-7 л"), 6.01), true);
  assert.equal(volumeMatches(parseVolumeRange("От 800,001 л"), 800.5), true);
});

test("calculates volume in liters from centimeters", () => {
  assert.equal(calculateVolumeLiters({ length: 10, width: 10, height: 60 }), 6);
  assert.equal(calculateVolumeLiters({ length: 10, width: 10, height: 60.1 }), 6.01);
});

test("parses fixed Ozon sheets and chooses tariff by product price", () => {
  const parsed = parseTariffSheets({
    "Логистика РФ": [
      [],
      [null, null, null, null, "Тариф, рублей с НДС"],
      [
        null,
        "Объём товара",
        "Кластер отправления",
        "Кластер доставки",
        "Для товаров до 300 руб.",
        "Для товаров свыше 300 руб.",
      ],
      [null, "5,001-6 л", "Воронеж", "Казань", 100, 250],
      [null, "5,001-6 л", "Воронеж", "Москва", 120, 280],
    ],
    "Тарифы по умолчанию": [
      [],
      [null, null, "Тариф, рублей с НДС"],
      [null, "Объём товара", "Для товаров до 300 руб.", "Для товаров свыше 300 руб."],
      [null, "5,001-6 л", 90, 200],
    ],
  });

  const under = calculateLogistics({
    ...parsed,
    productPrice: 300,
    volume: 6,
    sourceCluster: "Воронеж",
  });
  assert.equal(under.status, "ok");
  assert.equal(under.usedDefault, false);
  assert.equal(under.stats.min, 100);
  assert.equal(under.stats.max, 120);
  assert.equal(under.universalPrice, 90);
  assert.equal(under.rows[0].universalPrice, 90);

  const over = calculateLogistics({
    ...parsed,
    productPrice: 300.01,
    volume: 6,
    sourceCluster: "Воронеж",
  });
  assert.equal(over.status, "ok");
  assert.equal(over.stats.min, 250);
  assert.equal(over.stats.max, 280);
  assert.equal(over.universalPrice, 200);
  assert.equal(over.rows[0].universalPrice, 200);

  const cheap = calculateLogistics({
    ...parsed,
    productPrice: 222,
    volume: 6,
    sourceCluster: "Воронеж",
  });
  assert.equal(cheap.stats.min, 100);

  const expensive = calculateLogistics({
    ...parsed,
    productPrice: 2222,
    volume: 6,
    sourceCluster: "Воронеж",
  });
  assert.equal(expensive.stats.min, 250);
});

test("finds universal tariff by volume and product price", () => {
  const defaultTariffs = [
    {
      sourceCluster: "Тариф по умолчанию",
      destination: "Тариф по умолчанию",
      volumeLabel: "6,001-7 л",
      volumeMin: 6.001,
      volumeMax: 7,
      priceUnder300: 57.95,
      priceOver300: 99,
    },
    {
      sourceCluster: "Тариф по умолчанию",
      destination: "Тариф по умолчанию",
      volumeLabel: "10,001-11 л",
      volumeMin: 10.001,
      volumeMax: 11,
      priceUnder300: 79.3,
      priceOver300: 102,
    },
  ];

  assert.equal(findUniversalPrice(defaultTariffs, 6.5, 222), 57.95);
  assert.equal(findUniversalPrice(defaultTariffs, 6.5, 2222), 99);
  assert.equal(findUniversalPrice(defaultTariffs, 10.648, 222), 79.3);
  assert.equal(findUniversalPrice(defaultTariffs, 10.648, 2222), 102);
  assert.equal(findUniversalPrice(defaultTariffs, 12, 2222), null);
});

test("does not calculate when product price is blank", () => {
  const result = calculateLogistics({
    tariffs: [],
    defaultTariffs: [],
    productPrice: "",
    volume: 6,
    sourceCluster: "Воронеж",
  });

  assert.equal(result.status, "empty");
  assert.equal(result.message, "Введите цену товара.");
});

test("falls back to default tariffs when route tariff is unavailable", () => {
  const parsed = parseTariffSheets({
    "Логистика РФ": [
      [],
      [],
      [
        null,
        "Объём товара",
        "Кластер отправления",
        "Кластер доставки",
        "Для товаров до 300 руб.",
        "Для товаров свыше 300 руб.",
      ],
      [null, "5,001-6 л", "Воронеж", "Казань", 100, 250],
    ],
    "Тарифы по умолчанию": [
      [],
      [],
      [null, "Объём товара", "Для товаров до 300 руб.", "Для товаров свыше 300 руб."],
      [null, "5,001-6 л", 90, 200],
    ],
  });

  const result = calculateLogistics({
    ...parsed,
    productPrice: 500,
    volume: 6,
    sourceCluster: "Неизвестный кластер",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.usedDefault, true);
  assert.equal(result.stats.min, 200);
});
