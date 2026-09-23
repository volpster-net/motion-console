/**
 * A hidden panel for tuning the shooting motion (press D during Hoops).
 *
 * It graphs the last few seconds of the three things the shot detector
 * watches, with its thresholds drawn as dashed lines:
 *
 *   Tilt   how far the top edge points up      (set when above "set")
 *   Push   how hard the arm pushes upwards      (push starts above "push")
 *   Snap   how fast the wrist flicks forwards   (release above "snap")
 *
 * Coloured markers show when the detector saw a set, push, shot, or fizzle.
 * Make a few real shots, look where your lines peak, and move the matching
 * numbers in CONFIG.shot so the thresholds sit comfortably below them.
 */

/** How much history the graph shows. */
const WINDOW_MS = 3000;

const LANES = [
  { key: 'tilt', label: 'Tilt', unit: '°', min: -30, max: 90, color: '#1f9bf0' },
  { key: 'lift', label: 'Push', unit: ' m/s²', min: -10, max: 30, color: '#23b566' },
  { key: 'snap', label: 'Snap', unit: '°/s', min: -200, max: 1000, color: '#f26b1d' },
];

const MARKER_COLORS = {
  set: '#23b566',
  unset: '#98a3af',
  push: '#1f9bf0',
  shot: '#f26b1d',
  fizzle: '#e5484d',
};

/**
 * @param {{ root: HTMLElement, config: typeof import('./index.js').CONFIG['shot'], key?: string }} options
 */
export function createShotTuning({ root, config, key = 'd' }) {
  const panel = document.createElement('aside');
  panel.className = 'bb-tuning';
  panel.hidden = true;
  panel.innerHTML = `
    <header><b>Shot tuning</b><kbd>${key.toUpperCase()}</kbd></header>
    <canvas></canvas>
    <p class="bb-tuning-last">Make a shot to see its numbers.</p>`;
  root.append(panel);
  const canvas = /** @type {HTMLCanvasElement} */ (panel.querySelector('canvas'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const last = /** @type {HTMLElement} */ (panel.querySelector('.bb-tuning-last'));

  /** @type {Array<{ t: number, tilt: number, lift: number, snap: number }>} */
  let samples = [];
  /** @type {Array<{ t: number, type: string }>} */
  let markers = [];

  const thresholds = {
    tilt: [
      { value: config.setTilt, label: 'set' },
      { value: config.unsetTilt, label: 'unset' },
    ],
    lift: [{ value: config.pushStart, label: 'push' }],
    snap: [{ value: config.snapRate, label: 'snap' }],
  };

  function onKey(event) {
    if (event.key.toLowerCase() !== key || event.ctrlKey || event.metaKey || event.altKey) return;
    panel.hidden = !panel.hidden;
  }
  window.addEventListener('keydown', onKey);

  function draw() {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const newest = samples.at(-1)?.t ?? 0;
    const xAt = (t) => width - ((newest - t) / WINDOW_MS) * width;
    const laneHeight = height / LANES.length;

    LANES.forEach((lane, i) => {
      const top = i * laneHeight;
      const yAt = (value) => {
        const clamped = Math.min(lane.max, Math.max(lane.min, value));
        return (
          top + laneHeight - 4 - ((clamped - lane.min) / (lane.max - lane.min)) * (laneHeight - 8)
        );
      };
      // Lane background and label.
      ctx.fillStyle = i % 2 ? '#f6f8fa' : '#ffffff';
      ctx.fillRect(0, top, width, laneHeight);
      ctx.font = '700 11px Nunito, system-ui, sans-serif';
      ctx.fillStyle = lane.color;
      const current = samples.at(-1)?.[lane.key];
      ctx.fillText(
        `${lane.label} ${current === undefined ? '–' : Math.round(current)}${lane.unit}`,
        6,
        top + 13,
      );

      // Dashed threshold lines.
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      for (const threshold of thresholds[lane.key]) {
        const y = yAt(threshold.value);
        ctx.strokeStyle = '#98a3af';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillStyle = '#98a3af';
        ctx.fillText(threshold.label, width - 34, y - 3);
      }
      ctx.setLineDash([]);

      // The live trace.
      ctx.strokeStyle = lane.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((sample, j) => {
        const x = xAt(sample.t);
        const y = yAt(sample[lane.key]);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Event markers, across all lanes.
    for (const marker of markers) {
      const x = xAt(marker.t);
      ctx.strokeStyle = MARKER_COLORS[marker.type] ?? '#1d2733';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  return {
    /** Adds a motion sample to the graph. */
    record(sample) {
      samples.push(sample);
      const oldest = sample.t - WINDOW_MS;
      if (samples[0].t < oldest || sample.t < samples[0].t) {
        samples = samples.filter((s) => s.t >= oldest && s.t <= sample.t);
      }
      markers = markers.filter((m) => m.t >= oldest && m.t <= sample.t);
    },

    /** Marks a detector event on the graph. */
    mark(event) {
      markers.push({ t: event.t, type: event.type });
      if (event.type === 'fizzle') {
        last.textContent = `Fizzled: no ${event.missing === 'push' ? 'arm push' : 'wrist snap'}.`;
      }
    },

    /** Describes the last shot under the graph. */
    describeShot(event, norm) {
      last.textContent = `Last shot: push ${event.push.toFixed(1)} m/s² (power ${Math.round(
        norm * 100,
      )}%), snap ${Math.round(event.snap)}°/s.`;
    },

    /** Called every frame; redraws only while the panel is open. */
    draw() {
      if (!panel.hidden) draw();
    },

    destroy() {
      window.removeEventListener('keydown', onKey);
      panel.remove();
    },
  };
}
