// Simple 2D geometry shared by the engine (mid-air checks) and the renderer.
// Metres, y up, hands throw from y = 0. Right hand is +x.

export const GEOM = { inX: 0.10, outX: 0.30, floorY: -0.95, ballR: 0.035 };

const side = h => (h === 'R' ? 1 : -1);
/** Where a hand releases a throw (inside of its loop). */
export const throwPoint = h => ({ x: side(h) * GEOM.inX, y: 0 });
/** Where a hand catches (outside of its loop). */
export const catchPoint = h => ({ x: side(h) * GEOM.outX, y: 0 });

/**
 * Position of a flying ball at time t.
 * flight = { t0, t1, x0, y0, x1, y1 }; gravity in m/s².
 */
export function flightPosition(flight, t, gravity) {
  const T = flight.t1 - flight.t0;
  const s = Math.max(0, Math.min(1, (t - flight.t0) / T));
  return {
    x: flight.x0 + (flight.x1 - flight.x0) * s,
    y: flight.y0 + (flight.y1 - flight.y0) * s + 0.5 * gravity * T * T * s * (1 - s)
  };
}
