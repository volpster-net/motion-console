/**
 * What the launcher menu needs to show this game, kept separate from the
 * game itself so the menu can list every game without downloading them all.
 *
 * @type {import('../game.js').GameMeta}
 */
export default {
  id: 'basketball',
  name: 'Hoops',
  description: 'Line up the rim and flick your phone to shoot. Swishes score extra.',
  // Tile picture: a backboard, rim, and net, with a ball on its way in.
  art: `
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <rect x="0" y="62" width="160" height="28" fill="#e9c48f" />
      <path d="M0 62h160" stroke="#d2a86d" stroke-width="2" />
      <rect x="52" y="10" width="56" height="38" rx="3" fill="#fff" stroke="#9aa6b2" stroke-width="2" />
      <rect x="69" y="24" width="22" height="16" fill="none" stroke="#f0414f" stroke-width="2" />
      <path d="M64 44l6 16h20l6-16" fill="none" stroke="#c9d1da" stroke-width="1.5" />
      <path d="M68 44l6 16M80 44v16M92 44l-6 16" fill="none" stroke="#c9d1da" stroke-width="1.5" />
      <ellipse cx="80" cy="44" rx="17" ry="4" fill="none" stroke="#f26b1d" stroke-width="3" />
      <circle cx="120" cy="30" r="11" fill="#f28a2e" stroke="#b85a14" stroke-width="1.5" />
      <path d="M109 30h22M120 19v22" stroke="#b85a14" stroke-width="1.2" />
      <path d="M112 22q8 8 0 16M128 22q-8 8 0 16" fill="none" stroke="#b85a14" stroke-width="1.2" />
      <path d="M130 44q10 8 18 4" fill="none" stroke="#b9c2cc" stroke-width="2" stroke-dasharray="3 4" />
    </svg>`,
};
