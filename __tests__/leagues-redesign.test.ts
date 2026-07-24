import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface MockPlayerScore {
  userId: string;
  team: 'TITANS' | 'REBELS';
  score: number;
}

export function calculateTeamScores(scores: MockPlayerScore[]) {
  let titansTotal = 0;
  let rebelsTotal = 0;

  for (const s of scores) {
    if (s.team === 'TITANS') titansTotal += Number(s.score) || 0;
    if (s.team === 'REBELS') rebelsTotal += Number(s.score) || 0;
  }

  const winner =
    titansTotal > rebelsTotal ? 'TITANS' : titansTotal < rebelsTotal ? 'REBELS' : 'TIE';

  return { titansTotal, rebelsTotal, winner };
}

export function parseTimerInputToSeconds(hours: number, minutes: number, seconds: number): number {
  if (hours < 0 || minutes < 0 || seconds < 0 || minutes >= 60 || seconds >= 60) {
    throw new Error('Invalid timer input');
  }
  return hours * 3600 + minutes * 60 + seconds;
}

describe('Redesigned Leagues Tab Unit & Integration Tests', () => {
  it('correctly aggregates individual player scores for TITANS and REBELS', () => {
    const scores: MockPlayerScore[] = [
      { userId: 'u1', team: 'TITANS', score: 25 },
      { userId: 'u2', team: 'TITANS', score: 30 },
      { userId: 'u3', team: 'REBELS', score: 40 },
      { userId: 'u4', team: 'REBELS', score: 10 },
    ];

    const result = calculateTeamScores(scores);
    assert.strictEqual(result.titansTotal, 55);
    assert.strictEqual(result.rebelsTotal, 50);
    assert.strictEqual(result.winner, 'TITANS');
  });

  it('determines winner correctly for ties and REBELS win', () => {
    const rebelWinScores: MockPlayerScore[] = [
      { userId: 'u1', team: 'TITANS', score: 20 },
      { userId: 'u2', team: 'REBELS', score: 100 },
    ];
    const rebelResult = calculateTeamScores(rebelWinScores);
    assert.strictEqual(rebelResult.winner, 'REBELS');

    const tieScores: MockPlayerScore[] = [
      { userId: 'u1', team: 'TITANS', score: 50 },
      { userId: 'u2', team: 'REBELS', score: 50 },
    ];
    const tieResult = calculateTeamScores(tieScores);
    assert.strictEqual(tieResult.winner, 'TIE');
  });

  it('converts HH:MM:SS timer inputs to total seconds and validates bounds', () => {
    // 0 hours, 10 mins, 30 secs = 630 secs
    assert.strictEqual(parseTimerInputToSeconds(0, 10, 30), 630);
    // 1 hour, 15 mins, 0 secs = 4500 secs
    assert.strictEqual(parseTimerInputToSeconds(1, 15, 0), 4500);

    // Invalid minutes (>= 60) throws error
    assert.throws(() => parseTimerInputToSeconds(0, 75, 0), /Invalid timer input/);
  });
});
