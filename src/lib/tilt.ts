import { clamp, damp } from "./utils";

/**
 * Tilt engine.
 *
 * One rAF loop smooths raw sensor noise into a pair of normalised axes and
 * pushes them to subscribers. Subscribers write straight to the DOM — no
 * React state per frame, so nothing re-renders while the card is being moved.
 *
 * The loop parks itself the moment the smoothed value has converged and no
 * new input has arrived, so an idle card costs nothing.
 */

export interface TiltVector {
  /** Left/right. -1 = tilted left, +1 = tilted right. */
  x: number;
  /** Forward/back. -1 = top edge away, +1 = top edge toward the viewer. */
  y: number;
  /** How the values are being produced right now. */
  source: TiltSource;
}

export type TiltSource = "sensor" | "pointer" | "idle";

type Listener = (v: Readonly<TiltVector>) => void;

/** Degrees of device rotation mapped onto the full -1..1 range. */
const SENSOR_RANGE = 26;
/** Ignore sub-degree jitter around the resting attitude. */
const DEADZONE = 0.02;
/** Per-frame approach rate. Critically damped feel, no spring, no overshoot. */
const SMOOTHING = 0.11;
/** Below this the loop is allowed to sleep. */
const REST_EPSILON = 0.0008;

export class TiltEngine {
  private listeners = new Set<Listener>();
  private raw = { x: 0, y: 0 };
  private value: TiltVector = { x: 0, y: 0, source: "idle" };
  private frame = 0;
  private running = false;
  private baseline: number | null = null;
  private pointerTarget: HTMLElement | null = null;
  private hasSensor = false;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.value);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get current(): Readonly<TiltVector> {
    return this.value;
  }

  /**
   * iOS 13+ gates DeviceOrientationEvent behind a permission call that must
   * happen inside a user gesture. Call this from the tap that opens the card.
   * Resolves either way — a refusal simply leaves the pointer fallback in play.
   */
  static async requestSensorAccess(): Promise<boolean> {
    const ctor = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<PermissionState | "granted">;
        })
      | undefined;
    if (!ctor) return false;
    if (typeof ctor.requestPermission !== "function") return true;
    try {
      return (await ctor.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }

  start(pointerTarget?: HTMLElement | null) {
    if (this.running) {
      this.pointerTarget = pointerTarget ?? this.pointerTarget;
      return;
    }
    this.running = true;
    this.pointerTarget = pointerTarget ?? null;

    if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", this.onOrientation, {
        passive: true,
      });
    }
    this.pointerTarget?.addEventListener("pointermove", this.onPointer);
    this.pointerTarget?.addEventListener("pointerleave", this.onPointerLeave);
    this.wake();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("deviceorientation", this.onOrientation);
    this.pointerTarget?.removeEventListener("pointermove", this.onPointer);
    this.pointerTarget?.removeEventListener("pointerleave", this.onPointerLeave);
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.baseline = null;
    this.hasSensor = false;
    this.raw = { x: 0, y: 0 };
    // Snap to rest and publish once. Coasting here would fight whatever
    // transition is taking the surface away.
    this.value = { x: 0, y: 0, source: "idle" };
    for (const listener of this.listeners) listener(this.value);
  }

  private onOrientation = (event: DeviceOrientationEvent) => {
    const { beta, gamma } = event;
    if (beta == null || gamma == null) return;
    // Some browsers fire one all-zero event before the sensor is live.
    if (beta === 0 && gamma === 0 && event.alpha === 0) return;

    this.hasSensor = true;
    // Calibrate against however the phone happened to be held at the start,
    // so the resting state is always "flat", not "face up".
    if (this.baseline === null) this.baseline = beta;

    this.raw.x = clamp(gamma / SENSOR_RANGE, -1, 1);
    this.raw.y = clamp((beta - this.baseline) / SENSOR_RANGE, -1, 1);
    this.value.source = "sensor";
    this.wake();
  };

  private onPointer = (event: PointerEvent) => {
    // A real sensor always wins over the mouse fallback.
    if (this.hasSensor || !this.pointerTarget) return;
    const rect = this.pointerTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.raw.x = clamp(
      ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      -1,
      1,
    );
    this.raw.y = clamp(
      -((event.clientY - rect.top) / rect.height - 0.5) * 2,
      -1,
      1,
    );
    this.value.source = "pointer";
    this.wake();
  };

  private onPointerLeave = () => {
    if (this.hasSensor) return;
    this.raw.x = 0;
    this.raw.y = 0;
    this.wake();
  };

  private wake() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.frame = 0;

    const targetX = Math.abs(this.raw.x) < DEADZONE ? 0 : this.raw.x;
    const targetY = Math.abs(this.raw.y) < DEADZONE ? 0 : this.raw.y;

    this.value = {
      x: damp(this.value.x, targetX, SMOOTHING),
      y: damp(this.value.y, targetY, SMOOTHING),
      source: this.value.source,
    };

    const settled =
      Math.abs(targetX - this.value.x) < REST_EPSILON &&
      Math.abs(targetY - this.value.y) < REST_EPSILON;

    if (settled) {
      this.value = { ...this.value, x: targetX, y: targetY };
    }

    for (const listener of this.listeners) listener(this.value);

    // Sleep once converged. New input calls wake() and restarts the loop.
    if (!settled) this.frame = requestAnimationFrame(this.tick);
  };
}
