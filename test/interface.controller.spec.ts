import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, RequestMethod } from '@nestjs/common';
import * as request from 'supertest';
import { InterfaceController } from '../src/interface/interface.controller';

describe('InterfaceController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InterfaceController],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('1.0', {
      exclude: [
        { path: '/', method: RequestMethod.GET },
        { path: 'interface', method: RequestMethod.GET },
        { path: 'interface/(.*)', method: RequestMethod.GET },
      ],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / should return the dashboard HTML', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<title>Kwik Mock');
    expect(res.text).toContain('id="counters"');
  });

  it('GET /interface should return the dashboard HTML', async () => {
    const res = await request(app.getHttpServer()).get('/interface');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<title>Kwik Mock');
  });

  it('GET /interface/records/payments should return SPA HTML for client routing', async () => {
    const res = await request(app.getHttpServer()).get('/interface/records/payments');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('id="record-table"');
  });

  it('GET /interface/records/bank_accounts should return SPA HTML after reload', async () => {
    const res = await request(app.getHttpServer()).get('/interface/records/bank_accounts');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('id="record-table"');
  });

  it('GET /interface/webhooks should return SPA HTML for deep link', async () => {
    const res = await request(app.getHttpServer()).get('/interface/webhooks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="webhook-table"');
  });

  it('GET /interface/assets/styles.css should serve CSS', async () => {
    const res = await request(app.getHttpServer()).get('/interface/assets/styles.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('GET /interface/assets/app.js should serve JavaScript', async () => {
    const res = await request(app.getHttpServer()).get('/interface/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.text).toContain('/admin/interface-data');
  });

  it('GET /interface/assets/unknown.txt should 404', async () => {
    const res = await request(app.getHttpServer()).get('/interface/assets/unknown.txt');
    expect(res.status).toBe(404);
  });
});
