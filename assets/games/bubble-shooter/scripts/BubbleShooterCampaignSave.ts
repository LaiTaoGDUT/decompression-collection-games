import { BubbleShooterCampaign, CampaignCheckpoint, CampaignOutcome } from './BubbleShooterCampaign';
import { BUBBLE_LEVELS, bubbleLevel } from './BubbleShooterLevels';

export interface CampaignRecord {
    stars: number; starsRevision: number; bestShotsUsed: number; bestShotsRevision: number; firstCompletedAttemptId: string;
}
export interface CampaignSettlement {
    id: string; levelId: string; outcome: CampaignOutcome; shotsUsed: number; stars: number; failure?: string;
}
export interface CampaignProgress {
    schemaVersion: 1; results: Record<string, CampaignRecord>; lastSettledAttempt: CampaignSettlement | null;
    activeAttempt: CampaignCheckpoint | null; tutorialKeys: string[]; attemptSerial: number;
}
export function readCampaignProgress(value: unknown): CampaignProgress {
    const empty: CampaignProgress = { schemaVersion: 1, results: {}, lastSettledAttempt: null, activeAttempt: null, tutorialKeys: [], attemptSerial: 0 };
    if (!value || typeof value !== 'object') return empty;
    const data = value as CampaignProgress;
    const uint = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1000000000;
    if (data.schemaVersion !== 1) return empty;
    for (const id of Object.keys(data.results ?? {})) {
        const r = data.results[id], level = bubbleLevel(id);
        if (level && r && uint(r.stars) && r.stars >= 1 && r.stars <= 3 && uint(r.starsRevision) && r.starsRevision >= 1
            && uint(r.bestShotsUsed) && uint(r.bestShotsRevision)
            && (r.bestShotsRevision >= 1 || (r.bestShotsRevision === 0 && r.firstCompletedAttemptId === 'cloud'))
            && typeof r.firstCompletedAttemptId === 'string' && r.firstCompletedAttemptId) empty.results[id] = { ...r };
    }
    if (data.activeAttempt && typeof data.activeAttempt === 'object' && bubbleLevel(data.activeAttempt.levelId)) empty.activeAttempt = data.activeAttempt;
    const last = data.lastSettledAttempt;
    if (last && typeof last.id === 'string' && last.id && bubbleLevel(last.levelId)
        && ['won', 'lost', 'abandoned'].indexOf(last.outcome) >= 0 && uint(last.shotsUsed) && uint(last.stars) && last.stars <= 3) empty.lastSettledAttempt = { ...last };
    empty.tutorialKeys = Array.isArray(data.tutorialKeys) ? data.tutorialKeys.filter(k => typeof k === 'string' && k.length < 100) : [];
    empty.attemptSerial = uint(data.attemptSerial) ? data.attemptSerial : 0;
    return empty;
}
export function campaignRecommendedRoute(progress: CampaignProgress): number {
    const index = BUBBLE_LEVELS.findIndex(level => !progress.results[level.id]);
    return index < 0 ? BUBBLE_LEVELS.length : index + 1;
}
export function campaignUnlocked(progress: CampaignProgress, id: string): boolean {
    const level = bubbleLevel(id); return !!level && level.routeIndex <= campaignRecommendedRoute(progress);
}
/** Only the owned unsettled attempt can commit; all fields are replaced in one storage write by the coordinator. */
export function settleCampaignProgress(progress: CampaignProgress, round: BubbleShooterCampaign, abandoned = false): CampaignProgress {
    if (progress.activeAttempt?.attemptId !== round.attemptId || progress.lastSettledAttempt?.id === round.attemptId) return progress;
    if (!abandoned && !round.outcome) return progress;
    const outcome = abandoned ? 'abandoned' : round.outcome!;
    const stars = outcome === 'won' ? round.stars : 0;
    const results = { ...progress.results };
    if (outcome === 'won') {
        const previous = results[round.level.id], currentRevision = round.level.revision;
        results[round.level.id] = {
            stars: Math.max(previous?.stars ?? 0, stars),
            starsRevision: !previous || stars >= previous.stars ? currentRevision : previous.starsRevision,
            bestShotsUsed: previous?.bestShotsRevision === currentRevision ? Math.min(previous.bestShotsUsed, round.shotsUsed) : round.shotsUsed,
            bestShotsRevision: currentRevision, firstCompletedAttemptId: previous?.firstCompletedAttemptId ?? round.attemptId,
        };
    }
    return { ...progress, results, activeAttempt: null,
        lastSettledAttempt: { id: round.attemptId, levelId: round.level.id, outcome, shotsUsed: round.shotsUsed, stars,
            ...(round.failure ? { failure: round.failure } : {}) } };
}
