import React from "react";

const MINIMUM_LARGE_NUMBER = 1_000_000;
const MINIMUM_MEDIUM_NUMBER = 100;
const MINIMUM_SMALL_NUMBER = 1;

const decimalNativeFormatter = new Intl.NumberFormat("en-US", {
  minimumSignificantDigits: 1,
  maximumSignificantDigits: 3,
}).format;

const largeNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 4,
}).format;

const mediumNumberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format;

const smallNumberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
}).format;

const getNumber = (numericValue: number) => {
  const numericAbs = Math.abs(numericValue);

  if (numericAbs >= MINIMUM_LARGE_NUMBER) {
    return largeNumberFormatter(numericValue);
  }
  if (numericAbs >= MINIMUM_MEDIUM_NUMBER) {
    return mediumNumberFormatter(numericValue);
  }
  if (numericAbs >= MINIMUM_SMALL_NUMBER) {
    return smallNumberFormatter(numericValue);
  }
  return decimalNativeFormatter(numericValue);
};

export const formatCoin = (
  value: number | string | undefined | null
): string | undefined => {
  if (!value || Number(value) === 0) {
    return undefined;
  }

  const numericValue = Number(value);

  return getNumber(numericValue);
};
