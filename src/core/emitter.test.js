import { describe, expect, it, vi } from 'vitest';
import { createEmitter } from './emitter.js';

describe('createEmitter', () => {
  it('delivers events and supports unsubscribe', () => {
    const emitter = createEmitter();
    const fn = vi.fn();
    const off = emitter.on('x', fn);
    emitter.emit('x', 1, 2);
    off();
    emitter.emit('x', 3);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  it('isolates a throwing listener from the others', () => {
    const emitter = createEmitter();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const healthy = vi.fn();
    emitter.on('x', () => {
      throw new Error('boom');
    });
    emitter.on('x', healthy);
    emitter.emit('x');
    expect(healthy).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
