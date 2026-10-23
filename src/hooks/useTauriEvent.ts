import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Listens to a Tauri event while the component is mounted. The handler of
 * the latest render is called (no stale closures), and an unmount before
 * `listen` resolved still removes the listener.
 */
export function useTauriEvent<T = unknown>(name: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<T>(name, (event) => handlerRef.current(event.payload))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => console.error(`Could not listen to ${name}:`, error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [name]);
}
