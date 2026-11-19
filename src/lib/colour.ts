import { contrast } from '../../config/schema';

/** Text colour to use on top of `bg`: the brand ink if it reads (4.5:1), else white, else black. */
export function onColour(bg: string, ink: string) {
  if (contrast(ink, bg) >= 4.5) return ink;
  if (contrast('#ffffff', bg) >= 4.5) return '#ffffff';
  return '#000000';
}
