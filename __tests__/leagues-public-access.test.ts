import { describe, it } from 'node:test';
import assert from 'node:assert';

export interface MockLeagueChallenge {
  id: string;
  group_id: string;
  name: string;
}

export interface MockLeagueAssignment {
  group_id: string;
  user_id: string;
  team_name: 'TITANS' | 'REBELS';
}

export interface MockLeagueMatch {
  id: string;
  group_id: string;
  league_challenge_id: string;
  titans_score: number;
  rebels_score: number;
  winner_team: 'TITANS' | 'REBELS' | 'TIE' | null;
  completed_at: string | null;
  deleted_at: string | null;
}

/** Mock Database Store for Democratized Leagues Access */
export class MockLeaguesDbStore {
  private challenges: MockLeagueChallenge[] = [];
  private assignments: MockLeagueAssignment[] = [];
  private matches: MockLeagueMatch[] = [];

  public clear() {
    this.challenges = [];
    this.assignments = [];
    this.matches = [];
  }

  /** Any group member (non-admin) can create a challenge type */
  public createChallenge(groupId: string, name: string): { success: true; challenge: MockLeagueChallenge } {
    const challenge: MockLeagueChallenge = {
      id: `ch-${Math.random().toString(36).slice(2, 9)}`,
      group_id: groupId,
      name,
    };
    this.challenges.push(challenge);
    return { success: true, challenge };
  }

  /** Any group member (non-admin) can assign players to teams */
  public assignTeam(groupId: string, userId: string, teamName: 'TITANS' | 'REBELS'): { success: true } {
    const existingIdx = this.assignments.findIndex((a) => a.group_id === groupId && a.user_id === userId);
    if (existingIdx >= 0) {
      this.assignments[existingIdx].team_name = teamName;
    } else {
      this.assignments.push({ group_id: groupId, user_id: userId, team_name: teamName });
    }
    return { success: true };
  }

  /** Any group member can create a match for their group */
  public createMatch(groupId: string, challengeId: string): { success: true; match: MockLeagueMatch } {
    const match: MockLeagueMatch = {
      id: `match-${Math.random().toString(36).slice(2, 9)}`,
      group_id: groupId,
      league_challenge_id: challengeId,
      titans_score: 0,
      rebels_score: 0,
      winner_team: null,
      completed_at: null,
      deleted_at: null,
    };
    this.matches.push(match);
    return { success: true, match };
  }

  public updateMatchScore(groupId: string, matchId: string, titansScore: number, rebelsScore: number) {
    const match = this.matches.find((m) => m.id === matchId && m.group_id === groupId);
    if (!match) return { success: false, error: 'Match not found' };
    if (match.completed_at) return { success: false, error: 'Match is already completed' };

    match.titans_score = titansScore;
    match.rebels_score = rebelsScore;
    return { success: true };
  }

  public completeMatch(groupId: string, matchId: string) {
    const match = this.matches.find((m) => m.id === matchId && m.group_id === groupId);
    if (!match) return { success: false, error: 'Match not found' };
    if (match.completed_at) return { success: false, error: 'Match is already completed' };

    const winner =
      match.titans_score > match.rebels_score
        ? 'TITANS'
        : match.titans_score < match.rebels_score
        ? 'REBELS'
        : 'TIE';

    match.winner_team = winner;
    match.completed_at = new Date().toISOString();
    return { success: true, winner };
  }

  public getMatchesForGroup(groupId: string): MockLeagueMatch[] {
    return this.matches.filter((m) => m.group_id === groupId && m.deleted_at === null);
  }
}

describe('Democratized Leagues Access & Group Isolation Tests', () => {
  const store = new MockLeaguesDbStore();

  it('allows non-admin group members to create a challenge type and assign teams', () => {
    store.clear();

    // Member (non-admin) in Group A creates challenge
    const cRes = store.createChallenge('group-a', '100 Push-ups');
    assert.strictEqual(cRes.success, true);
    assert.strictEqual(cRes.challenge.name, '100 Push-ups');

    // Assign players
    store.assignTeam('group-a', 'user-1', 'TITANS');
    store.assignTeam('group-a', 'user-2', 'TITANS');
    store.assignTeam('group-a', 'user-3', 'REBELS');
    store.assignTeam('group-a', 'user-4', 'REBELS');

    const matchesGroupA = store.getMatchesForGroup('group-a');
    assert.strictEqual(matchesGroupA.length, 0);
  });

  it('allows non-admin user to launch a match, update scores, and complete challenge', () => {
    store.clear();

    const cRes = store.createChallenge('group-a', '100 Push-ups');
    const mRes = store.createMatch('group-a', cRes.challenge.id);
    assert.strictEqual(mRes.success, true);

    const matchId = mRes.match.id;

    // Log score for TITANS (90) and REBELS (50)
    const scoreRes = store.updateMatchScore('group-a', matchId, 90, 50);
    assert.strictEqual(scoreRes.success, true);

    // Complete challenge -> locks match, sets winner TITANS
    const compRes = store.completeMatch('group-a', matchId);
    assert.strictEqual(compRes.success, true);
    assert.strictEqual(compRes.winner, 'TITANS');

    // Attempting to update score after completion is rejected
    const rejRes = store.updateMatchScore('group-a', matchId, 100, 50);
    assert.strictEqual(rejRes.success, false);
    assert.strictEqual(rejRes.error, 'Match is already completed');
  });

  it('enforces group isolation so Group A members cannot view or edit Group B matches', () => {
    store.clear();

    // Group A creates match
    const cResA = store.createChallenge('group-a', 'Squats');
    const mResA = store.createMatch('group-a', cResA.challenge.id);

    // Group B creates match
    const cResB = store.createChallenge('group-b', 'Planks');
    store.createMatch('group-b', cResB.challenge.id);

    // Group A queries matches -> sees only Group A matches
    const matchesA = store.getMatchesForGroup('group-a');
    assert.strictEqual(matchesA.length, 1);
    assert.strictEqual(matchesA[0].id, mResA.match.id);

    // User in Group A attempts to update Group B match -> rejected
    const attackRes = store.updateMatchScore('group-a', 'match-b-fake', 100, 0);
    assert.strictEqual(attackRes.success, false);
    assert.strictEqual(attackRes.error, 'Match not found');
  });
});
