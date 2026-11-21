import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Direction of a text from its first strong character (like dir="auto", but for a chosen part). */
export function textDirection(text: string): 'rtl' | 'ltr' {
  const first = text.match(/[A-Za-zÀ-ɏ֐-ࣿ]/)?.[0] ?? ''
  return /[֐-ࣿ]/.test(first) ? 'rtl' : 'ltr'
}
