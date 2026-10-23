/**
 * Macedonian numbers have 9 digits (070 111 222) or 8 (02 3100 200). A check
 * for "at least 10 digits" made every new household with a phone fail.
 */
import { describe, it, expect } from 'vitest';
import { validateHouseholdDto, type CreateHouseholdWithPeopleDto } from '../household';

const withPhone = (phone: string): CreateHouseholdWithPeopleDto => ({
  household: { householdName: 'Петровски' },
  people: [{
    person: { first_name: 'Петар', last_name: 'Петровски', is_primary: true },
    contacts: [{ contact_type: 'phone', contact_value: phone, is_primary: true }],
  }],
});

describe('household phone numbers', () => {
  it('accepts Macedonian mobile and landline numbers', () => {
    expect(validateHouseholdDto(withPhone('070 111 222'))).toBeNull();
    expect(validateHouseholdDto(withPhone('02 3100 200'))).toBeNull();
    expect(validateHouseholdDto(withPhone('+389 70 111 222'))).toBeNull();
  });

  it('still refuses something that is not a phone number', () => {
    expect(validateHouseholdDto(withPhone('12'))).not.toBeNull();
    expect(validateHouseholdDto(withPhone('ask at desk'))).not.toBeNull();
  });
});
