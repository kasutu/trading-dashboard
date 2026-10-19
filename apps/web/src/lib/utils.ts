import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** The row with the highest net. */
export const best = <T extends { net: number }>(xs: T[]) =>
  xs.reduce<T | undefined>((b, c) => (!b || c.net > b.net ? c : b), undefined)
