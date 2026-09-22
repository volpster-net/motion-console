/** Runs the Target Practice game (src/games/target-practice) as a console channel. */
import targetPractice from '../../games/target-practice/index.js';
import { gameAsChannel } from '../../games/game.js';

export default gameAsChannel(targetPractice);
