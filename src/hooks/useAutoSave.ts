import { useCallback, useRef, useEffect } from 'react';
import { debounce } from 'lodash';

interface UseAutoSaveOptions<T> {
  onSave: (value: T) => void | Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave<T>({ onSave, delay = 500, enabled = true }: UseAutoSaveOptions<T>) {
  const saveRef = useRef(onSave);

  // Update ref on every render to get latest onSave
  useEffect(() => {
    saveRef.current = onSave;
  });

  // The handler is taken when the edit is made: by the time the delay ends the
  // page may show another patient, whose handler would save onto them.
  const debouncedSave = useRef(
    debounce((value: T, save: (value: T) => void | Promise<void>) => {
      save(value);
    }, delay)
  ).current;

  const triggerSave = useCallback(
    (value: T) => {
      if (enabled) {
        debouncedSave(value, saveRef.current);
      }
    },
    [debouncedSave, enabled]
  );

  // Leaving the page right after typing still saves what was typed.
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  return {
    triggerSave,
    cancelSave: () => debouncedSave.cancel(),
    flushSave: () => debouncedSave.flush(),
  };
}

// Hook for inline field editing with auto-save
export function useInlineEdit<T>({
  value,
  onSave,
  validate,
}: {
  value: T;
  onSave: (newValue: T) => void | Promise<void>;
  validate?: (value: T) => boolean | string;
}) {
  const { triggerSave } = useAutoSave({ onSave });

  const handleChange = useCallback(
    (newValue: T) => {
      if (validate) {
        const validation = validate(newValue);
        if (validation === true) {
          triggerSave(newValue);
          return { success: true };
        } else {
          return { success: false, error: typeof validation === 'string' ? validation : 'Invalid value' };
        }
      } else {
        triggerSave(newValue);
        return { success: true };
      }
    },
    [triggerSave, validate]
  );

  return {
    value,
    onChange: handleChange,
  };
}