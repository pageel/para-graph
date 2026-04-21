/**
 * Test fixture: File that imports from simple-class.
 */
import { Calculator } from './simple-class';

export function compute(x: number, y: number): number {
  const calc = new Calculator();
  return calc.add(x, y);
}
