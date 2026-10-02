import { describe, expect, it } from 'vitest';
import { bodyFieldPath } from './problem';

describe('bodyFieldPath', () => {
  it('maps a body pointer to a react-hook-form path, unescaping ~1 and ~0', () => {
    expect(bodyFieldPath('/body/owner/email')).toBe('owner.email');
    expect(bodyFieldPath('/body/items/0/name')).toBe('items.0.name');
    expect(bodyFieldPath('/body/a~1b/c~0d/e~01')).toBe('a/b.c~d.e~1');
  });

  it('gives no field for pointers outside the body', () => {
    expect(bodyFieldPath('/query/page')).toBeUndefined();
    expect(bodyFieldPath('/path/id')).toBeUndefined();
  });
});
