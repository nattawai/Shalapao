import { describe, expect, test } from 'vitest';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

describe('typed domain errors', () => {
  test('แต่ละชนิดเป็นทั้ง AppError และ Error · พก code + message', () => {
    const e = new ForbiddenError('forbidden', 'ห้ามเข้าถึง');
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('forbidden');
    expect(e.message).toBe('ห้ามเข้าถึง');
  });

  test('ชนิดต่างกันแยกด้วย instanceof ได้ (route ใช้ map เป็น status)', () => {
    expect(new ValidationError('v', 'x')).toBeInstanceOf(ValidationError);
    expect(new ForbiddenError('f', 'x')).not.toBeInstanceOf(ValidationError);
    expect(new NotFoundError('n', 'x')).toBeInstanceOf(NotFoundError);
    expect(new ConflictError('c', 'x')).toBeInstanceOf(ConflictError);
  });

  test('name เท่ากับชื่อคลาส — อ่าน log ออกว่าเป็น failure ชนิดไหน', () => {
    expect(new ConflictError('c', 'x').name).toBe('ConflictError');
    expect(new ValidationError('v', 'x').name).toBe('ValidationError');
  });
});
