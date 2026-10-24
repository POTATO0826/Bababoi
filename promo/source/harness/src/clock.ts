// Deterministic wall clock for the app modules (ages, "freed" windows). Must be imported first.
export const clock = { now: 0 };
const realNow = Date.now.bind(Date);
Date.now = () => (clock.now ? clock.now : realNow());
