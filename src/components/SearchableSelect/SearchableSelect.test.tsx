/**
 * Regression tests for SearchableSelect — specifically the v0.5.15
 * "breed dropdown shows ID instead of name" bug.
 *
 * The bug: option values are strings (`"5"`), but consumers wrap the
 * Form.Item with `getValueFromEvent={(v) => Number(v)}` to feed a
 * numeric ID to the backend. After selection the form state holds a
 * number, which the component then re-renders as the AutoComplete's
 * `value` prop. Two failure modes:
 *
 *   1. Strict `option.value === value` lookup fails (string vs number)
 *      so the selected option can't be found.
 *   2. Even if found, `<AutoComplete value={x}>` displays `x` literally
 *      in the input — so the raw ID leaks out instead of the human
 *      label.
 *
 * The fix:
 *   - Coerce both sides of the lookup to string.
 *   - Compute `displayValue` as `searchText || selectedOption.label
 *     || fallback`, and pass that (not `value`) to AutoComplete.
 *   - Widen the value prop type to `string | number | null |
 *     undefined`.
 *
 * Each test below exercises one specific aspect so a future regression
 * fails at the most informative test.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from './SearchableSelect';

const BREEDS = [
  { value: '1', label: 'Labrador Retriever' },
  { value: '2', label: 'Poodle' },
  { value: '3', label: 'German Shepherd' },
];

afterEach(() => {
  cleanup();
});

describe('SearchableSelect — display label, not value', () => {
  it('shows the human label when value is a numeric ID matching an option', () => {
    // The regression case: form state is a number (after
    // getValueFromEvent coerces "2" → 2). Component receives value={2}.
    // Pre-fix: input rendered "2". Post-fix: input renders "Poodle".
    render(<SearchableSelect value={2 as any} options={BREEDS} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('Poodle');
  });

  it('shows the human label when value is a string ID matching an option', () => {
    // The non-coerced case — option lookup still works with String===String.
    render(<SearchableSelect value="3" options={BREEDS} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('German Shepherd');
  });

  it('shows nothing when value is null', () => {
    render(<SearchableSelect value={null} options={BREEDS} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('shows nothing when value is undefined', () => {
    render(<SearchableSelect value={undefined} options={BREEDS} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('falls back to the raw id only while options have not loaded', () => {
    // Edge case during initial render: form value is set from an edit
    // but the options async-load is still pending. We'd rather show
    // the raw id briefly than nothing, so the user knows there IS a
    // selection — gets replaced with the label as soon as options
    // arrive.
    render(<SearchableSelect value={42 as any} options={[]} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('42');
  });

  it('shows nothing when value has no matching option AND options exist', () => {
    // The deleted-breed case: the form holds a stale id (5), options
    // have loaded (1, 2, 3), but 5 doesn't exist. Better to show
    // empty than the raw id — the user will notice the missing breed
    // visually and can pick a new one.
    render(<SearchableSelect value={5 as any} options={BREEDS} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

describe('SearchableSelect — selection flow', () => {
  it('calls onChange with the option value (string) when one is picked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchableSelect
        value={undefined}
        onChange={onChange}
        options={BREEDS}
      />,
    );

    // Click into the AutoComplete and pick "Poodle" from the dropdown.
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Poo');
    const option = await screen.findByText('Poodle');
    await user.click(option);

    // The onChange handler always receives the option's `value`
    // (typed as string). Consumers using getValueFromEvent can convert
    // to a number for the form's stored representation.
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('after selection, the input renders the picked label not the id', async () => {
    // Simulates the full Form.Item round-trip: pick an option, get the
    // value back via onChange, re-render with the new value (as it
    // would arrive from form state). The displayed text should be the
    // label, regardless of whether the round-tripped value comes back
    // as the string "2" or the number 2.
    let formValue: string | number | undefined;
    const onChange = vi.fn((v: string) => {
      // Mimic getValueFromEvent: convert numeric strings to number.
      formValue = /^\d+$/.test(v) ? Number(v) : v;
    });
    const user = userEvent.setup();

    const { rerender } = render(
      <SearchableSelect
        value={formValue}
        onChange={onChange}
        options={BREEDS}
      />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Lab');
    const option = await screen.findByText('Labrador Retriever');
    await user.click(option);

    // After re-render with the new form value (number 1, post-coerce):
    rerender(
      <SearchableSelect
        value={formValue}
        onChange={onChange}
        options={BREEDS}
      />,
    );

    expect((input as HTMLInputElement).value).toBe('Labrador Retriever');
    expect(formValue).toBe(1);
  });
});

describe('SearchableSelect — clear behavior', () => {
  it('calls onChange with empty string when AutoComplete clear fires', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        value={2 as any}
        onChange={onChange}
        options={BREEDS}
      />,
    );
    // Simulate the underlying AutoComplete clear: it fires onChange
    // with an empty string. Easier to assert via direct event than to
    // hunt down AntD's clear button across versions.
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
  });
});
