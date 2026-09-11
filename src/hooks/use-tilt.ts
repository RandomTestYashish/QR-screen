import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { TiltEngine } from "@/lib/tilt";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Owns a TiltEngine and runs it only while `active`.
 * Reduced-motion users get a permanently parked engine: subscribers still
 * render, the surface simply never moves.
 */
export function useTiltEngine(
  active: boolean,
  targetRef: RefObject<HTMLElement | null>,
) {
  const reducedMotion = useReducedMotion();
  const engine = useMemo(() => new TiltEngine(), []);

  useEffect(() => {
    if (!active || reducedMotion) return;
    engine.start(targetRef.current);
    return () => engine.stop();
  }, [active, engine, reducedMotion, targetRef]);

  return engine;
}
