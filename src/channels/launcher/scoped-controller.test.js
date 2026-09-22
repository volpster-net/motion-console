import { describe, expect, it, vi } from 'vitest';
import { createScopedController } from './scoped-controller.js';

/** A fake channel API that counts live subscriptions. */
function fakeApi() {
  const live = new Set();
  const subscribe = (fn) => {
    live.add(fn);
    return () => live.delete(fn);
  };
  /** Delivers input to every subscriber, like a phone message would. */
  const emit = (...args) => [...live].forEach((fn) => fn(...args));
  return {
    live,
    emit,
    players: { list: () => [], get: () => undefined, onChange: subscribe },
    onInput: (_type, fn) => subscribe(fn),
    vibrate: vi.fn(() => true),
  };
}

describe('createScopedController', () => {
  it('passes subscriptions and vibrations through', () => {
    const api = fakeApi();
    const { controller } = createScopedController(api);
    controller.onInput('motion', () => {});
    controller.players.onChange(() => {});
    controller.vibrate('p1', 30);
    expect(api.live.size).toBe(2);
    expect(api.vibrate).toHaveBeenCalledWith('p1', 30);
  });

  it('removes everything the game left subscribed when disposed', () => {
    const api = fakeApi();
    const { controller, dispose } = createScopedController(api);
    controller.onInput('motion', () => {});
    controller.onInput('button', () => {});
    controller.players.onChange(() => {});
    dispose();
    expect(api.live.size).toBe(0);
  });

  it('lets the game unsubscribe on its own, safely twice', () => {
    const api = fakeApi();
    const { controller, dispose } = createScopedController(api);
    const off = controller.onInput('motion', () => {});
    off();
    expect(api.live.size).toBe(0);
    dispose();
    expect(api.live.size).toBe(0);
  });

  it('ignores anything the game tries after it was stopped', () => {
    const api = fakeApi();
    const { controller, dispose } = createScopedController(api);
    dispose();
    controller.onInput('motion', () => {});
    expect(api.live.size).toBe(0);
    expect(controller.vibrate('p1', 30)).toBe(false);
    expect(api.vibrate).not.toHaveBeenCalled();
  });

  it('holds back phone input while muted', () => {
    const api = fakeApi();
    const { controller, setMuted } = createScopedController(api);
    const heard = vi.fn();
    controller.onInput('button', heard);
    setMuted(true);
    api.emit({ id: 'fire' });
    expect(heard).not.toHaveBeenCalled();
    setMuted(false);
    api.emit({ id: 'fire' });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
