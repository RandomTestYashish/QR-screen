import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

/** Frame-rate independent exponential approach toward `target`. */
export const damp = (current: number, target: number, factor: number) =>
  current + (target - current) * factor;
