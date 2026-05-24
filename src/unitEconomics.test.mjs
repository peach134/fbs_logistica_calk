import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateUnitEconomics, LOGISTICS_MODES, makeEmptyUnitEconomicsInputs } from "./unitEconomics.js";

test("calculates unit economics from manual expenses", () => {
  const result = calculateUnitEconomics({
    salePrice: "1000",
    cost: "400",
    commissionPercent: "15",
    acquiringPercent: "1,5",
    processing: "30",
    logistics: "100",
    destinationDelivery: "25",
    packaging: "20",
    advertising: "50",
    taxPercent: "6",
    otherExpenses: "10",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.expenses.commission, 150);
  assert.equal(result.expenses.acquiring, 15);
  assert.equal(result.expenses.tax, 60);
  assert.equal(result.expenses.total, 860);
  assert.equal(result.profit, 140);
  assert.equal(Number(result.marginPercent.toFixed(2)), 14);
  assert.equal(result.roiPercent, 35);
});

test("treats blank optional expenses as zero", () => {
  const result = calculateUnitEconomics({
    ...makeEmptyUnitEconomicsInputs(),
    salePrice: "850",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.expenses.total, 0);
  assert.equal(result.profit, 850);
  assert.equal(result.roiPercent, null);
});

test("requires positive sale price and rejects invalid optional fields", () => {
  assert.equal(calculateUnitEconomics(makeEmptyUnitEconomicsInputs()).status, "empty");

  const invalid = calculateUnitEconomics({
    ...makeEmptyUnitEconomicsInputs(),
    salePrice: "1000",
    logisticsMode: LOGISTICS_MODES.MANUAL,
    logistics: "abc",
  });

  assert.equal(invalid.status, "error");
  assert.match(invalid.message, /логистика/);
});
