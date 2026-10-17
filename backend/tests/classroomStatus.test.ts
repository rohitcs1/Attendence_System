import { describe, expect, it } from 'vitest';
import { classroomStatus } from '../src/services/classroomStatus.js';

describe('classroom status invariant', () => {
  it('uses green only for a valid active session', () => {
    expect(classroomStatus(true)).toBe('GREEN');
  });
  it('uses red when no valid active session exists', () => {
    expect(classroomStatus(false)).toBe('RED');
  });
});
