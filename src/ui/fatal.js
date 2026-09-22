/**
 * Replaces the page with an error card. Used when the app can't continue
 * (missing config, can't reach Supabase).
 *
 * @param {{ title: string, message: string }} details
 */
export function renderFatal({ title, message }) {
  const card = document.createElement('div');
  card.className = 'card fatal';

  const heading = document.createElement('h1');
  heading.textContent = title;
  const body = document.createElement('p');
  body.textContent = message;
  const retry = document.createElement('button');
  retry.className = 'btn btn-primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());

  card.append(heading, body, retry);
  const wrap = document.createElement('main');
  wrap.className = 'fatal-wrap';
  wrap.append(card);
  document.body.replaceChildren(wrap);
}
