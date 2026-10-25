/** A value no animal can have is marked "check on the machine". */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import LabValues from '../LabValues';

afterEach(cleanup);

describe('LabValues', () => {
  it('marks a value no animal can have', () => {
    render(
      <LabValues
        values={[
          { code: 'GLU', value: '-3', unit: 'mmol/L', range: '4-7', flag: 'L', implausible: true },
          { code: 'ALT', value: '82', unit: 'U/L', range: '10-140', flag: null, implausible: false },
        ]}
      />,
    );
    expect(screen.getByTestId('lab-value-GLU')).toHaveAttribute('title', expect.stringContaining('devices:inbox.implausible'));
    expect(screen.getByTestId('lab-value-ALT')).not.toHaveAttribute('title', expect.stringContaining('devices:inbox.implausible'));
  });
});
