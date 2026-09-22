/** A number with an explicit sign, e.g. "+12.3" or "−0.5". */
export function formatSigned(value, digits = 1) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ' ';
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}
