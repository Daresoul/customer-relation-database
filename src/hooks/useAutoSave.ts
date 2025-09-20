import { useCallback, useRef, useEffect } from 'react';
import { debounce } from 'lodash';

interface UseAutoSaveOptions {
  onSave: (value: any) => void | Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave({ onSave, delay = 500, enabled = true }: UseAutoSaveOptions) {
  const saveRef = useRef(onSave);

  // Update ref on every render to get latest onSave
  useEffect(() => {
    saveRef.current = onSave;
  });

  const debouncedSave = useRef(
    debounce((value: any) => {
      if (enabled) {
        saveRef.current(value);
      }
    }, delay)
  ).current;

  const triggerSave = useCallback(
    (value: any) => {
      if (enabled) {
        debouncedSave(value);
      }
    },
    [debouncedSave, enabled]
  );

  // Cancel pending saves on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
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