import { describe, expect, it } from 'vitest';
import { BODY, length, sub } from '../baseball/body.js';
import { HAND_OFFSET, SLIDE_Z, STANCE_ARM, STANCE_Z, bowlerPose } from './bowler.js';

const distance = (a, b) => length(sub(a, b));

describe('bowlerPose', () => {
  it('stands behind the foul line to line up, cradling the ball', () => {
    const pose = bowlerPose({ x: 0, walk: 0, armDeg: STANCE_ARM, holding: false });
    expect(pose.lHip[2]).toBeCloseTo(STANCE_Z, 1);
    expect(distance(pose.lHand, pose.rHand)).toBeLessThan(0.2);
  });

  it('ends the approach in a slide near the foul line', () => {
    const pose = bowlerPose({ x: 0, walk: 1, armDeg: 0, holding: true });
    expect(pose.lHip[2]).toBeCloseTo(SLIDE_Z, 1);
    // The sliding (left) foot is out in front of the trailing right foot.
    expect(pose.lAnkle[2]).toBeGreaterThan(pose.rAnkle[2] + 0.4);
    expect(pose.lAnkle[2]).toBeLessThan(0);
  });

  it('swings the ball past the hip, on the line the ball will roll', () => {
    for (const x of [-0.3, 0, 0.25]) {
      const pose = bowlerPose({ x, walk: 1, armDeg: 0, holding: true });
      expect(pose.rHand[0]).toBeCloseTo(x, 1);
    }
    expect(HAND_OFFSET).toBeGreaterThan(BODY.hipWidth / 2);
  });

  it('follows the arm angle: down, behind, and out in front', () => {
    const at = (armDeg) => bowlerPose({ x: 0, walk: 1, armDeg, holding: true });
    const shoulder = at(0).rSh;
    expect(at(0).rHand[1]).toBeLessThan(shoulder[1] - 0.3);
    expect(at(-60).rHand[2]).toBeLessThan(shoulder[2] - 0.2);
    expect(at(90).rHand[2]).toBeGreaterThan(shoulder[2] + 0.3);
  });

  it('keeps every bone its proper length', () => {
    for (const walk of [0, 0.3, 0.6, 1]) {
      for (const armDeg of [-60, 0, 120]) {
        const pose = bowlerPose({ x: 0, walk, armDeg, holding: true });
        for (const side of ['l', 'r']) {
          expect(distance(pose[`${side}Sh`], pose[`${side}El`])).toBeCloseTo(BODY.upperArm, 2);
          expect(distance(pose[`${side}Hip`], pose[`${side}Knee`])).toBeCloseTo(BODY.thigh, 2);
        }
      }
    }
  });
});
