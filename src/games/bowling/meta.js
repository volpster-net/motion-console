/**
 * What the launcher menu needs to show this game, kept separate from the
 * game itself so the menu can list every game without downloading them all.
 *
 * @type {import('../game.js').GameMeta}
 */
export default {
  id: 'bowling',
  name: 'Bowling',
  description: 'Hold A, swing underhand, and let go to roll. Twist your wrist to hook it.',
  // Tile picture: a lane running away to a rack of pins, with a ball on its way.
  art: `
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <rect width="160" height="90" fill="#1d2233" />
      <path d="M58 90L74 22h12l16 68z" fill="#e0b77c" />
      <path d="M58 90L74 22M102 90L86 22" stroke="#8a929c" stroke-width="3" />
      <path d="M70 62l2-5 2 5zM79 62l1-5 1 5zM86 62l2-5 2 5z" fill="#5a3a20" />
      <rect x="40" y="6" width="80" height="12" rx="2" fill="#2a57c4" />
      <g fill="#fbfbf8" stroke="#c9ced6" stroke-width="0.6">
        <ellipse cx="80" cy="34" rx="2.2" ry="5" />
        <ellipse cx="76.5" cy="31" rx="2" ry="4.6" /><ellipse cx="83.5" cy="31" rx="2" ry="4.6" />
        <ellipse cx="73" cy="28" rx="1.9" ry="4.3" /><ellipse cx="80" cy="28" rx="1.9" ry="4.3" /><ellipse cx="87" cy="28" rx="1.9" ry="4.3" />
      </g>
      <path d="M78.3 31.5h3.4M74.8 28.5h3.4M81.8 28.5h3.4" stroke="#d8262f" stroke-width="0.8" />
      <circle cx="86" cy="74" r="10" fill="#6c3bd1" />
      <circle cx="83" cy="70" r="1.4" fill="#111" /><circle cx="88" cy="70" r="1.4" fill="#111" /><circle cx="85.5" cy="75" r="1.7" fill="#111" />
      <path d="M96 80q14-14 4-30" fill="none" stroke="#b9c2cc" stroke-width="2" stroke-dasharray="3 4" />
    </svg>`,
};
