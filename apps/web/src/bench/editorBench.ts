export interface FrameStats {
  fps: number;
  /** Frame intervals longer than 25 ms (1.5 vsync periods at 60 Hz). */
  slowFrames: number;
}

export const SLOW_FRAME_MS = 25;
export const MIN_FPS = 58;
export const MAX_SLOW_FRACTION = 0.05;

/**
 * Calls `drive(i)` inside each of `frames` consecutive animation frames. A baseline frame
 * starts the clock, so `fps` = frames / elapsed seconds over exactly `frames` intervals.
 */
export function measureFrames(drive: (frame: number) => void, frames: number): Promise<FrameStats> {
  return new Promise((resolve) => {
    let last: number | undefined;
    let first = 0;
    let i = 0;
    let slow = 0;
    const tick = (now: number) => {
      if (last === undefined) {
        first = now;
      } else {
        if (now - last > SLOW_FRAME_MS) slow++;
        drive(i++);
      }
      last = now;
      if (i < frames) {
        requestAnimationFrame(tick);
      } else {
        const seconds = (now - first) / 1000;
        resolve({ fps: seconds > 0 ? frames / seconds : Infinity, slowFrames: slow });
      }
    };
    requestAnimationFrame(tick);
  });
}

/** The pass rule of the editor row: 60 fps with timer jitter, at most 5 % slow frames. */
export const editorFramesPass = (s: FrameStats, frames: number): boolean =>
  s.fps >= MIN_FPS && s.slowFrames <= MAX_SLOW_FRACTION * frames;

const pointer = (type: string, x: number, y: number): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: 1,
    buttons: type === "pointerup" ? 0 : 4,
    clientX: x,
    clientY: y,
  });

/** Drag pan (middle button) of `frames` frames, then alternating wheel zoom of `frames` frames. */
export async function runPanZoom(svg: SVGSVGElement, frames: number): Promise<FrameStats[]> {
  const rect = svg.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  svg.dispatchEvent(pointer("pointerdown", cx, cy));
  const pan = await measureFrames((i) => {
    svg.dispatchEvent(pointer("pointermove", cx + (i % 60) * 4, cy + (i % 40) * 3));
  }, frames);
  svg.dispatchEvent(pointer("pointerup", cx, cy));
  const zoom = await measureFrames((i) => {
    svg.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: i % 2 === 0 ? -100 : 100,
        clientX: cx,
        clientY: cy,
      }),
    );
  }, frames);
  return [pan, zoom];
}
