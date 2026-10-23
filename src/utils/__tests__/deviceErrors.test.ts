import { describe, it, expect } from 'vitest';
import { portInUseBy } from '../deviceErrors';

// device-health #15: a second machine on a used port is refused by the backend.
describe('portInUseBy', () => {
  it('names the machine that already uses the port', () => {
    expect(portInUseBy('port_in_use:Healvet')).toBe('Healvet');
    expect(portInUseBy(new Error('port_in_use:Blood analyzer'))).toBe('Blood analyzer');
    expect(portInUseBy({ message: 'port_in_use:PCR' })).toBe('PCR');
  });

  it('is null for any other error', () => {
    expect(portInUseBy('Failed to update device integration')).toBeNull();
    expect(portInUseBy(undefined)).toBeNull();
  });
});
