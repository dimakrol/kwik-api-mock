import {
  sanitizeHeaders,
  sanitizePayload,
} from '../src/common/logging/sanitize-payload.util';

describe('sanitize-payload.util', () => {
  it('redacts sensitive keys', () => {
    expect(
      sanitizePayload({
        access_secret: 'secret',
        payments_id: 'pay_1',
      }),
    ).toEqual({
      access_secret: '[REDACTED]',
      payments_id: 'pay_1',
    });
  });

  it('redacts authorization header', () => {
    expect(
      sanitizeHeaders({
        authorization: 'Basic abc',
        'content-type': 'application/json',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      'content-type': 'application/json',
    });
  });
});
