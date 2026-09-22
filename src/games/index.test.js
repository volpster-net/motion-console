import { describe, expect, it } from 'vitest';
import { listGames, loadGame } from './index.js';

describe('games registry', () => {
  it('lists every game with its menu details', () => {
    const games = listGames();
    expect(games.map((game) => game.id)).toContain('target-practice');
    for (const game of games) {
      expect(game.name).toBeTruthy();
      expect(game.description).toBeTruthy();
    }
  });

  it('loads a game that follows the start/stop contract', async () => {
    const game = await loadGame('target-practice');
    expect(game).toMatchObject({ id: 'target-practice', name: 'Target Practice' });
    expect(typeof game.start).toBe('function');
    expect(typeof game.stop).toBe('function');
  });

  it('refuses unknown games', async () => {
    await expect(loadGame('nope')).rejects.toThrow('Unknown game');
  });
});
