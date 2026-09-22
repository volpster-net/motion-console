/**
 * What the launcher menu needs to show this game, kept separate from the
 * game itself so the menu can list every game without downloading them all.
 *
 * @type {import('../game.js').GameMeta}
 */
export default {
  id: 'target-practice',
  name: 'Target Practice',
  description: 'Aim with your phone and hit the rings before they vanish.',
  // Tile picture: a big target with a gold one and a bomb.
  art: `
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <circle cx="68" cy="47" r="30" fill="#f0414f" stroke="#b3343a" stroke-width="2" />
      <circle cx="68" cy="47" r="18" fill="#fff" stroke="#b3343a" stroke-width="2" />
      <circle cx="68" cy="47" r="7.5" fill="#f0414f" stroke="#b3343a" stroke-width="2" />
      <circle cx="120" cy="30" r="13" fill="#f5b700" stroke="#b98900" stroke-width="2" />
      <circle cx="120" cy="30" r="5" fill="#fff4c2" stroke="#b98900" stroke-width="2" />
      <circle cx="122" cy="66" r="11" fill="#2b3440" />
      <path d="M128 57q2-5 6-6" fill="none" stroke="#8a6d3b" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="134" cy="51" r="3" fill="#ff9a1f" />
    </svg>`,
};
