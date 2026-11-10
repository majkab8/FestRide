/* EXPERIMENT: a little car driving around the record's outer groove, so the
   hero says "transport" as well as "music".
   To remove it: delete this file and the `RecordCar` lines in Landing.tsx
   (or just set SHOW_RECORD_CAR = false there).

   The car rides the groove, so it moves with the record: spin the record
   faster (pointer, scroll) and the car speeds up; spin it back and the car
   reverses. On its own it drives the visible top arc slowly and crosses the
   hidden lower half (below the hero's bottom edge) quickly.
   It is drawn in the record's non-rotating overlay SVG; Landing's animation
   loop calls `stepCar` each frame and writes the angle to the element. */
import type { Ref } from "react";

const VISIBLE_SPEED = 3; // deg/s across the top arc (plus the record's own ~8 deg/s)
const HIDDEN_SPEED = 36; // deg/s across the hidden lower half
const HORIZON = 100; // |angle| beyond this (0 = top) is below the hero's edge

const CSS = `.v3 .record-car { transform-box: view-box; transform-origin: 100px 100px; }`;

/** Next car angle (degrees, 0 = top of the record, clockwise positive). */
export function stepCar(angle: number, dt: number, recordDelta: number, calm: boolean): number {
  const a = ((angle + 180) % 360 + 360) % 360 - 180; // normalise to (-180, 180]
  const own = calm ? 0 : (Math.abs(a) > HORIZON ? HIDDEN_SPEED : VISIBLE_SPEED) * dt;
  return a + own + recordDelta; // riding the groove: the record's spin carries the car 1:1
}

export const CAR_START_ANGLE = -60;

/** Rendered in the record's 200x200 overlay SVG; rides the outermost groove (radius ~90). */
export default function RecordCar({ carRef }: { carRef: Ref<SVGGElement> }) {
  return (
    <g aria-hidden="true">
      <style>{CSS}</style>
      <g className="record-car" ref={carRef} style={{ transform: `rotate(${CAR_START_ANGLE}deg)` }}>
        {/* Drawn upright at the top of its lap, wheels on the groove, facing the way it drives. */}
        <g transform="translate(100 9)">
          <path d="M-7.6 -10.8 L-5.2 -15.6 Q-4.6 -16.6 -3.4 -16.6 L3.6 -16.6 Q4.8 -16.6 5.4 -15.6 L8.2 -10.8 Z" transform="translate(0 4.4)" fill="#D7FF4A" />
          <path d="M-12 -6.4 Q-12 -8.6 -9.8 -8.6 L10.2 -8.6 Q12.6 -8.6 12.6 -6.2 L12.6 -2.6 Q12.6 -1.4 11.4 -1.4 L-10.8 -1.4 Q-12 -1.4 -12 -2.6 Z" fill="#D7FF4A" />
          <path d="M-5.6 -8.4 L-3.9 -11.6 L0.3 -11.6 L0.3 -8.4 Z M1.4 -8.4 L1.4 -11.6 L4.4 -11.6 L6.5 -8.4 Z" fill="#FFFAF2" />
          <rect x="10.4" y="-6.6" width="2.2" height="1.6" rx=".6" fill="#FFC48E" />
          <circle cx="-6.4" cy="-1.2" r="2.5" fill="#1E1B18" />
          <circle cx="6.8" cy="-1.2" r="2.5" fill="#1E1B18" />
          <circle cx="-6.4" cy="-1.2" r=".9" fill="#FFFAF2" />
          <circle cx="6.8" cy="-1.2" r=".9" fill="#FFFAF2" />
          <path d="M-13 -4 h-3.4 M-13.4 -6 h-2.2" stroke="#FFFAF2" strokeWidth=".7" strokeLinecap="round" opacity=".7" />
        </g>
      </g>
    </g>
  );
}
