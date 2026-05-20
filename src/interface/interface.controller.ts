import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STATIC_ROOT = join(__dirname, 'static');

const ASSETS: Record<string, { file: string; type: string }> = {
  'app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
  'styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

function readStatic(name: string): string {
  const target = join(STATIC_ROOT, name);
  if (!existsSync(target)) {
    throw new NotFoundException(`Static asset ${name} not found`);
  }
  return readFileSync(target, 'utf8');
}

@ApiExcludeController()
@Controller()
export class InterfaceController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRoot(): string {
    return readStatic('index.html');
  }

  @Get('interface/assets/:asset')
  getAsset(@Param('asset') asset: string, @Res() res: Response): void {
    const entry = ASSETS[asset];
    if (!entry) {
      throw new NotFoundException(`Unknown asset ${asset}`);
    }
    res.setHeader('Content-Type', entry.type);
    res.send(readStatic(entry.file));
  }

  @Get('interface')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getInterfaceRoot(): string {
    return readStatic('index.html');
  }

  /** SPA fallback — Nest registers only the first path when stacking multiple @Get on one handler. */
  @Get('interface/:path(.*)')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getInterfaceSpa(@Param('path') path: string): string {
    if (path.startsWith('assets/')) {
      throw new NotFoundException(`Unknown asset ${path}`);
    }
    return readStatic('index.html');
  }
}
