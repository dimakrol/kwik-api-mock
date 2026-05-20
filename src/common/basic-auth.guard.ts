import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { mockConfig } from './mock-config';

const unauthorized = () =>
  new UnauthorizedException({
    status: false,
    error_code: '001',
    error_message: 'Invalid API key provided.',
  });

@Injectable()
export class BasicAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    const apiKey = req.header('x-kwik-api-key');
    if (apiKey) {
      if (mockConfig.authMode === 'strict' && apiKey !== mockConfig.mockAccessKey) {
        throw unauthorized();
      }
      return true;
    }

    const header = req.header('authorization') ?? '';
    if (!header.startsWith('Basic ')) throw unauthorized();

    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      if (!decoded.includes(':')) throw new Error('bad format');

      if (mockConfig.authMode === 'strict') {
        const colonIdx = decoded.indexOf(':');
        const key = decoded.substring(0, colonIdx);
        const secret = decoded.substring(colonIdx + 1);
        if (key !== mockConfig.mockAccessKey || secret !== mockConfig.mockAccessSecret) {
          throw unauthorized();
        }
      }
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw unauthorized();
    }
  }
}
