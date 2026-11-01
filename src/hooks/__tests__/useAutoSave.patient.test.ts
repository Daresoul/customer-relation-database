import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';

// Final review (low): a save still waiting when staff opened another patient
// ran the new patient's handler, writing the edit onto that patient.
describe('useAutoSave', () => {
  it("saves with the handler of the moment the edit was made, not a later page's", () => {
    const savePatientA = vi.fn();
    const savePatientB = vi.fn();
    const { result, rerender } = renderHook(({ onSave }) => useAutoSave<string>({ onSave }), {
      initialProps: { onSave: savePatientA },
    });

    act(() => result.current.triggerSave('red'));
    rerender({ onSave: savePatientB });
    act(() => result.current.flushSave());

    expect(savePatientA).toHaveBeenCalledWith('red');
    expect(savePatientB).not.toHaveBeenCalled();
  });
});
