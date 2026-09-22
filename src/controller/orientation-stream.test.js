import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INPUT, NS } from '../core/protocol.js';
import { KEEPALIVE_MS, startOrientationStream } from './orientation-stream.js';

describe('startOrientationStream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(readings) {
    let reading = readings;
    const send = vi.fn(() => true);
    const stop = startOrientationStream({
      read: () => reading,
      send,
      hz: 50, // 20ms ticks
      now: () => Date.now(),
    });
    return { send, stop, set: (next) => (reading = next) };
  }

  it('sends at most once per tick, and only when the pose changes', () => {
    const { send, stop, set } = setup({ yaw: 1, pitch: 0, roll: 0 });
    vi.advanceTimersByTime(20);
    expect(send).toHaveBeenCalledWith(NS.INPUT, INPUT.ORIENT, { yaw: 1, pitch: 0, roll: 0 });

    vi.advanceTimersByTime(100); // unchanged, within keepalive
    expect(send).toHaveBeenCalledTimes(1);

    set({ yaw: 2, pitch: 0, roll: 0 });
    vi.advanceTimersByTime(20);
    expect(send).toHaveBeenCalledTimes(2);
    stop();
  });

  it('resends an unchanged pose as a keepalive', () => {
    const { send, stop } = setup({ yaw: 1, pitch: 0, roll: 0 });
    vi.advanceTimersByTime(20 + KEEPALIVE_MS);
    expect(send).toHaveBeenCalledTimes(2);
    stop();
  });

  it('sends nothing until the sensor has data, and nothing after stop', () => {
    const { send, stop, set } = setup(null);
    vi.advanceTimersByTime(200);
    expect(send).not.toHaveBeenCalled();
    stop();
    set({ yaw: 1, pitch: 0, roll: 0 });
    vi.advanceTimersByTime(200);
    expect(send).not.toHaveBeenCalled();
  });
});
