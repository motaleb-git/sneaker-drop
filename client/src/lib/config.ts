let holdSeconds = 60;

export function setHoldSeconds(seconds: number): void {
  if (Number.isInteger(seconds) && seconds > 0) holdSeconds = seconds;
}

export function getHoldSeconds(): number {
  return holdSeconds;
}
