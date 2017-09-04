'use strict';

const stream = require('stream');
const resumer = require('resumer');

const { Response } = require('../src/');
const Blob = require('../src/blob.js');

describe('Response class tests', () => {
  it('should support empty options in Response constructor', async () => {
    let body = resumer()
      .queue('a=1')
      .end();
    body = body.pipe(new stream.PassThrough());
    const res = new Response(body);
    const result = await res.text();
    expect(result).toBe('a=1');
  });

  it('should support parsing headers in Response constructor', () => {
    const res = new Response(null, {
      headers: {
        a: '1',
      },
    });
    expect(res.headers.get('a')).toBe('1');
  });

  it('should support text() method in Response constructor', async () => {
    const res = new Response('a=1');
    const result = await res.text();
    expect(result).toBe('a=1');
  });

  it('should support json() method in Response constructor', async () => {
    const res = new Response('{"a":1}');
    const result = await res.json();
    expect(result.a).toBe(1);
  });

  it('should support buffer() method in Response constructor', async () => {
    const res = new Response('a=1');
    const result = await res.buffer();
    expect(Buffer.isBuffer(result)).toBeTruthy();
    expect(result.toString()).toBe('a=1');
  });

  it('should support blob() method in Response constructor', async () => {
    const res = new Response('a=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    const result = await res.blob();
    expect(result).toBeInstanceOf(Blob);
    expect(result.isClosed).toBeFalsy();
    expect(result.size).toBe(3);
    expect(result.type).toBe('text/plain');

    result.close();
    expect(result.isClosed).toBeTruthy();
    expect(result.size).toBe(0);
    expect(result.type).toBe('text/plain');
  });

  it('should support clone() method in Response constructor', async () => {
    const base = 'https://localhost';
    let body = resumer()
      .queue('a=1')
      .end();
    body = body.pipe(new stream.PassThrough());
    const res = new Response(body, {
      headers: {
        a: '1',
      },
      url: base,
      status: 346,
      statusText: 'production',
    });
    const cl = res.clone();
    expect(cl.headers.get('a')).toBe('1');
    expect(cl.url).toBe(base);
    expect(cl.status).toBe(346);
    expect(cl.statusText).toBe('production');
    expect(cl.ok).toBeFalsy();
    // clone body shouldn't be the same body
    expect(cl.body).not.toBe(body);
    const result = await cl.text();
    expect(result).toBe('a=1');
  });

  it('should support stream as body in Response constructor', async () => {
    let body = resumer()
      .queue('a=1')
      .end();
    body = body.pipe(new stream.PassThrough());
    const res = new Response(body);
    const result = await res.text();
    expect(result).toBe('a=1');
  });

  it('should support string as body in Response constructor', async () => {
    const res = new Response('a=1');
    const result = await res.text();
    expect(result).toBe('a=1');
  });

  it('should support buffer as body in Response constructor', async () => {
    const res = new Response(Buffer.from('a=1'));
    const result = await res.text();
    expect(result).toBe('a=1');
  });

  it('should support blob as body in Response constructor', async () => {
    const res = new Response(new Blob(['a=1']));
    const result = await res.text();
    expect(result).toBe('a=1');
  });

  it('should default to null as body', async () => {
    const res = new Response();
    expect(res.body).toBeNull();
    expect(await res.text()).toBe('');
  });

  it('should default to 200 as status code', () => {
    const res = new Response(null);
    expect(res.status).toBe(200);
  });
});
