'use strict';

// test tools
const { spawn } = require('child_process');
const stream = require('stream');
const resumer = require('resumer');
const FormData = require('form-data');
const { parse: parseURL, URL } = require('url');
const http = require('http');
const fs = require('fs');

const TestServer = require('./lib/server');
const streamToBuffer = require('./lib/streamToBuffer');

// test subjects
const fetch = require('../src/');

const { FetchError, Headers, Request, Response } = fetch;
const FetchErrorOrig = require('../src/fetch-error.js');
const HeadersOrig = require('../src/headers.js');
const RequestOrig = require('../src/request.js');
const ResponseOrig = require('../src/response.js');
const Body = require('../src/body.js');
const Blob = require('../src/blob.js');

const local = new TestServer();
const base = `http://${local.hostname}:${local.port}/`;
const redirectBase = `http://127.0.0.1:${local.port}/`;

describe('@destinationstransfers/fetch', () => {
  beforeAll(done => {
    local.start(done);
  });

  afterAll(done => {
    local.stop(done);
  });

  it('should return a promise', () => {
    const p = fetch('http://example.com/');
    expect(p).toBeInstanceOf(Promise);
  });

  it('should expose Headers, Response and Request constructors', () => {
    expect(FetchError).toBe(FetchErrorOrig);
    expect(Headers).toBe(HeadersOrig);
    expect(Response).toBe(ResponseOrig);
    expect(Request).toBe(RequestOrig);
  });

  it('should reject with error if url is protocol relative', async () => {
    expect.assertions(1);
    await expect(fetch('//example.com/')).rejects.toEqual(
      expect.objectContaining({ message: 'Only absolute URLs are supported' }),
    );
  });

  it('should reject with error if url is relative path', async () => {
    expect.assertions(1);
    await expect(fetch('/some/path')).rejects.toEqual(
      expect.objectContaining({ message: 'Only absolute URLs are supported' }),
    );
  });

  it('should reject with error if protocol is unsupported', async () => {
    expect.assertions(1);
    await expect(fetch('ftp://example.com/')).rejects.toEqual(
      expect.objectContaining({
        message: 'Only HTTP(S) protocols are supported',
      }),
    );
  });

  it('should reject with error on network failure', async () => {
    expect.assertions(1);
    await expect(fetch('http://localhost:50000/')).rejects.toEqual(
      expect.objectContaining({
        type: 'system',
        code: 'ECONNREFUSED',
        errno: 'ECONNREFUSED',
      }),
    );
  });

  it('should resolve into response', async () => {
    const url = `${base}hello`;
    const res = await fetch(`${base}hello`);
    expect(res).toBeInstanceOf(Response);
    expect(res.headers).toBeInstanceOf(Headers);
    expect(res.body).toBeInstanceOf(stream.Transform);
    expect(res.bodyUsed).toBeFalsy();

    expect(res.url).toBe(url);
    expect(res.ok).toBeTruthy();
    expect(res.status).toBe(200);
    expect(res.statusText).toBe('OK');
  });

  it('should accept plain text response', async () => {
    const res = await fetch(`${base}plain`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(res.bodyUsed).toBeTruthy();
    expect(result).toBe('text');
  });

  it('should accept html response (like plain text)', async () => {
    const res = await fetch(`${base}html`);
    expect(res.headers.get('content-type')).toMatch('text/html');
    const result = await res.text();
    expect(res.bodyUsed).toBeTruthy();
    expect(result).toBe('<html></html>');
  });

  it('should accept json response', async () => {
    const res = await fetch(`${base}json`);
    expect(res.headers.get('content-type')).toMatch('application/json');
    const result = await res.json();
    expect(res.bodyUsed).toBeTruthy();
    expect(result).toMatchObject({ name: 'value' });
  });

  it('should send request with custom headers', async () => {
    const res = await fetch(`${base}inspect`, {
      headers: { 'x-custom-header': 'abc' },
    });
    const result = await res.json();
    expect(result.headers['x-custom-header']).toBe('abc');
  });

  it('should accept headers instance', async () => {
    const res = await fetch(`${base}inspect`, {
      headers: new Headers({ 'x-custom-header': 'abc' }),
    });
    const result = await res.json();
    expect(result.headers['x-custom-header']).toBe('abc');
  });

  it('should accept custom host header', async () => {
    const res = await fetch(`${base}inspect`, {
      headers: {
        host: 'example.com',
      },
    });
    const result = await res.json();
    expect(result.headers.host).toBe('example.com');
  });

  it('should follow redirect code 301', async () => {
    const res = await fetch(`${base}redirect/301`);
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
    expect(res.ok).toBeTruthy();
  });

  it('should follow redirect code 302', async () => {
    const res = await fetch(`${base}redirect/302`);
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
  });

  it('should follow redirect code 303', async () => {
    const res = await fetch(`${base}redirect/303`);
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
  });

  it('should follow redirect code 307', async () => {
    const res = await fetch(`${base}redirect/307`);
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
  });

  it('should follow redirect code 308', async () => {
    const res = await fetch(`${base}redirect/308`);
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
  });

  it('should follow redirect chain', async () => {
    const res = await fetch(`${base}redirect/chain`);
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
  });

  it('should remove authorization header on redirect if hostname changed', async () => {
    const res = await fetch(`${base}redirect/host/different`, {
      headers: new Headers({ authorization: 'abc' }),
    });
    expect(res.url).toBe(`${redirectBase}inspect`);
    const result = await res.json();
    expect(result.headers.authorization).toBeUndefined();
  });

  it('should preserve authorization header on redirect if hostname did not change', async () => {
    const res = await fetch(`${base}redirect/host/same`, {
      headers: new Headers({ authorization: 'abc' }),
    });
    expect(res.url).toBe(`${base}inspect`);
    const result = await res.json();
    expect(result.headers.authorization).toBe('abc');
  });

  it('should preserve authorization header on redirect if url is relative', async () => {
    const res = await fetch(`${base}redirect/host/relativeuri`, {
      headers: new Headers({ authorization: 'abc' }),
    });
    expect(res.url).toBe(`${base}inspect`);
    const result = await res.json();
    expect(result.headers.authorization).toBe('abc');
  });

  it('should preserve authorization header on redirect if url is protocol relative', async () => {
    const res = await fetch(`${base}redirect/host/protocolrelative`, {
      headers: new Headers({ authorization: 'abc' }),
    });
    expect(res.url).toBe(`${base}inspect`);
    const result = await res.json();
    expect(result.headers.authorization).toBe('abc');
  });

  it('should follow POST request redirect code 301 with GET', async () => {
    const res = await fetch(`${base}redirect/301`, {
      method: 'POST',
      body: 'a=1',
    });
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.method).toBe('GET');
    expect(result.body).toBe('');
  });

  it('should follow POST request redirect code 302 with GET', async () => {
    const res = await fetch(`${base}redirect/302`, {
      method: 'POST',
      body: 'a=1',
    });
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.method).toBe('GET');
    expect(result.body).toBe('');
  });

  it('should follow redirect code 303 with GET', async () => {
    const res = await fetch(`${base}redirect/303`, {
      method: 'PUT',
      body: 'a=1',
    });
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.method).toBe('GET');
    expect(result.body).toBe('');
  });

  it('should obey maximum redirect, reject case', async () => {
    await expect(
      fetch(`${base}redirect/chain`, {
        follow: 1,
      }),
    ).rejects.toHaveProperty('type', 'max-redirect');
  });

  it('should obey redirect chain, resolve case', async () => {
    const res = await fetch(`${base}redirect/chain`, {
      follow: 2,
    });
    expect(res.url).toBe(`${base}inspect`);
    expect(res.status).toBe(200);
  });

  it('should allow not following redirect', async () => {
    await expect(
      fetch(`${base}redirect/301`, {
        follow: 0,
      }),
    ).rejects.toHaveProperty('type', 'max-redirect');
  });

  it('should support redirect mode, manual flag', async () => {
    const url = `${base}redirect/301`;
    const res = await fetch(url, {
      redirect: 'manual',
    });
    expect(res.url).toBe(url);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${base}inspect`);
  });

  it('should support redirect mode, error flag', async () => {
    await expect(
      fetch(`${base}redirect/301`, {
        redirect: 'error',
      }),
    ).rejects.toHaveProperty('type', 'no-redirect');
  });

  it('should support redirect mode, manual flag when there is no redirect', async () => {
    const url = `${base}hello`;
    const res = await fetch(url, {
      redirect: 'manual',
    });
    expect(res.url).toBe(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('should follow redirect code 301 and keep existing headers', async () => {
    const res = await fetch(`${base}redirect/301`, {
      headers: new Headers({ 'x-custom-header': 'abc' }),
    });
    expect(res.url).toBe(`${base}inspect`);
    const result = await res.json();
    expect(result.headers['x-custom-header']).toBe('abc');
  });

  it('should reject broken redirect', async () => {
    await expect(fetch(`${base}error/redirect`)).rejects.toHaveProperty(
      'type',
      'invalid-redirect',
    );
  });

  it('should not reject broken redirect under manual redirect', async () => {
    const url = `${base}error/redirect`;
    const res = await fetch(url, {
      redirect: 'manual',
    });
    expect(res.url).toBe(url);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBeNull();
  });

  it('should handle client-error response', async () => {
    const res = await fetch(`${base}error/400`);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.status).toBe(400);
    expect(res.statusText).toBe('Bad Request');
    expect(res.ok).toBeFalsy();
    const result = await res.text();
    expect(res.bodyUsed).toBeTruthy();
    expect(result).toMatch('client error');
  });

  it('should handle server-error response', async () => {
    const res = await fetch(`${base}error/500`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    expect(res.status).toBe(500);
    expect(res.statusText).toMatch('Internal Server Error');
    expect(res.ok).toBeFalsy();
    const result = await res.text();
    expect(res.bodyUsed).toBeTruthy();
    expect(result).toMatch('server error');
  });

  it('should handle network-error response', async () => {
    await expect(fetch(`${base}error/reset`)).rejects.toHaveProperty(
      'code',
      'ECONNRESET',
    );
  });

  it('should handle DNS-error response', async () => {
    await expect(fetch('http://domain.invalid')).rejects.toHaveProperty(
      'code',
      'ENOTFOUND',
    );
  });

  it('should reject invalid json response', async () => {
    const res = await fetch(`${base}error/json`);
    expect(res.headers.get('content-type')).toMatch('application/json');
    await expect(res.json()).rejects.toBeInstanceOf(Error);
  });

  it('should handle no content response', async () => {
    const res = await fetch(`${base}no-content`);
    expect(res.status).toBe(204);
    expect(res.statusText).toMatch('No Content');
    expect(res.ok).toBeTruthy();
    const result = await res.text();
    expect(result).toBe('');
  });

  it('should handle no content response with gzip encoding', async () => {
    const res = await fetch(`${base}no-content/gzip`);
    expect(res.status).toBe(204);
    expect(res.statusText).toMatch('No Content');
    expect(res.headers.get('content-encoding')).toMatch('gzip');
    expect(res.ok).toBeTruthy();
    const result = await res.text();
    expect(result).toBe('');
  });

  it('should handle not modified response', async () => {
    const res = await fetch(`${base}not-modified`);
    expect(res.status).toBe(304);
    expect(res.statusText).toMatch('Not Modified');
    expect(res.ok).toBeFalsy();
    const result = await res.text();
    expect(result).toBe('');
  });

  it('should handle not modified response with gzip encoding', async () => {
    const res = await fetch(`${base}not-modified/gzip`);
    expect(res.status).toBe(304);
    expect(res.statusText).toMatch('Not Modified');
    expect(res.headers.get('content-encoding')).toMatch('gzip');
    expect(res.ok).toBeFalsy();
    const result = await res.text();
    expect(result).toBe('');
  });

  it('should decompress gzip response', async () => {
    const res = await fetch(`${base}gzip`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(result).toMatch('hello world');
  });

  it('should decompress slightly invalid gzip response', async () => {
    const res = await fetch(`${base}gzip-truncated`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(result).toMatch('hello world');
  });

  it('should decompress deflate response', async () => {
    const res = await fetch(`${base}deflate`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(result).toMatch('hello world');
  });

  it('should decompress deflate raw response from old apache server', async () => {
    const res = await fetch(`${base}deflate-raw`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(result).toMatch('hello world');
  });

  it('should skip decompression if unsupported', async () => {
    const res = await fetch(`${base}sdch`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(result).toMatch('fake sdch string');
  });

  it('should reject if response compression is invalid', async () => {
    const res = await fetch(`${base}invalid-content-encoding`);
    expect(res.headers.get('content-type')).toMatch('text/plain');
    await expect(res.text()).rejects.toHaveProperty('code', 'Z_DATA_ERROR');
  });

  it('should allow disabling auto decompression', async () => {
    const res = await fetch(`${base}gzip`, {
      compress: false,
    });
    expect(res.headers.get('content-type')).toMatch('text/plain');
    const result = await res.text();
    expect(result).not.toBe('hello world');
  });

  it('should allow custom timeout', async () => {
    await expect(
      fetch(`${base}timeout`, {
        timeout: 100,
      }),
    ).rejects.toHaveProperty('type', 'request-timeout');
  });

  it('should allow custom timeout on response body', async () => {
    const res = await fetch(`${base}slow`, {
      timeout: 100,
    });
    expect(res.ok).toBeTruthy();
    await expect(res.text()).rejects.toHaveProperty('type', 'body-timeout');
  });

  it('should clear internal timeout on fetch response', done => {
    spawn('node', [
      '-e',
      `require('./')('${base}hello', { timeout: 5000 })`,
    ]).on('exit', done);
  });

  it('should clear internal timeout on fetch redirect', done => {
    spawn('node', [
      '-e',
      `require('./')('${base}redirect/301', { timeout: 5000 })`,
    ]).on('exit', done);
  });

  it('should clear internal timeout on fetch error', done => {
    spawn('node', [
      '-e',
      `require('./')('${base}error/reset', { timeout: 5000 })`,
    ]).on('exit', done);
  });

  it('should set default User-Agent', async () => {
    const res = await fetch(`${base}inspect`);
    const result = await res.json();
    expect(result.headers['user-agent'].startsWith('node-fetch/')).toBeTruthy();
  });

  it('should allow setting User-Agent', async () => {
    const res = await fetch(`${base}inspect`, {
      headers: {
        'user-agent': 'faked',
      },
    });
    const result = await res.json();
    expect(result.headers['user-agent']).toBe('faked');
  });

  it('should set default Accept header', async () => {
    const res = await fetch(`${base}inspect`);
    const result = await res.json();
    expect(result.headers.accept).toBe('*/*');
  });

  it('should allow setting Accept header', async () => {
    const res = await fetch(`${base}inspect`, {
      headers: {
        accept: 'application/json',
      },
    });
    const result = await res.json();
    expect(result.headers.accept).toMatch('application/json');
  });

  it('should allow POST request', async () => {
    const res = await fetch(`${base}inspect`, {
      method: 'POST',
    });
    const result = await res.json();
    expect(result.method).toBe('POST');
    expect(result.headers['transfer-encoding']).toBeUndefined();
    expect(result.headers['content-type']).toBeUndefined();
    expect(result.headers['content-length']).toBe('0');
  });

  it('should allow POST request with string body', async () => {
    const res = await fetch(`${base}inspect`, {
      method: 'POST',
      body: 'a=1',
    });
    const result = await res.json();
    expect(result.method).toBe('POST');
    expect(result.body).toBe('a=1');
    expect(result.headers['transfer-encoding']).toBeUndefined();
    expect(result.headers['content-type']).toBe('text/plain;charset=UTF-8');
    expect(result.headers['content-length']).toBe('3');
  });

  it('should allow POST request with buffer body', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      body: Buffer.from('a=1', 'utf-8'),
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(res.body).toBe('a=1');
    expect(res.headers['transfer-encoding']).toBeUndefined();
    expect(res.headers['content-type']).toBeUndefined();
    expect(res.headers['content-length']).toBe('3');
  });

  it('should allow POST request with blob body without type', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      body: new Blob(['a=1']),
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(res.body).toBe('a=1');
    expect(res.headers['transfer-encoding']).toBeUndefined();
    expect(res.headers['content-type']).toBeUndefined();
    expect(res.headers['content-length']).toBe('3');
  });

  it('should allow POST request with blob body with type', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      body: new Blob(['a=1'], {
        type: 'text/plain;charset=UTF-8',
      }),
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(res.body).toBe('a=1');
    expect(res.headers['transfer-encoding']).toBeUndefined();
    expect(res.headers['content-type']).toBe('text/plain;charset=utf-8');
    expect(res.headers['content-length']).toBe('3');
  });

  it('should allow POST request with readable stream as body', async () => {
    let body = resumer()
      .queue('a=1')
      .end();
    body = body.pipe(new stream.PassThrough());

    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      body,
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(res.body).toBe('a=1');
    expect(res.headers['transfer-encoding']).toMatch('chunked');
    expect(res.headers['content-type']).toBeUndefined();
    expect(res.headers['content-length']).toBeUndefined();
  });

  it('should allow POST request with form-data as body', async () => {
    const form = new FormData();
    form.append('a', '1');

    const r = await fetch(`${base}multipart`, {
      method: 'POST',
      body: form,
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(
      res.headers['content-type'].startsWith('multipart/form-data;boundary='),
    ).toBeTruthy();
    expect(typeof res.headers['content-length']).toBe('string');
    expect(res.body).toBe('a=1');
  });

  it('should allow POST request with form-data using stream as body', async () => {
    const form = new FormData();
    form.append('my_field', fs.createReadStream(__filename));

    const r = await fetch(`${base}multipart`, {
      method: 'POST',
      body: form,
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(
      res.headers['content-type'].startsWith('multipart/form-data;boundary='),
    ).toBeTruthy();
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.body).toContain('my_field=');
  });

  it('should allow POST request with form-data as body and custom headers', async () => {
    const form = new FormData();
    form.append('a', '1');

    const headers = form.getHeaders();
    headers.b = '2';

    const r = await fetch(`${base}multipart`, {
      method: 'POST',
      body: form,
      headers,
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(
      res.headers['content-type'].startsWith('multipart/form-data; boundary='),
    ).toBeTruthy();
    expect(typeof res.headers['content-length']).toBe('string');
    expect(res.headers.b).toBe('2');
    expect(res.body).toBe('a=1');
  });

  it('should allow POST request with object body', async () => {
    // note that fetch simply calls tostring on an object
    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      body: { a: 1 },
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(res.body).toBe('[object Object]');
    expect(res.headers['content-type']).toBe('text/plain;charset=UTF-8');
    expect(res.headers['content-length']).toBe('15');
  });

  it('should overwrite Content-Length if possible', async () => {
    // note that fetch simply calls tostring on an object
    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      headers: {
        'Content-Length': '1000',
      },
      body: 'a=1',
    });
    const res = await r.json();
    expect(res.method).toBe('POST');
    expect(res.body).toBe('a=1');
    expect(res.headers['transfer-encoding']).toBeUndefined();
    expect(res.headers['content-type']).toBe('text/plain;charset=UTF-8');
    expect(res.headers['content-length']).toBe('3');
  });

  it('should allow PUT request', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'PUT',
      body: 'a=1',
    });
    const res = await r.json();
    expect(res.method).toBe('PUT');
    expect(res.body).toBe('a=1');
  });

  it('should allow DELETE request', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'DELETE',
    });
    const res = await r.json();
    expect(res.method).toBe('DELETE');
  });

  it('should allow DELETE request with string body', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'DELETE',
      body: 'a=1',
    });
    const res = await r.json();
    expect(res.method).toBe('DELETE');
    expect(res.body).toBe('a=1');
    expect(res.headers['transfer-encoding']).toBeUndefined();
    expect(res.headers['content-length']).toBe('3');
  });

  it('should allow PATCH request', async () => {
    const r = await fetch(`${base}inspect`, {
      method: 'PATCH',
      body: 'a=1',
    });
    const res = await r.json();
    expect(res.method).toBe('PATCH');
    expect(res.body).toBe('a=1');
  });

  it('should allow HEAD request', async () => {
    const res = await fetch(`${base}hello`, {
      method: 'HEAD',
    });
    expect(res.status).toBe(200);
    expect(res.statusText).toBe('OK');
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.body).toBeInstanceOf(stream.Transform);
    expect(await res.text()).toBe('');
  });

  it('should allow HEAD request with content-encoding header', async () => {
    const res = await fetch(`${base}error/404`, {
      method: 'HEAD',
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(await res.text()).toBe('');
  });

  it('should allow OPTIONS request', async () => {
    const res = await fetch(`${base}options`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(200);
    expect(res.statusText).toBe('OK');
    expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    expect(res.body).toBeInstanceOf(stream.Transform);
  });

  it('should reject decoding body twice', async () => {
    const res = await fetch(`${base}plain`);
    expect(res.headers.get('content-type')).toBe('text/plain');
    await res.text();
    expect(res.bodyUsed).toBeTruthy();
    await expect(res.text()).rejects.toBeDefined();
  });

  it('should support maximum response size, multiple chunk', async () => {
    const res = await fetch(`${base}size/chunk`, {
      size: 5,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    await expect(res.text()).rejects.toHaveProperty('type', 'max-size');
  });

  it('should support maximum response size, single chunk', async () => {
    const res = await fetch(`${base}size/long`, {
      size: 5,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    await expect(res.text()).rejects.toHaveProperty('type', 'max-size');
  });

  it('should only use UTF-8 decoding with text()', async () => {
    const res = await fetch(`${base}encoding/euc-jp`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '<?xml version="1.0" encoding="EUC-JP"?><title>日本語</title>',
    );
  });

  it('should allow piping response body as stream', async () => {
    const res = await fetch(`${base}hello`);
    expect(res.body).toBeInstanceOf(stream.Transform);
    const buffer = await streamToBuffer(res.body);
    expect(buffer.toString()).toBe('world');
  });

  it('should allow cloning a response, and use both as stream', async () => {
    const res = await fetch(`${base}hello`);
    const r1 = res.clone();
    expect(res.body).toBeInstanceOf(stream.Transform);
    expect(r1.body).toBeInstanceOf(stream.Transform);
    const [buffer1, buffer2] = await Promise.all([
      streamToBuffer(res.body),
      streamToBuffer(r1.body),
    ]);
    expect(buffer1.compare(buffer2)).toBe(0);
    expect(buffer2.toString()).toBe('world');
  });

  it('should allow cloning a json response and log it as text response', async () => {
    const res = await fetch(`${base}json`);
    const r1 = res.clone();
    const [res1, res2] = await Promise.all([res.json(), r1.text()]);
    expect(res1).toEqual({ name: 'value' });
    expect(res2).toEqual('{"name":"value"}');
  });

  it('should not allow cloning a response after its been used', async () => {
    const res = await fetch(`${base}hello`);
    await res.text();
    expect(() => {
      res.clone();
    }).toThrow();
  });

  it('should send request with connection keep-alive if agent is provided', async () => {
    const r = await fetch(`${base}inspect`, {
      agent: new http.Agent({
        keepAlive: true,
      }),
    });
    const res = await r.json();
    expect(res.headers.connection).toBe('keep-alive');
  });

  it('should support fetch with Request instance', async () => {
    const url = `${base}hello`;
    const req = new Request(url);
    const res = await fetch(req);
    expect(res.url).toBe(url);
    expect(res.ok).toBeTruthy();
    expect(res.status).toBe(200);
  });

  it('should support fetch with Node.js URL object', async () => {
    const url = `${base}hello`;
    const urlObj = parseURL(url);
    const req = new Request(urlObj);
    const res = await fetch(req);
    expect(res.url).toBe(url);
    expect(res.ok).toBeTruthy();
    expect(res.status).toBe(200);
  });

  it('should support fetch with WHATWG URL object', async () => {
    const url = `${base}hello`;
    const urlObj = new URL(url);
    const req = new Request(urlObj);
    const res = await fetch(req);
    expect(res.url).toBe(url);
    expect(res.ok).toBeTruthy();
    expect(res.status).toBe(200);
  });

  it('should support blob round-trip', async () => {
    const res = await fetch(`${base}hello`);
    const blob = await res.blob();
    const length = blob.size;
    const type = blob.type;
    const r = await fetch(`${base}inspect`, {
      method: 'POST',
      body: blob,
    });
    const result = await r.json();
    expect(result.body).toBe('world');
    expect(result.headers['content-type']).toBe(type);
    expect(result.headers['content-length']).toBe(String(length));
  });

  it('should support overwrite Request instance', async () => {
    const req = new Request(`${base}inspect`, {
      method: 'POST',
      headers: {
        a: '1',
      },
    });
    const res = await fetch(req, {
      method: 'GET',
      headers: {
        a: '2',
      },
    });
    const body = await res.json();
    expect(body.method).toBe('GET');
    expect(body.headers.a).toBe('2');
  });

  it('should support arrayBuffer(), blob(), text(), json() and buffer() method in Body constructor', () => {
    const body = new Body('a=1');
    expect(typeof body.arrayBuffer).toBe('function');
    expect(typeof body.blob).toBe('function');
    expect(typeof body.text).toBe('function');
    expect(typeof body.json).toBe('function');
    expect(typeof body.buffer).toBe('function');
  });

  it('should create custom FetchError', () => {
    const systemError = new Error('system');
    systemError.code = 'ESOMEERROR';

    const err = new FetchError('test message', 'test-error', systemError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchError);
    expect(err.name).toBe('FetchError');
    expect(err.message).toBe('test message');
    expect(err.type).toBe('test-error');
    expect(err.code).toBe('ESOMEERROR');
    expect(err.errno).toBe('ESOMEERROR');
    expect(err.stack.startsWith(`${err.name}: ${err.message}`)).toBeTruthy();
  });

  it('should support https request', async () => {
    const res = await fetch('https://github.com/', {
      method: 'HEAD',
    });
    expect(res.status).toBe(200);
    expect(res.ok).toBeTruthy();
  });
});
