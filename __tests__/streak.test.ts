import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateStreakUpdate, getLocalDateString } from '../lib/actions/updateStreak';

describe('Streak Calculation Unit Tests', () => {
  const todayStr = '2026-07-22';
  const yesterdayStr = '2026-07-21';
  const twoDaysAgoStr = '2026-07-20';

  it('increments streak by 1 when last activity was yesterday (continuation)', () => {
    const currentStreak = 5;
    const previousLogs = [
      { logged_at: `${todayStr}T10:00:00Z` },
      { logged_at: `${yesterdayStr}T15:30:00Z` },
    ];
    const newStreak = calculateStreakUpdate(currentStreak, previousLogs, todayStr, 'UTC');
    assert.strictEqual(newStreak, 6);
  });

  it('resets streak to 1 when last activity was 2 days ago (break in streak)', () => {
    const currentStreak = 5;
    const previousLogs = [
      { logged_at: `${todayStr}T10:00:00Z` },
      { logged_at: `${twoDaysAgoStr}T12:00:00Z` },
    ];
    const newStreak = calculateStreakUpdate(currentStreak, previousLogs, todayStr, 'UTC');
    assert.strictEqual(newStreak, 1);
  });

  it('keeps streak unchanged when an activity was already logged today (same day)', () => {
    const currentStreak = 5;
    const previousLogs = [
      { logged_at: `${todayStr}T14:00:00Z` },
      { logged_at: `${todayStr}T09:00:00Z` },
      { logged_at: `${yesterdayStr}T18:00:00Z` },
    ];
    const newStreak = calculateStreakUpdate(currentStreak, previousLogs, todayStr, 'UTC');
    assert.strictEqual(newStreak, 5);
  });

  it('sets streak to 1 on first ever activity log', () => {
    const currentStreak = 0;
    const previousLogs = [
      { logged_at: `${todayStr}T10:00:00Z` },
    ];
    const newStreak = calculateStreakUpdate(currentStreak, previousLogs, todayStr, 'UTC');
    assert.strictEqual(newStreak, 1);
  });
});

describe('Streak Multi-Day Integration Flow Tests', () => {
  it('correctly calculates 5 consecutive days and resets after skip day', () => {
    const dates = [
      '2026-07-01', // Day 1
      '2026-07-02', // Day 2
      '2026-07-03', // Day 3
      '2026-07-04', // Day 4
      '2026-07-05', // Day 5
      // Skip 2026-07-06 (Day 6)
      '2026-07-07', // Day 7 (Skip day reset)
    ];

    let currentStreak = 0;
    const logsHistory: Array<{ logged_at: string }> = [];

    // Day 1
    logsHistory.unshift({ logged_at: `${dates[0]}T10:00:00Z` });
    currentStreak = calculateStreakUpdate(currentStreak, logsHistory, dates[0], 'UTC');
    assert.strictEqual(currentStreak, 1, 'Day 1 streak should be 1');

    // Day 2
    logsHistory.unshift({ logged_at: `${dates[1]}T10:00:00Z` });
    currentStreak = calculateStreakUpdate(currentStreak, logsHistory, dates[1], 'UTC');
    assert.strictEqual(currentStreak, 2, 'Day 2 streak should be 2');

    // Day 3
    logsHistory.unshift({ logged_at: `${dates[2]}T10:00:00Z` });
    currentStreak = calculateStreakUpdate(currentStreak, logsHistory, dates[2], 'UTC');
    assert.strictEqual(currentStreak, 3, 'Day 3 streak should be 3');

    // Day 4
    logsHistory.unshift({ logged_at: `${dates[3]}T10:00:00Z` });
    currentStreak = calculateStreakUpdate(currentStreak, logsHistory, dates[3], 'UTC');
    assert.strictEqual(currentStreak, 4, 'Day 4 streak should be 4');

    // Day 5
    logsHistory.unshift({ logged_at: `${dates[4]}T10:00:00Z` });
    currentStreak = calculateStreakUpdate(currentStreak, logsHistory, dates[4], 'UTC');
    assert.strictEqual(currentStreak, 5, 'Day 5 streak should be 5');

    // Day 7 (after skipping Day 6)
    logsHistory.unshift({ logged_at: `${dates[5]}T10:00:00Z` });
    currentStreak = calculateStreakUpdate(currentStreak, logsHistory, dates[5], 'UTC');
    assert.strictEqual(currentStreak, 1, 'Day 7 streak should reset to 1');
  });
});

describe('Timezone Boundary Handling Tests', () => {
  it('correctly attributes 11 PM PST activity to the PST calendar day, not next day UTC', () => {
    // 11:00 PM PST on July 21, 2026 is 06:00 AM UTC on July 22, 2026
    const utcTimestamp = '2026-07-22T06:00:00Z';
    const pstTimezone = 'America/Los_Angeles';

    const localDatePST = getLocalDateString(utcTimestamp, pstTimezone);
    const localDateUTC = getLocalDateString(utcTimestamp, 'UTC');

    assert.strictEqual(localDatePST, '2026-07-21');
    assert.strictEqual(localDateUTC, '2026-07-22');

    // Scenario: User in PST logs yesterday on 2026-07-20 (PST), then at 11 PM PST on July 21
    const pstLogs = [
      { logged_at: utcTimestamp }, // 11 PM PST Jul 21 (06:00 UTC Jul 22)
      { logged_at: '2026-07-20T20:00:00Z' }, // 12 PM PST Jul 20
    ];

    const pstStreak = calculateStreakUpdate(1, pstLogs, localDatePST, pstTimezone);
    assert.strictEqual(pstStreak, 2, 'PST 11 PM log should count as continuous from Jul 20 to Jul 21 in PST');
  });
});
