'use strict';

const { Headers } = require('../src/');

describe('Headers class tests', () => {
  it('should allow get all responses of a header', () => {
    const expected = 'a=1,b=1';
    const headers = new Headers({ 'Set-cookie': expected });
    expect(headers.get('set-cookie')).toBe(expected);
    expect(headers.get('Set-Cookie')).toBe(expected);
  });

  it('should return all headers using raw()', () => {
    const headers = new Headers();
    headers.set('Set-Cookie', 'a=1');
    headers.append('set-cookie', 'b=1');

    expect(headers.raw()['set-cookie']).toEqual(['a=1', 'b=1']);
  });

  it('should allow iterating through all headers with forEach', () => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['b', '3'],
      ['a', '1'],
    ]);
    expect(typeof headers.forEach).toBe('function');

    const result = [];
    headers.forEach((val, key) => {
      result.push([key, val]);
    });

    expect(result).toEqual([['a', '1'], ['b', '2, 3'], ['c', '4']]);
  });

  it('should allow iterating through all headers with for-of loop', () => {
    const headers = new Headers([['b', '2'], ['c', '4'], ['a', '1']]);
    headers.append('b', '3');
    expect(Symbol.iterator in headers).toBeTruthy();

    const result = [];
    for (const pair of headers) {
      result.push(pair);
    }
    expect(result).toEqual([['a', '1'], ['b', '2, 3'], ['c', '4']]);
  });

  it('should allow iterating through all headers with entries()', () => {
    const headers = new Headers([['b', '2'], ['c', '4'], ['a', '1']]);
    headers.append('b', '3');

    for (const [k, v] of headers.entries()) {
      expect(typeof k).toBe('string');
      expect(typeof v).toBe('string');
    }
  });

  it('should allow iterating through all headers with keys()', () => {
    const headers = new Headers([['b', '2'], ['c', '4'], ['a', '1']]);
    headers.append('b', '3');

    for (const k of headers.keys()) {
      expect(['a', 'b', 'c'].includes(k)).toBeTruthy();
    }
  });

  it('should allow iterating through all headers with values()', () => {
    const headers = new Headers([['b', '2'], ['c', '4'], ['a', '1']]);
    headers.append('b', '3');

    for (const v of headers.values()) {
      expect(['1', '2, 3', '4'].includes(v)).toBeTruthy();
    }
  });

  it('should allow deleting header', () => {
    const headers = new Headers({ 'Set-Cookie': 'blabla' });
    expect(headers.has('Set-Cookie')).toBeTruthy();
    headers.delete('set-cookie');
    expect(headers.get('set-cookie')).toBeNull();
    expect(headers.get('Set-Cookie')).toBeNull();
  });

  it('should reject illegal header', () => {
    const headers = new Headers();
    expect(() => new Headers({ 'He y': 'ok' })).toThrow(TypeError);
    expect(() => new Headers({ 'Hé-y': 'ok' })).toThrow(TypeError);
    expect(() => new Headers({ 'He-y': 'ăk' })).toThrow(TypeError);
    expect(() => headers.append('Hé-y', 'ok')).toThrow(TypeError);
    expect(() => headers.delete('Hé-y')).toThrow(TypeError);
    expect(() => headers.get('Hé-y')).toThrow(TypeError);
    expect(() => headers.has('Hé-y')).toThrow(TypeError);
    expect(() => headers.set('Hé-y', 'ok')).toThrow(TypeError);

    // 'o k' is valid value but invalid name
    expect(() => new Headers({ 'He-y': 'o k' })).not.toThrow();
  });

  it('should ignore unsupported attributes while reading headers', () => {
    const FakeHeader = function() {};
    // prototypes are currently ignored
    // This might change in the future: #181
    FakeHeader.prototype.z = 'fake';

    const res = new FakeHeader();
    res.a = 'string';
    res.b = ['1', '2'];
    res.c = '';
    res.d = [];
    res.e = 1;
    res.f = [1, 2];
    res.g = { a: 1 };
    res.h = undefined;
    res.i = null;
    res.j = NaN;
    res.k = true;
    res.l = false;
    res.m = Buffer.from('test', 'utf8');

    const h1 = new Headers(res);
    h1.set('n', [1, 2]);
    h1.append('n', ['3', 4]);

    const h1Raw = h1.raw();

    expect(h1Raw.a).toContain('string');
    expect(h1Raw.b).toContain('1,2');
    expect(h1Raw.c).toContain('');
    expect(h1Raw.d).toContain('');
    expect(h1Raw.e).toContain('1');
    expect(h1Raw.f).toContain('1,2');
    expect(h1Raw.g).toContain('[object Object]');
    expect(h1Raw.h).toContain('undefined');
    expect(h1Raw.i).toContain('null');
    expect(h1Raw.j).toContain('NaN');
    expect(h1Raw.k).toContain('true');
    expect(h1Raw.l).toContain('false');
    expect(h1Raw.m).toContain('test');
    expect(h1Raw.n).toContain('1,2');
    expect(h1Raw.n).toContain('3,4');

    expect(h1Raw.z).toBeUndefined();
  });

  it('should wrap headers', () => {
    const h1 = new Headers({
      a: '1',
    });
    const h1Raw = h1.raw();

    const h2 = new Headers(h1);
    h2.set('b', '1');
    const h2Raw = h2.raw();

    const h3 = new Headers(h2);
    h3.append('a', '2');
    const h3Raw = h3.raw();

    expect(h1Raw.a).toContain('1');
    expect(h1Raw.a).not.toContain('2');

    expect(h2Raw.a).toContain('1');
    expect(h2Raw.a).not.toContain('2');
    expect(h2Raw.b).toContain('1');

    expect(h3Raw.a).toContain('1');
    expect(h3Raw.a).toContain('2');
    expect(h3Raw.b).toContain('1');
  });

  it('should accept headers as an iterable of tuples', () => {
    let headers;

    headers = new Headers([['a', '1'], ['b', '2'], ['a', '3']]);
    expect(headers.get('a')).toBe('1, 3');
    expect(headers.get('b')).toBe('2');

    headers = new Headers([
      new Set(['a', '1']),
      ['b', '2'],
      new Map([['a', null], ['3', null]]).keys(),
    ]);
    expect(headers.get('a')).toBe('1, 3');
    expect(headers.get('b')).toBe('2');

    headers = new Headers(new Map([['a', '1'], ['b', '2']]));
    expect(headers.get('a')).toBe('1');
    expect(headers.get('b')).toBe('2');
  });

  it('should throw a TypeError if non-tuple exists in a headers initializer', () => {
    expect(() => new Headers([['b', '2', 'huh?']])).toThrow(TypeError);
    expect(() => new Headers(['b2'])).toThrow(TypeError);
    expect(() => new Headers('b2')).toThrow(TypeError);
    expect(() => new Headers({ [Symbol.iterator]: 42 })).toThrow(TypeError);
  });
});
