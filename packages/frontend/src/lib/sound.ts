/**
 * A short, cheerful "coin" chime — two ascending square-wave notes (B5 → E6),
 * à la a Mario coin / Sonic ring. Uses the Web Audio API so there's no asset to
 * bundle. Silently no-ops if audio isn't available or is blocked.
 */
export function playCoinSound(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Mario-coin interval: B5 then a quick jump up to E6, held briefly.
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.07); // E6

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.setValueAtTime(0.25, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.start(now);
    osc.stop(now + 0.42);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio unavailable — ignore */
  }
}

/**
 * A soft two-note "ding" for an incoming message or alert — gentler than the
 * coin chime (which celebrates something the user just did).
 */
export function playMessageSound(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (const [freq, at] of [
      [880, 0],
      [1318.51, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.2, now + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.32);
    }
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    /* audio unavailable — ignore */
  }
}
