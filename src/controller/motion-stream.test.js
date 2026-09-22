import { describe, expect, it, vi } from 'vitest';
import { INPUT, NS } from '../core/protocol.js';
import { startMotionStream } from './motion-stream.js';

function setup({ hz = 60, connected = true } = {}) {
  /** @type {((sample: any) => void) | null} */
  let listener = null;
  const onSample = (fn) => {
    listener = fn;
    return () => (listener = null);
  };
  const send = vi.fn(() => connected);
  const stop = startMotionStream({ onSample, send, hz });
  const emit = (t, rates = {}) => listener?.({ alpha: 1.234, beta: -5.678, gamma: 0, ...rates, t });
  return { send, stop, emit };
}

describe('startMotionStream', () => {
  it('sends raw rotation rate and timestamp, rounded to 0.1', () => {
    const { send, emit } = setup();
    emit(1000.26);
    expect(send).toHaveBeenCalledWith(NS.INPUT, INPUT.MOTION, {
      alpha: 1.2,
      beta: -5.7,
      gamma: 0,
      t: 1000.3,
    });
  });

  it('includes the gravity reading when there is one', () => {
    const { send, emit } = setup();
    emit(0, { gx: 0.04, gy: 6.93, gz: 6.95 });
    expect(send.mock.calls[0][2]).toMatchObject({ gx: 0, gy: 6.9, gz: 7 });
  });

  it('forwards every reading from a sensor running at the send rate, despite jitter', () => {
    const { send, emit } = setup({ hz: 60 });
    // ~60 Hz with a little jitter either side of 16.7 ms.
    [0, 16.2, 33.9, 49.8, 66.9, 83.1].forEach((t) => emit(t));
    expect(send).toHaveBeenCalledTimes(6);
  });

  it('thins out a faster sensor to roughly the send rate', () => {
    const { send, emit } = setup({ hz: 60 });
    for (let t = 0; t < 1000; t += 5) emit(t); // a 200 Hz sensor
    expect(send.mock.calls.length).toBeGreaterThan(55);
    expect(send.mock.calls.length).toBeLessThan(80);
  });

  it('retries on the next reading if a send was dropped', () => {
    const { send, emit } = setup({ connected: false });
    emit(0);
    emit(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends nothing after stop', () => {
    const { send, stop, emit } = setup();
    stop();
    emit(0);
    expect(send).not.toHaveBeenCalled();
  });
});
