/** @param {number} deg */
export function formatDegrees(deg) {
  const sign = deg > 0 ? '+' : deg < 0 ? '−' : ' ';
  return `${sign}${Math.abs(deg).toFixed(1)}°`;
}
