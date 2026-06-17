const HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

function createPlaytimeTracker({ store, isArmaRunning, claimReward, onPointsEarned, onClaimFailed }) {
  let timer = null;
  let lastCheckAt = Date.now();
  let claiming = false;
  let lastFailureNoticeAt = 0;

  const getAccumulated = () => Number(store.get('playtimeAccumulatedMs') || 0);
  const setAccumulated = (ms) => store.set('playtimeAccumulatedMs', Math.max(0, Math.floor(ms)));

  const maybeNotifyFailure = (result) => {
    if (!result || result.success || result.error === 'too_soon') return;
    const now = Date.now();
    if (now - lastFailureNoticeAt < 15 * 60 * 1000) return;
    lastFailureNoticeAt = now;
    onClaimFailed?.(result);
  };

  const tick = async () => {
    const now = Date.now();
    const delta = Math.max(0, now - lastCheckAt);
    lastCheckAt = now;

    if (!isArmaRunning(true)) return;

    let accumulated = getAccumulated() + delta;
    setAccumulated(accumulated);

    while (accumulated >= HOUR_MS && !claiming) {
      claiming = true;
      try {
        const result = await claimReward();
        if (result?.success) {
          accumulated -= HOUR_MS;
          setAccumulated(accumulated);
          onPointsEarned?.(result);
          continue;
        }
        if (result?.error === 'too_soon' && result?.retry_after_sec) {
          const waitMs = Number(result.retry_after_sec) * 1000;
          accumulated = Math.max(0, HOUR_MS - waitMs);
          setAccumulated(accumulated);
        } else {
          maybeNotifyFailure(result);
        }
        break;
      } finally {
        claiming = false;
      }
    }
  };

  return {
    start() {
      if (timer) return;
      lastCheckAt = Date.now();
      timer = setInterval(() => {
        tick().catch(() => {});
      }, CHECK_INTERVAL_MS);
      tick().catch(() => {});
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    getProgress() {
      const accumulated = getAccumulated();
      return {
        accumulatedMs: accumulated,
        nextRewardMs: Math.max(0, HOUR_MS - (accumulated % HOUR_MS)),
      };
    },
  };
}

module.exports = {
  HOUR_MS,
  CHECK_INTERVAL_MS,
  createPlaytimeTracker,
};
