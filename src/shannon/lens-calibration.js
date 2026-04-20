// Item 100 · Lens-calibration · convergent-confidence-trap check

function checkConvergentTrap(trace) {
  const highStreak = [];
  let streak = 0, maxStreak = 0, streakStart = -1, maxStreakStart = -1;
  trace.forEach((t, i) => {
    if (typeof t.LCR === "number" && t.LCR >= 0.95) {
      if (streak === 0) streakStart = i;
      streak++;
      if (streak > maxStreak) { maxStreak = streak; maxStreakStart = streakStart; }
    } else {
      streak = 0; streakStart = -1;
    }
  });
  const tripped = maxStreak >= 3;
  return {
    tripped,
    max_streak_length: maxStreak,
    streak_start_index: maxStreakStart,
    recommendation: tripped ? "cap LCR at 0.5 for the streak stages to prevent rubber-stamp" : "no action",
  };
}

function applyCap(trace) {
  const r = checkConvergentTrap(trace);
  if (!r.tripped) return trace;
  const out = [...trace];
  for (let i = r.streak_start_index; i < r.streak_start_index + r.max_streak_length; i++) {
    if (typeof out[i].LCR === "number" && out[i].LCR >= 0.95) {
      out[i] = { ...out[i], LCR: 0.5, trap_capped: true };
    }
  }
  return out;
}

module.exports = { checkConvergentTrap, applyCap };
