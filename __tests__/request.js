'use strict';

const FormData = require('form-data');
const resumer = require('resumer');
const stream = require('stream');
const http = require('http');

const { Request } = require('../src/');
const Blob = require('../src/blob.js');

const url = 'https://localhost/';

describe('Request class tests', () => {
  it('should support wrapping Request instance', () => {
    const form = new FormData();
    form.append('a', '1');

    const r1 = new Request(url, {
      method: 'POST',
      follow: 1,
      body: form,
    });
    const r2 = new Request(r1, {
      follow: 2,
    });

    expect(r2.url).toBe(url);
    expect(r2.method).toBe('POST');
    // note that we didn't clone the body
    expect(r2.body).toBe(form);
    expect(r1.follow).toBe(1);
    expect(r2.follow).toBe(2);
    expect(r1.counter).toBe(0);
    expect(r2.counter).toBe(0);
  });

  it('should throw error with GET/HEAD requests with body', () => {
    expect(() => new Request('.', { body: '' })).toThrow(TypeError);
    expect(() => new Request('.', { body: 'a' })).toThrow(TypeError);
    expect(() => new Request('.', { body: '', method: 'HEAD' })).toThrow(
      TypeError,
    );
    expect(() => new Request('.', { body: 'a', method: 'HEAD' })).toThrow(
      TypeError,
    );
  });

  it('should default to null as body', async () => {
    const req = new Request('.');
    expect(req.body).toBeNull();

    expect(await req.text()).toBe('');
  });

  it('should support parsing headers in Request constructor', () => {
    const req = new Request(url, {
      headers: {
        a: '1',
      },
    });
    expect(req.url).toBe(url);
    expect(req.headers.get('a')).toBe('1');
  });

  it('should support arrayBuffer() method in Request constructor', async () => {
    const req = new Request(url, {
      method: 'POST',
      body: 'a=1',
    });
    expect(req.url).toBe(url);
    const result = await req.arrayBuffer();
    expect(result.constructor.name).toBe('ArrayBuffer');
    const str = String.fromCharCode.apply(null, new Uint8Array(result));
    expect(str).toBe('a=1');
  });

  it('should support text() method in Request constructor', async () => {
    const req = new Request(url, {
      method: 'POST',
      body: 'a=1',
    });
    expect(req.url).toBe(url);
    const result = await req.text();
    expect(result).toBe('a=1');
  });

  it('should support json() method in Request constructor', async () => {
    const req = new Request(url, {
      method: 'POST',
      body: '{"a":1}',
    });
    expect(req.url).toBe(url);
    const result = await req.json();
    expect(result.a).toBe(1);
  });

  it('should support buffer() method in Request constructor', async () => {
    const req = new Request(url, {
      method: 'POST',
      body: 'a=1',
    });
    expect(req.url).toBe(url);
    const result = await req.buffer();
    expect(Buffer.isBuffer(result)).toBeTruthy();
    expect(result.toString()).toBe('a=1');
  });

  it('should support blob() method in Request constructor', async () => {
    const req = new Request(url, {
      method: 'POST',
      body: Buffer.from('a=1'),
    });
    expect(req.url).toBe(url);
    const result = await req.blob();
    expect(result).toBeInstanceOf(Blob);
    expect(result.isClosed).toBeFalsy();
    expect(result.size).toBe(3);
    expect(result.type).toBe('');

    result.close();
    expect(result.isClosed).toBeTruthy();
    expect(result.size).toBe(0);
    expect(result.type).toBe('');
  });

  it('should support arbitrary url in Request constructor', () => {
    const req = new Request('anything');
    expect(req.url).toBe('anything');
  });

  it('should support clone() method in Request constructor', async () => {
    let body = resumer()
      .queue('a=1')
      .end();
    body = body.pipe(new stream.PassThrough());
    const agent = new http.Agent();
    const req = new Request(url, {
      body,
      method: 'POST',
      redirect: 'manual',
      headers: {
        b: '2',
      },
      follow: 3,
      compress: false,
      agent,
    });
    const cl = req.clone();
    expect(cl.url).toBe(url);
    expect(cl.method).toBe('POST');
    expect(cl.redirect).toBe('manual');
    expect(cl.headers.get('b')).toBe('2');
    expect(cl.follow).toBe(3);
    expect(cl.compress).toBe(false);
    expect(cl.method).toBe('POST');
    expect(cl.counter).toBe(0);
    expect(cl.agent).toBe(agent);
    // clone body shouldn't be the same body
    expect(cl.body).not.toBe(body);
    expect(await Promise.all([cl.text(), req.text()])).toEqual(['a=1', 'a=1']);
  });
});
