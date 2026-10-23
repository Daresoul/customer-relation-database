import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInlineEdit } from '../useAutoSave';

describe('useInlineEdit', () => {
  it('saves a pending edit when the page goes away before the delay ends', () => {
    const onSave = vi.fn();
    const { result, unmount } = renderHook(() => useInlineEdit({ value: 'old', onSave }));

    result.current.onChange('new');
    unmount();

    expect(onSave).toHaveBeenCalledWith('new');
  });
});
