/**
 * What the launcher menu needs to show this game, kept separate from the
 * game itself so the menu can list every game without downloading them all.
 *
 * @type {import('../game.js').GameMeta}
 */
export default {
  id: 'baseball',
  name: 'Home Run Derby',
  description: 'Grip your phone like a bat and swing when the pitch arrives. Timing is everything.',
  // Tile picture: a ball flying off over the outfield fence.
  art: `
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <rect width="160" height="90" fill="#bfe3f7" />
      <rect y="40" width="160" height="12" fill="#5b6b7d" />
      <rect y="50" width="160" height="7" fill="#1f6b45" />
      <path d="M0 50h160" stroke="#f2c200" stroke-width="2" />
      <rect y="57" width="160" height="33" fill="#5fb150" />
      <path d="M40 90l40-26 40 26z" fill="#c98f55" />
      <path d="M60 90l20-13 20 13z" fill="#6fbf5a" />
      <path d="M30 84q50-80 102-58" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 5" />
      <circle cx="132" cy="26" r="7" fill="#fff" stroke="#d9dee4" />
      <path d="M128 21q3 5 0 10M136 21q-3 5 0 10" fill="none" stroke="#e5484d" stroke-width="1.3" />
    </svg>`,
};
