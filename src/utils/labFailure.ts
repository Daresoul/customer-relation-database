type T = (key: string, options?: Record<string, unknown>) => string;

export function labFailureText(_error: string | null | undefined, _t: T): { text: string; detail: string } | null {
  return null;
}
