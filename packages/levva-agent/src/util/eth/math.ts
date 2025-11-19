export function formatDecimalToPercentage(percentage: number): string {
  const formatted = (percentage * 100).toFixed(2);
  return `${Number(formatted)}%`;
}
