import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn — helper de fusion de classes Tailwind (convention shadcn/ui).
// Combine clsx (conditionnel) + tailwind-merge (déduplication des classes en conflit).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
