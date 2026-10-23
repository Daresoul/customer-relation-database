/** A result the app could not read says why in the app language; the machine's raw words stay as detail. */
import { describe, it, expect } from 'vitest';
import { labFailureText } from '../labFailure';

const t = (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key);

describe('labFailureText', () => {
  it('says a cut-off result stopped and what to do', () => {
    expect(labFailureText('Result stopped after 929 bytes', t)).toEqual({
      text: 'devices:inbox.failure.cutOff {"bytes":929}',
      detail: 'Result stopped after 929 bytes',
    });
  });

  it('calls anything else unreadable and keeps the parser message as detail', () => {
    expect(labFailureText('Failed to parse OBX segment 3: missing field', t)).toEqual({
      text: 'devices:inbox.failure.unreadable',
      detail: 'Failed to parse OBX segment 3: missing field',
    });
  });

  it('has nothing to say without an error', () => {
    expect(labFailureText(null, t)).toBeNull();
  });
});
