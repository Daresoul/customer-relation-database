import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InputNumber } from 'antd';
import { parseLocaleNumber, localeNumberParser, parseLocaleMoney, localeMoneyParser } from '../localeNumber';

afterEach(cleanup);

describe('parseLocaleNumber', () => {
  it.each([
    ['4,5', 4.5],
    ['4.5', 4.5],
    ['250,50', 250.5],
    ['0,8', 0.8],
    ['1.500,50', 1500.5],
    ['1,500.50', 1500.5],
    ['1.500.000', 1500000],
    ['1 500', 1500],
    ['ден 150,50', 150.5],
    ['12,5%', 12.5],
    ['-3,25', -3.25],
    ['42', 42],
  ])('%s -> %s', (text, expected) => {
    expect(parseLocaleNumber(text)).toBe(expected);
  });

  it('reads a single dot as the decimal mark ("1.500" is one and a half)', () => {
    expect(parseLocaleNumber('1.500')).toBe(1.5);
  });

  it.each(['', '  ', 'abc', '-', ','])('%j is no number', (text) => {
    expect(parseLocaleNumber(text)).toBeNull();
  });
});

describe('InputNumber with localeNumberParser', () => {
  it('turns a typed decimal comma into a decimal value', () => {
    const onChange = vi.fn();
    render(<InputNumber aria-label="weight" parser={localeNumberParser} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('weight'), { target: { value: '4,5' } });

    expect(onChange).toHaveBeenLastCalledWith(4.5);
  });
});

describe('parseLocaleMoney', () => {
  it.each([
    ['1.500', 1500],
    ['2.500', 2500],
    ['1,500', 1500],
    ['12.000', 12000],
    ['250,50', 250.5],
    ['2.50', 2.5],
    ['1.500,50', 1500.5],
    ['1,500.50', 1500.5],
    ['1500', 1500],
    ['0,5', 0.5],
    ['1234.567', 1234.567],
  ])('%s -> %s', (text, expected) => {
    expect(parseLocaleMoney(text)).toBe(expected);
  });
});

describe('localeMoneyParser in an InputNumber', () => {
  it('reads a dotted thousand as a thousand', () => {
    const onChange = vi.fn();
    render(<InputNumber aria-label="price" precision={2} parser={localeMoneyParser} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('price'), { target: { value: '1.500' } });
    expect(onChange).toHaveBeenLastCalledWith(1500);
  });
});
