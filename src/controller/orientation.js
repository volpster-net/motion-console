import { relativeOrientation, roundOrientation } from './orientation-math.js';

/**
 * Wraps `deviceorientation` events. Stores only the latest reading and never
 * sends anything; sampling for the network happens in orientation-stream.js.
 */
export function createOrientationSensor() {
  /** @type {import('./orientation-math.js').RawOrientation | null} */
  let raw = null;
  /** @type {import('./orientation-math.js').RawOrientation | null} */
  let zero = null;
  let listening = false;

  /** @param {DeviceOrientationEvent} event */
  function onOrientation(event) {
    // Desktop browsers fire a single event with all-null values.
    if (event.alpha == null && event.beta == null && event.gamma == null) return;
    raw = { alpha: event.alpha ?? 0, beta: event.beta ?? 0, gamma: event.gamma ?? 0 };
    zero ??= raw; // the first reading becomes centre
  }

  return {
    /**
     * Starts listening. Must be called synchronously inside a user gesture,
     * because iOS shows its permission prompt from here. (Android needs no
     * prompt, but it does need HTTPS.)
     *
     * @returns {Promise<'granted' | 'denied' | 'unsupported'>}
     */
    start() {
      if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve('unsupported');
      const request =
        typeof DeviceOrientationEvent.requestPermission === 'function'
          ? DeviceOrientationEvent.requestPermission()
          : Promise.resolve('granted');
      return request.then(
        (state) => {
          if (state === 'granted' && !listening) {
            window.addEventListener('deviceorientation', onOrientation);
            listening = true;
          }
          return state === 'granted' ? 'granted' : 'denied';
        },
        () => 'denied',
      );
    },

    /** Makes the current pose the new centre. */
    recenter() {
      zero = raw;
    },

    /** @returns {import('./orientation-math.js').Orientation | null} */
    read() {
      return raw && zero ? roundOrientation(relativeOrientation(raw, zero)) : null;
    },

    get hasData() {
      return raw !== null;
    },
  };
}
