import { parseMoney } from "./tariffs.js";

export const LOGISTICS_MODES = {
  MIN: "min",
  AVERAGE: "average",
  MAX: "max",
  MANUAL: "manual",
};

const FIELD_LABELS = {
  salePrice: "цена продажи",
  cost: "себестоимость",
  commissionPercent: "комиссия Ozon",
  acquiringPercent: "эквайринг",
  processing: "обработка отправления",
  logistics: "логистика",
  destinationDelivery: "доставка до места выдачи",
  packaging: "упаковка",
  advertising: "реклама",
  taxPercent: "налог",
  otherExpenses: "прочие расходы",
};

function parseOptionalAmount(value) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  const amount = parseMoney(value);
  return amount !== null && amount >= 0 ? amount : null;
}

function parseRequiredAmount(value) {
  const amount = parseMoney(value);
  return amount !== null && amount > 0 ? amount : null;
}

export function makeEmptyUnitEconomicsInputs() {
  return {
    salePrice: "",
    cost: "",
    commissionPercent: "",
    acquiringPercent: "",
    processing: "",
    logistics: "",
    destinationDelivery: "",
    packaging: "",
    advertising: "",
    taxPercent: "",
    otherExpenses: "",
    logisticsMode: LOGISTICS_MODES.MANUAL,
  };
}

export function calculateUnitEconomics(inputs) {
  const salePrice = parseRequiredAmount(inputs.salePrice);
  if (salePrice === null) {
    return {
      status: "empty",
      message: "Введите цену продажи.",
    };
  }

  const parsed = {
    salePrice,
    cost: parseOptionalAmount(inputs.cost),
    commissionPercent: parseOptionalAmount(inputs.commissionPercent),
    acquiringPercent: parseOptionalAmount(inputs.acquiringPercent),
    processing: parseOptionalAmount(inputs.processing),
    logistics: parseOptionalAmount(inputs.logistics),
    destinationDelivery: parseOptionalAmount(inputs.destinationDelivery),
    packaging: parseOptionalAmount(inputs.packaging),
    advertising: parseOptionalAmount(inputs.advertising),
    taxPercent: parseOptionalAmount(inputs.taxPercent),
    otherExpenses: parseOptionalAmount(inputs.otherExpenses),
  };

  const invalidFields = Object.entries(parsed)
    .filter(([, value]) => value === null)
    .map(([key]) => FIELD_LABELS[key] ?? key);

  if (invalidFields.length) {
    return {
      status: "error",
      message: `Проверьте поля: ${invalidFields.join(", ")}.`,
    };
  }

  const commission = (parsed.salePrice * parsed.commissionPercent) / 100;
  const acquiring = (parsed.salePrice * parsed.acquiringPercent) / 100;
  const tax = (parsed.salePrice * parsed.taxPercent) / 100;
  const fixedExpenses =
    parsed.cost +
    parsed.processing +
    parsed.logistics +
    parsed.destinationDelivery +
    parsed.packaging +
    parsed.advertising +
    parsed.otherExpenses;
  const totalExpenses = fixedExpenses + commission + acquiring + tax;
  const profit = parsed.salePrice - totalExpenses;
  const marginPercent = (profit / parsed.salePrice) * 100;
  const roiPercent = parsed.cost > 0 ? (profit / parsed.cost) * 100 : null;

  return {
    status: "ok",
    values: parsed,
    expenses: {
      cost: parsed.cost,
      commission,
      acquiring,
      processing: parsed.processing,
      logistics: parsed.logistics,
      destinationDelivery: parsed.destinationDelivery,
      packaging: parsed.packaging,
      advertising: parsed.advertising,
      tax,
      otherExpenses: parsed.otherExpenses,
      total: totalExpenses,
    },
    profit,
    marginPercent,
    roiPercent,
  };
}
