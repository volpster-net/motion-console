/**
 * Wraps `devicemotion` events. The phone stays "dumb": it passes on the
 * gyroscope's raw rotation rate with a timestamp, and the console does all
 * the aiming maths (see src/aim).
 */

/**
 * @typedef {import('../aim/aim-tracker.js').MotionSample} MotionSample
 */

export function createMotionSensor() {
  /** @type {MotionSample | null} */
  let latest = null;
  /** @type {Set<(sample: MotionSample) => void>} */
  const listeners = new Set();
  let listening = false;

  /** @param {DeviceMotionEvent} event */
  function onMotion(event) {
    const rate = event.rotationRate;
    // Devices without a gyroscope (and desktop browsers) send null rates.
    if (!rate || (rate.alpha == null && rate.beta == null && rate.gamma == null)) return;
    latest = {
      alpha: rate.alpha ?? 0,
      beta: rate.beta ?? 0,
      gamma: rate.gamma ?? 0,
      // When the sensor reading happened, in ms since the page loaded.
      t: event.timeStamp,
    };
    for (const fn of listeners) fn(latest);
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
      if (typeof DeviceMotionEvent === 'undefined') return Promise.resolve('unsupported');
      const request =
        typeof DeviceMotionEvent.requestPermission === 'function'
          ? DeviceMotionEvent.requestPermission()
          : Promise.resolve('granted');
      return request.then(
        (state) => {
          if (state === 'granted' && !listening) {
            window.addEventListener('devicemotion', onMotion);
            listening = true;
          }
          return state === 'granted' ? 'granted' : 'denied';
        },
        () => 'denied',
      );
    },

    /**
     * Calls `fn` with every new reading.
     *
     * @param {(sample: MotionSample) => void} fn
     * @returns {() => void} unsubscribe
     */
    onSample(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** @returns {MotionSample | null} the latest reading */
    read() {
      return latest;
    },

    get hasData() {
      return latest !== null;
    },
  };
}
