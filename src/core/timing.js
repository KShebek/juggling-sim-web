// Timing and flight physics. Times in seconds, beats as numbers, heights in metres.

/** Seconds per beat from a tempo in beats (throws) per minute. 120 BPM = 0.5 s. */
export const beatSeconds = bpm => 60 / bpm;

/** A throw is a hold (the ball never leaves the hand) only if it's a 2 that lands in the same hand. */
export const isHold = (value, fromHand, toHand) => value === 2 && fromHand === toHand;

/** Flight time of a throw: (value − dwell) beats. Holds and 0s don't fly. */
export function flightTime(value, beatSec, dwellBeats, fromHand, toHand) {
  if (value <= 0 || isHold(value, fromHand, toHand)) return 0;
  return Math.max(0.05, (value - dwellBeats) * beatSec);
}

/** Peak height above the throw point for a flight time t: g·t²/8. */
export const peakHeight = (t, gravity) => (gravity * t * t) / 8;
