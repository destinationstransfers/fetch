'use strict';

/**
 * body.js
 *
 * Body interface provides common methods for Request and Response
 */

const Blob = require('./blob.js');

const BUFFER = Blob.BUFFER;
const parseJson = require('json-parse-better-errors');
const FetchError = require('./fetch-error.js');
const Stream = require('stream');

const { PassThrough } = Stream;
const DISTURBED = Symbol('disturbed');

/**
 * Body class
 *
 * Cannot use ES6 class because Body must be called with .call().
 *
 * @param   Stream  body  Readable stream
 * @param   Object  opts  Response options
 * @return  Void
 */

function Body(body, opts = {}) {
  const size = opts.size == null ? 0 : opts.size;
  const timeout = opts.timeout == null ? 0 : opts.timeout;
  if (body == null) {
    // body is undefined or null
    body = null;
  } else if (typeof body === 'string') {
    // body is string
  } else if (body instanceof Blob) {
    // body is blob
  } else if (Buffer.isBuffer(body)) {
    // body is buffer
  } else if (body instanceof Stream) {
    // body is stream
  } else {
    // none of the above
    // coerce to string
    body = String(body);
  }
  this.body = body;
  this[DISTURBED] = false;
  this.size = size;
  this.timeout = timeout;
}

Body.prototype = {
  /**
   * Returns whether body was already used
   * 
   * @returns {boolean}
   */
  get bodyUsed() {
    return this[DISTURBED];
  },

  /**
   * Decode response as ArrayBuffer
   *
   * @returns {Promise.<ArrayBuffer>}
   */
  async arrayBuffer() {
    const buf = await consumeBody.call(this);
    return ArrayBuffer.prototype.slice.call(
      buf.buffer,
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
  },

  /**
   * Return raw response as Blob
   *
   * @returns {Promise.<Blob>}
   */
  async blob() {
    const ct = (this.headers && this.headers.get('content-type')) || '';
    const buf = await consumeBody.call(this);
    return Object.assign(
      // Prevent copying
      new Blob([], {
        type: ct.toLowerCase(),
      }),
      {
        [BUFFER]: buf,
      },
    );
  },

  /**
   * Decode response as json
   *
   * @returns  {Promise.<Object>}
   */
  async json() {
    const buffer = await consumeBody.call(this);
    return parseJson(buffer.toString());
  },

  /**
   * Decode response as text
   *
   * @returns  {Promise.<string>}
   */
  async text() {
    const buffer = await consumeBody.call(this);
    return buffer.toString();
  },

  /**
   * Decode response as buffer (non-spec api)
   *
   * @returns  {Promise.<Buffer>}
   */
  buffer() {
    return consumeBody.call(this);
  },
};

Body.mixIn = proto => {
  for (const name of Object.getOwnPropertyNames(Body.prototype)) {
    // istanbul ignore else: future proof
    if (!(name in proto)) {
      const desc = Object.getOwnPropertyDescriptor(Body.prototype, name);
      Object.defineProperty(proto, name, desc);
    }
  }
};

exports = module.exports = Body;

/**
 * Decode buffers into utf-8 string
 *
 * @returns  {Promise.<Buffer>}
 */
async function consumeBody(body) {
  if (this[DISTURBED]) {
    throw new Error(`body used already for: ${this.url}`);
  }

  this[DISTURBED] = true;

  // body is null
  if (this.body === null) {
    return Buffer.alloc(0);
  }

  // body is string
  if (typeof this.body === 'string') {
    return Buffer.from(this.body);
  }

  // body is blob
  if (this.body instanceof Blob) {
    return this.body[BUFFER];
  }

  // body is buffer
  if (Buffer.isBuffer(this.body)) {
    return this.body;
  }

  // istanbul ignore if: should never happen
  if (!(this.body instanceof Stream)) {
    return Buffer.alloc(0);
  }

  // body is stream
  // get ready to actually consume the body
  const accum = [];
  let accumBytes = 0;
  let abort = false;

  return new Promise((resolve, reject) => {
    let resTimeout;

    // allow timeout on slow response body
    if (this.timeout) {
      resTimeout = setTimeout(() => {
        abort = true;
        reject(
          new FetchError(
            `Response timeout while trying to fetch ${this.url} (over ${this
              .timeout}ms)`,
            'body-timeout',
          ),
        );
      }, this.timeout);
    }

    // handle stream error, such as incorrect content-encoding
    this.body.on('error', err => {
      reject(
        new FetchError(
          `Invalid response body while trying to fetch ${this
            .url}: ${err.message}`,
          'system',
          err,
        ),
      );
    });

    this.body.on('data', chunk => {
      if (abort || chunk === null) {
        return;
      }

      if (this.size && accumBytes + chunk.length > this.size) {
        abort = true;
        reject(
          new FetchError(
            `content size at ${this.url} over limit: ${this.size}`,
            'max-size',
          ),
        );
        return;
      }

      accumBytes += chunk.length;
      accum.push(chunk);
    });

    this.body.on('end', () => {
      if (abort) {
        return;
      }

      clearTimeout(resTimeout);
      resolve(Buffer.concat(accum));
    });
  });
}

/**
 * Clone body given Res/Req instance
 *
 * @param { Response | Request} instance - Response or Request instance
 * @returns {Body}
 */
exports.clone = function clone(instance) {
  let { body } = instance;

  // don't allow cloning a used body
  if (instance.bodyUsed) {
    throw new Error('cannot clone body after it is used');
  }

  // check that body is a stream and not form-data object
  // note: we can't clone the form-data object without having it as a dependency
  if (body instanceof Stream && typeof body.getBoundary !== 'function') {
    // tee instance body
    const p1 = new PassThrough();
    const p2 = new PassThrough();
    body.pipe(p1);
    body.pipe(p2);
    // set instance body to teed body and return the other teed body
    instance.body = p1;
    body = p2;
  }

  return body;
};

/**
 * Performs the operation "extract a `Content-Type` value from |object|" as
 * specified in the specification:
 * https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 *
 * This function assumes that instance.body is present and non-null.
 *
 * @param   Mixed  instance  Response or Request instance
 */
exports.extractContentType = function extractContentType(instance) {
  const body = instance.body;

  // istanbul ignore if: Currently, because of a guard in Request, body
  // can never be null. Included here for completeness.
  if (body === null) {
    // body is null
    return null;
  } else if (typeof body === 'string') {
    // body is string
    return 'text/plain;charset=UTF-8';
  } else if (body instanceof Blob) {
    // body is blob
    return body.type || null;
  } else if (Buffer.isBuffer(body)) {
    // body is buffer
    return null;
  } else if (typeof body.getBoundary === 'function') {
    // detect form data input from form-data module
    return `multipart/form-data;boundary=${body.getBoundary()}`;
  }
  // body is stream
  // can't really do much about this
  return null;
};

exports.getTotalBytes = function getTotalBytes(instance) {
  const body = instance.body;

  // istanbul ignore if: included for completion
  if (body === null) {
    // body is null
    return 0;
  } else if (typeof body === 'string') {
    // body is string
    return Buffer.byteLength(body);
  } else if (body instanceof Blob) {
    // body is blob
    return body.size;
  } else if (Buffer.isBuffer(body)) {
    // body is buffer
    return body.length;
  } else if (body && typeof body.getLengthSync === 'function') {
    // detect form data input from form-data module
    if (
      // 1.x
      (body._lengthRetrievers && body._lengthRetrievers.length === 0) ||
      // 2.x
      (body.hasKnownLength && body.hasKnownLength())
    ) {
      return body.getLengthSync();
    }
    return null;
  }
  // body is stream
  // can't really do much about this
  return null;
};

exports.writeToStream = function writeToStream(dest, instance) {
  const body = instance.body;

  if (body === null) {
    // body is null
    dest.end();
  } else if (typeof body === 'string') {
    // body is string
    dest.write(body);
    dest.end();
  } else if (body instanceof Blob) {
    // body is blob
    dest.write(body[BUFFER]);
    dest.end();
  } else if (Buffer.isBuffer(body)) {
    // body is buffer
    dest.write(body);
    dest.end();
  } else {
    // body is stream
    body.pipe(dest);
  }
};

// expose Promise
Body.Promise = global.Promise;
