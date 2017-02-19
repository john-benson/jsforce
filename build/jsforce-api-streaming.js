(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Streaming = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Streaming APIs
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var events = window.jsforce.require('events'),
    inherits = window.jsforce.require('inherits'),
    isArray = require('lodash/isArray'),
    Faye   = require('faye'),
    jsforce = window.jsforce.require('./core');

/**
 * Streaming API topic class
 *
 * @class Streaming~Topic
 * @param {Streaming} steaming - Streaming API object
 * @param {String} name - Topic name
 */
var Topic = function(streaming, name) {
  this._streaming = streaming;
  this.name = name;
};

/**
 * @typedef {Object} Streaming~StreamingMessage
 * @prop {Object} event
 * @prop {Object} event.type - Event type
 * @prop {Record} sobject - Record information
 */
/**
 * Subscribe listener to topic
 *
 * @method Streaming~Topic#subscribe
 * @param {Callback.<Streaming~StreamingMesasge>} listener - Streaming message listener
 * @returns {Subscription} - Faye subscription object
 */
Topic.prototype.subscribe = function(listener) {
  return this._streaming.subscribe(this.name, listener);
};

/**
 * Unsubscribe listener from topic
 *
 * @method Streaming~Topic#unsubscribe
 * @param {Callback.<Streaming~StreamingMesasge>} listener - Streaming message listener
 * @returns {Streaming~Topic}
 */
Topic.prototype.unsubscribe = function(listener) {
  this._streaming.unsubscribe(this.name, listener);
  return this;
};

/*--------------------------------------------*/

/**
 * Streaming API Generic Streaming Channel
 *
 * @class Streaming~Channel
 * @param {Streaming} steaming - Streaming API object
 * @param {String} name - Channel name (starts with "/u/")
 */
var Channel = function(streaming, name) {
  this._streaming = streaming;
  this._name = name;
};

/**
 * Subscribe to hannel
 *
 * @param {Callback.<Streaming~StreamingMessage>} listener - Streaming message listener
 * @returns {Subscription} - Faye subscription object
 */
Channel.prototype.subscribe = function(listener) {
  return this._streaming.subscribe(this._name, listener);
};

Channel.prototype.unsubscribe = function(listener) {
  this._streaming.unsubscribe(this._name, listener);
  return this;
};

Channel.prototype.push = function(events, callback) {
  var isArray = isArray(events);
  events = isArray ? events : [ events ];
  var conn = this._streaming._conn;
  if (!this._id) {
    this._id = conn.sobject('StreamingChannel').findOne({ Name: this._name }, 'Id')
      .then(function(rec) { return rec.Id });
  }
  return this._id.then(function(id) {
    var channelUrl = '/sobjects/StreamingChannel/' + id + '/push';
    return conn.requestPost(channelUrl, { pushEvents: events });
  }).then(function(rets) {
    return isArray ? rets : rets[0];
  }).thenCall(callback);
};

/*--------------------------------------------*/

/**
 * Streaming API class
 *
 * @class
 * @extends events.EventEmitter
 * @param {Connection} conn - Connection object
 */
var Streaming = function(conn) {
  this._conn = conn;
};

inherits(Streaming, events.EventEmitter);

/** @private **/
Streaming.prototype._createClient = function(replay) {
  var endpointUrl = [ this._conn.instanceUrl, "cometd" + (replay ? "/replay" : ""), this._conn.version ].join('/');
  var fayeClient = new Faye.Client(endpointUrl, {});
  fayeClient.setHeader('Authorization', 'OAuth '+this._conn.accessToken);
  return fayeClient;
};

/** @private **/
Streaming.prototype._getFayeClient = function(channelName) {
  var isGeneric = channelName.indexOf('/u/') === 0;
  var clientType = isGeneric ? 'generic' : 'pushTopic';
  if (!this._fayeClients || !this._fayeClients[clientType]) {
    this._fayeClients = this._fayeClients || {};
    this._fayeClients[clientType] = this._createClient(isGeneric);
    if (Faye.Transport.NodeHttp) {
      Faye.Transport.NodeHttp.prototype.batching = false; // prevent streaming API server error
    }
  }
  return this._fayeClients[clientType];
};


/**
 * Get named topic
 *
 * @param {String} name - Topic name
 * @returns {Streaming~Topic}
 */
Streaming.prototype.topic = function(name) {
  this._topics = this._topics || {};
  var topic = this._topics[name] =
    this._topics[name] || new Topic(this, name);
  return topic;
};

/**
 * Get Channel for Id
 * @param {String} channelId - Id of StreamingChannel object
 * @returns {Streaming~Channel}
 */
Streaming.prototype.channel = function(channelId) {
  return new Channel(this, channelId);
};

/**
 * Subscribe topic/channel
 *
 * @param {String} name - Topic name
 * @param {Callback.<Streaming~StreamingMessage>} listener - Streaming message listener
 * @returns {Subscription} - Faye subscription object
 */
Streaming.prototype.subscribe = function(name, listener) {
  var channelName = name.indexOf('/') === 0 ? name : '/topic/' + name;
  var fayeClient = this._getFayeClient(channelName);
  return fayeClient.subscribe(channelName, listener);
};

/**
 * Unsubscribe topic
 *
 * @param {String} name - Topic name
 * @param {Callback.<Streaming~StreamingMessage>} listener - Streaming message listener
 * @returns {Streaming}
 */
Streaming.prototype.unsubscribe = function(name, listener) {
  var channelName = name.indexOf('/') === 0 ? name : '/topic/' + name;
  var fayeClient = this._getFayeClient(channelName);
  fayeClient.unsubscribe(channelName, listener);
  return this;
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.streaming = new Streaming(conn);
});


module.exports = Streaming;

},{"faye":2,"lodash/isArray":3}],2:[function(require,module,exports){
(function (process,global){
(function() {
'use strict';

var Faye = {
  VERSION:          '1.1.2',

  BAYEUX_VERSION:   '1.0',
  ID_LENGTH:        160,
  JSONP_CALLBACK:   'jsonpcallback',
  CONNECTION_TYPES: ['long-polling', 'cross-origin-long-polling', 'callback-polling', 'websocket', 'eventsource', 'in-process'],

  MANDATORY_CONNECTION_TYPES: ['long-polling', 'callback-polling', 'in-process'],

  ENV: (typeof window !== 'undefined') ? window : global,

  extend: function(dest, source, overwrite) {
    if (!source) return dest;
    for (var key in source) {
      if (!source.hasOwnProperty(key)) continue;
      if (dest.hasOwnProperty(key) && overwrite === false) continue;
      if (dest[key] !== source[key])
        dest[key] = source[key];
    }
    return dest;
  },

  random: function(bitlength) {
    bitlength = bitlength || this.ID_LENGTH;
    var maxLength = Math.ceil(bitlength * Math.log(2) / Math.log(36));
    var string = csprng(bitlength, 36);
    while (string.length < maxLength) string = '0' + string;
    return string;
  },

  validateOptions: function(options, validKeys) {
    for (var key in options) {
      if (this.indexOf(validKeys, key) < 0)
        throw new Error('Unrecognized option: ' + key);
    }
  },

  clientIdFromMessages: function(messages) {
    var connect = this.filter([].concat(messages), function(message) {
      return message.channel === '/meta/connect';
    });
    return connect[0] && connect[0].clientId;
  },

  copyObject: function(object) {
    var clone, i, key;
    if (object instanceof Array) {
      clone = [];
      i = object.length;
      while (i--) clone[i] = Faye.copyObject(object[i]);
      return clone;
    } else if (typeof object === 'object') {
      clone = (object === null) ? null : {};
      for (key in object) clone[key] = Faye.copyObject(object[key]);
      return clone;
    } else {
      return object;
    }
  },

  commonElement: function(lista, listb) {
    for (var i = 0, n = lista.length; i < n; i++) {
      if (this.indexOf(listb, lista[i]) !== -1)
        return lista[i];
    }
    return null;
  },

  indexOf: function(list, needle) {
    if (list.indexOf) return list.indexOf(needle);

    for (var i = 0, n = list.length; i < n; i++) {
      if (list[i] === needle) return i;
    }
    return -1;
  },

  map: function(object, callback, context) {
    if (object.map) return object.map(callback, context);
    var result = [];

    if (object instanceof Array) {
      for (var i = 0, n = object.length; i < n; i++) {
        result.push(callback.call(context || null, object[i], i));
      }
    } else {
      for (var key in object) {
        if (!object.hasOwnProperty(key)) continue;
        result.push(callback.call(context || null, key, object[key]));
      }
    }
    return result;
  },

  filter: function(array, callback, context) {
    if (array.filter) return array.filter(callback, context);
    var result = [];
    for (var i = 0, n = array.length; i < n; i++) {
      if (callback.call(context || null, array[i], i))
        result.push(array[i]);
    }
    return result;
  },

  asyncEach: function(list, iterator, callback, context) {
    var n       = list.length,
        i       = -1,
        calls   = 0,
        looping = false;

    var iterate = function() {
      calls -= 1;
      i += 1;
      if (i === n) return callback && callback.call(context);
      iterator(list[i], resume);
    };

    var loop = function() {
      if (looping) return;
      looping = true;
      while (calls > 0) iterate();
      looping = false;
    };

    var resume = function() {
      calls += 1;
      loop();
    };
    resume();
  },

  // http://assanka.net/content/tech/2009/09/02/json2-js-vs-prototype/
  toJSON: function(object) {
    if (!this.stringify) return JSON.stringify(object);

    return this.stringify(object, function(key, value) {
      return (this[key] instanceof Array) ? this[key] : value;
    });
  }
};

if (typeof module !== 'undefined')
  module.exports = Faye;
else if (typeof window !== 'undefined')
  window.Faye = Faye;

Faye.Class = function(parent, methods) {
  if (typeof parent !== 'function') {
    methods = parent;
    parent  = Object;
  }

  var klass = function() {
    if (!this.initialize) return this;
    return this.initialize.apply(this, arguments) || this;
  };

  var bridge = function() {};
  bridge.prototype = parent.prototype;

  klass.prototype = new bridge();
  Faye.extend(klass.prototype, methods);

  return klass;
};

(function() {
var EventEmitter = Faye.EventEmitter = function() {};

/*
Copyright Joyent, Inc. and other Node contributors. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {
    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

})();

Faye.Namespace = Faye.Class({
  initialize: function() {
    this._used = {};
  },

  exists: function(id) {
    return this._used.hasOwnProperty(id);
  },

  generate: function() {
    var name = Faye.random();
    while (this._used.hasOwnProperty(name))
      name = Faye.random();
    return this._used[name] = name;
  },

  release: function(id) {
    delete this._used[id];
  }
});

(function() {
'use strict';

var timeout = setTimeout, defer;

if (typeof setImmediate === 'function')
  defer = function(fn) { setImmediate(fn) };
else if (typeof process === 'object' && process.nextTick)
  defer = function(fn) { process.nextTick(fn) };
else
  defer = function(fn) { timeout(fn, 0) };

var PENDING   = 0,
    FULFILLED = 1,
    REJECTED  = 2;

var RETURN = function(x) { return x },
    THROW  = function(x) { throw  x };

var Promise = function(task) {
  this._state       = PENDING;
  this._onFulfilled = [];
  this._onRejected  = [];

  if (typeof task !== 'function') return;
  var self = this;

  task(function(value)  { fulfill(self, value) },
       function(reason) { reject(self, reason) });
};

Promise.prototype.then = function(onFulfilled, onRejected) {
  var next = new Promise();
  registerOnFulfilled(this, onFulfilled, next);
  registerOnRejected(this, onRejected, next);
  return next;
};

var registerOnFulfilled = function(promise, onFulfilled, next) {
  if (typeof onFulfilled !== 'function') onFulfilled = RETURN;
  var handler = function(value) { invoke(onFulfilled, value, next) };

  if (promise._state === PENDING) {
    promise._onFulfilled.push(handler);
  } else if (promise._state === FULFILLED) {
    handler(promise._value);
  }
};

var registerOnRejected = function(promise, onRejected, next) {
  if (typeof onRejected !== 'function') onRejected = THROW;
  var handler = function(reason) { invoke(onRejected, reason, next) };

  if (promise._state === PENDING) {
    promise._onRejected.push(handler);
  } else if (promise._state === REJECTED) {
    handler(promise._reason);
  }
};

var invoke = function(fn, value, next) {
  defer(function() { _invoke(fn, value, next) });
};

var _invoke = function(fn, value, next) {
  var outcome;

  try {
    outcome = fn(value);
  } catch (error) {
    return reject(next, error);
  }

  if (outcome === next) {
    reject(next, new TypeError('Recursive promise chain detected'));
  } else {
    fulfill(next, outcome);
  }
};

var fulfill = Promise.fulfill = Promise.resolve = function(promise, value) {
  var called = false, type, then;

  try {
    type = typeof value;
    then = value !== null && (type === 'function' || type === 'object') && value.then;

    if (typeof then !== 'function') return _fulfill(promise, value);

    then.call(value, function(v) {
      if (!(called ^ (called = true))) return;
      fulfill(promise, v);
    }, function(r) {
      if (!(called ^ (called = true))) return;
      reject(promise, r);
    });
  } catch (error) {
    if (!(called ^ (called = true))) return;
    reject(promise, error);
  }
};

var _fulfill = function(promise, value) {
  if (promise._state !== PENDING) return;

  promise._state      = FULFILLED;
  promise._value      = value;
  promise._onRejected = [];

  var onFulfilled = promise._onFulfilled, fn;
  while (fn = onFulfilled.shift()) fn(value);
};

var reject = Promise.reject = function(promise, reason) {
  if (promise._state !== PENDING) return;

  promise._state       = REJECTED;
  promise._reason      = reason;
  promise._onFulfilled = [];

  var onRejected = promise._onRejected, fn;
  while (fn = onRejected.shift()) fn(reason);
};

Promise.all = function(promises) {
  return new Promise(function(fulfill, reject) {
    var list = [],
         n   = promises.length,
         i;

    if (n === 0) return fulfill(list);

    for (i = 0; i < n; i++) (function(promise, i) {
      Promise.fulfilled(promise).then(function(value) {
        list[i] = value;
        if (--n === 0) fulfill(list);
      }, reject);
    })(promises[i], i);
  });
};

Promise.defer = defer;

Promise.deferred = Promise.pending = function() {
  var tuple = {};

  tuple.promise = new Promise(function(fulfill, reject) {
    tuple.fulfill = tuple.resolve = fulfill;
    tuple.reject  = reject;
  });
  return tuple;
};

Promise.fulfilled = Promise.resolved = function(value) {
  return new Promise(function(fulfill, reject) { fulfill(value) });
};

Promise.rejected = function(reason) {
  return new Promise(function(fulfill, reject) { reject(reason) });
};

if (typeof Faye === 'undefined')
  module.exports = Promise;
else
  Faye.Promise = Promise;

})();

Faye.Set = Faye.Class({
  initialize: function() {
    this._index = {};
  },

  add: function(item) {
    var key = (item.id !== undefined) ? item.id : item;
    if (this._index.hasOwnProperty(key)) return false;
    this._index[key] = item;
    return true;
  },

  forEach: function(block, context) {
    for (var key in this._index) {
      if (this._index.hasOwnProperty(key))
        block.call(context, this._index[key]);
    }
  },

  isEmpty: function() {
    for (var key in this._index) {
      if (this._index.hasOwnProperty(key)) return false;
    }
    return true;
  },

  member: function(item) {
    for (var key in this._index) {
      if (this._index[key] === item) return true;
    }
    return false;
  },

  remove: function(item) {
    var key = (item.id !== undefined) ? item.id : item;
    var removed = this._index[key];
    delete this._index[key];
    return removed;
  },

  toArray: function() {
    var array = [];
    this.forEach(function(item) { array.push(item) });
    return array;
  }
});

Faye.URI = {
  isURI: function(uri) {
    return uri && uri.protocol && uri.host && uri.path;
  },

  isSameOrigin: function(uri) {
    var location = Faye.ENV.location;
    return uri.protocol === location.protocol &&
           uri.hostname === location.hostname &&
           uri.port     === location.port;
  },

  parse: function(url) {
    if (typeof url !== 'string') return url;
    var uri = {}, parts, query, pairs, i, n, data;

    var consume = function(name, pattern) {
      url = url.replace(pattern, function(match) {
        uri[name] = match;
        return '';
      });
      uri[name] = uri[name] || '';
    };

    consume('protocol', /^[a-z]+\:/i);
    consume('host',     /^\/\/[^\/\?#]+/);

    if (!/^\//.test(url) && !uri.host)
      url = Faye.ENV.location.pathname.replace(/[^\/]*$/, '') + url;

    consume('pathname', /^[^\?#]*/);
    consume('search',   /^\?[^#]*/);
    consume('hash',     /^#.*/);

    uri.protocol = uri.protocol || Faye.ENV.location.protocol;

    if (uri.host) {
      uri.host     = uri.host.substr(2);
      parts        = uri.host.split(':');
      uri.hostname = parts[0];
      uri.port     = parts[1] || '';
    } else {
      uri.host     = Faye.ENV.location.host;
      uri.hostname = Faye.ENV.location.hostname;
      uri.port     = Faye.ENV.location.port;
    }

    uri.pathname = uri.pathname || '/';
    uri.path = uri.pathname + uri.search;

    query = uri.search.replace(/^\?/, '');
    pairs = query ? query.split('&') : [];
    data  = {};

    for (i = 0, n = pairs.length; i < n; i++) {
      parts = pairs[i].split('=');
      data[decodeURIComponent(parts[0] || '')] = decodeURIComponent(parts[1] || '');
    }

    uri.query = data;

    uri.href = this.stringify(uri);
    return uri;
  },

  stringify: function(uri) {
    var string = uri.protocol + '//' + uri.hostname;
    if (uri.port) string += ':' + uri.port;
    string += uri.pathname + this.queryString(uri.query) + (uri.hash || '');
    return string;
  },

  queryString: function(query) {
    var pairs = [];
    for (var key in query) {
      if (!query.hasOwnProperty(key)) continue;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
    }
    if (pairs.length === 0) return '';
    return '?' + pairs.join('&');
  }
};

Faye.Error = Faye.Class({
  initialize: function(code, params, message) {
    this.code    = code;
    this.params  = Array.prototype.slice.call(params);
    this.message = message;
  },

  toString: function() {
    return this.code + ':' +
           this.params.join(',') + ':' +
           this.message;
  }
});

Faye.Error.parse = function(message) {
  message = message || '';
  if (!Faye.Grammar.ERROR.test(message)) return new this(null, [], message);

  var parts   = message.split(':'),
      code    = parseInt(parts[0]),
      params  = parts[1].split(','),
      message = parts[2];

  return new this(code, params, message);
};




Faye.Error.versionMismatch = function() {
  return new this(300, arguments, 'Version mismatch').toString();
};

Faye.Error.conntypeMismatch = function() {
  return new this(301, arguments, 'Connection types not supported').toString();
};

Faye.Error.extMismatch = function() {
  return new this(302, arguments, 'Extension mismatch').toString();
};

Faye.Error.badRequest = function() {
  return new this(400, arguments, 'Bad request').toString();
};

Faye.Error.clientUnknown = function() {
  return new this(401, arguments, 'Unknown client').toString();
};

Faye.Error.parameterMissing = function() {
  return new this(402, arguments, 'Missing required parameter').toString();
};

Faye.Error.channelForbidden = function() {
  return new this(403, arguments, 'Forbidden channel').toString();
};

Faye.Error.channelUnknown = function() {
  return new this(404, arguments, 'Unknown channel').toString();
};

Faye.Error.channelInvalid = function() {
  return new this(405, arguments, 'Invalid channel').toString();
};

Faye.Error.extUnknown = function() {
  return new this(406, arguments, 'Unknown extension').toString();
};

Faye.Error.publishFailed = function() {
  return new this(407, arguments, 'Failed to publish').toString();
};

Faye.Error.serverError = function() {
  return new this(500, arguments, 'Internal server error').toString();
};


Faye.Deferrable = {
  then: function(callback, errback) {
    var self = this;
    if (!this._promise)
      this._promise = new Faye.Promise(function(fulfill, reject) {
        self._fulfill = fulfill;
        self._reject  = reject;
      });

    if (arguments.length === 0)
      return this._promise;
    else
      return this._promise.then(callback, errback);
  },

  callback: function(callback, context) {
    return this.then(function(value) { callback.call(context, value) });
  },

  errback: function(callback, context) {
    return this.then(null, function(reason) { callback.call(context, reason) });
  },

  timeout: function(seconds, message) {
    this.then();
    var self = this;
    this._timer = Faye.ENV.setTimeout(function() {
      self._reject(message);
    }, seconds * 1000);
  },

  setDeferredStatus: function(status, value) {
    if (this._timer) Faye.ENV.clearTimeout(this._timer);

    this.then();

    if (status === 'succeeded')
      this._fulfill(value);
    else if (status === 'failed')
      this._reject(value);
    else
      delete this._promise;
  }
};

Faye.Publisher = {
  countListeners: function(eventType) {
    return this.listeners(eventType).length;
  },

  bind: function(eventType, listener, context) {
    var slice   = Array.prototype.slice,
        handler = function() { listener.apply(context, slice.call(arguments)) };

    this._listeners = this._listeners || [];
    this._listeners.push([eventType, listener, context, handler]);
    return this.on(eventType, handler);
  },

  unbind: function(eventType, listener, context) {
    this._listeners = this._listeners || [];
    var n = this._listeners.length, tuple;

    while (n--) {
      tuple = this._listeners[n];
      if (tuple[0] !== eventType) continue;
      if (listener && (tuple[1] !== listener || tuple[2] !== context)) continue;
      this._listeners.splice(n, 1);
      this.removeListener(eventType, tuple[3]);
    }
  }
};

Faye.extend(Faye.Publisher, Faye.EventEmitter.prototype);
Faye.Publisher.trigger = Faye.Publisher.emit;

Faye.Timeouts = {
  addTimeout: function(name, delay, callback, context) {
    this._timeouts = this._timeouts || {};
    if (this._timeouts.hasOwnProperty(name)) return;
    var self = this;
    this._timeouts[name] = Faye.ENV.setTimeout(function() {
      delete self._timeouts[name];
      callback.call(context);
    }, 1000 * delay);
  },

  removeTimeout: function(name) {
    this._timeouts = this._timeouts || {};
    var timeout = this._timeouts[name];
    if (!timeout) return;
    Faye.ENV.clearTimeout(timeout);
    delete this._timeouts[name];
  },

  removeAllTimeouts: function() {
    this._timeouts = this._timeouts || {};
    for (var name in this._timeouts) this.removeTimeout(name);
  }
};

Faye.Logging = {
  LOG_LEVELS: {
    fatal:  4,
    error:  3,
    warn:   2,
    info:   1,
    debug:  0
  },

  writeLog: function(messageArgs, level) {
    if (!Faye.logger) return;

    var args   = Array.prototype.slice.apply(messageArgs),
        banner = '[Faye',
        klass  = this.className,

        message = args.shift().replace(/\?/g, function() {
          try {
            return Faye.toJSON(args.shift());
          } catch (e) {
            return '[Object]';
          }
        });

    for (var key in Faye) {
      if (klass) continue;
      if (typeof Faye[key] !== 'function') continue;
      if (this instanceof Faye[key]) klass = key;
    }
    if (klass) banner += '.' + klass;
    banner += '] ';

    if (typeof Faye.logger[level] === 'function')
      Faye.logger[level](banner + message);
    else if (typeof Faye.logger === 'function')
      Faye.logger(banner + message);
  }
};

(function() {
  for (var key in Faye.Logging.LOG_LEVELS)
    (function(level) {
      Faye.Logging[level] = function() {
        this.writeLog(arguments, level);
      };
    })(key);
})();

Faye.Grammar = {
  CHANNEL_NAME:     /^\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+(\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+)*$/,
  CHANNEL_PATTERN:  /^(\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+)*\/\*{1,2}$/,
  ERROR:            /^([0-9][0-9][0-9]:(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*(,(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*)*:(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*|[0-9][0-9][0-9]::(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)| |\/|\*|\.))*)$/,
  VERSION:          /^([0-9])+(\.(([a-z]|[A-Z])|[0-9])(((([a-z]|[A-Z])|[0-9])|\-|\_))*)*$/
};

Faye.Extensible = {
  addExtension: function(extension) {
    this._extensions = this._extensions || [];
    this._extensions.push(extension);
    if (extension.added) extension.added(this);
  },

  removeExtension: function(extension) {
    if (!this._extensions) return;
    var i = this._extensions.length;
    while (i--) {
      if (this._extensions[i] !== extension) continue;
      this._extensions.splice(i,1);
      if (extension.removed) extension.removed(this);
    }
  },

  pipeThroughExtensions: function(stage, message, request, callback, context) {
    this.debug('Passing through ? extensions: ?', stage, message);

    if (!this._extensions) return callback.call(context, message);
    var extensions = this._extensions.slice();

    var pipe = function(message) {
      if (!message) return callback.call(context, message);

      var extension = extensions.shift();
      if (!extension) return callback.call(context, message);

      var fn = extension[stage];
      if (!fn) return pipe(message);

      if (fn.length >= 3) extension[stage](message, request, pipe);
      else                extension[stage](message, pipe);
    };
    pipe(message);
  }
};

Faye.extend(Faye.Extensible, Faye.Logging);

Faye.Channel = Faye.Class({
  initialize: function(name) {
    this.id = this.name = name;
  },

  push: function(message) {
    this.trigger('message', message);
  },

  isUnused: function() {
    return this.countListeners('message') === 0;
  }
});

Faye.extend(Faye.Channel.prototype, Faye.Publisher);

Faye.extend(Faye.Channel, {
  HANDSHAKE:    '/meta/handshake',
  CONNECT:      '/meta/connect',
  SUBSCRIBE:    '/meta/subscribe',
  UNSUBSCRIBE:  '/meta/unsubscribe',
  DISCONNECT:   '/meta/disconnect',

  META:         'meta',
  SERVICE:      'service',

  expand: function(name) {
    var segments = this.parse(name),
        channels = ['/**', name];

    var copy = segments.slice();
    copy[copy.length - 1] = '*';
    channels.push(this.unparse(copy));

    for (var i = 1, n = segments.length; i < n; i++) {
      copy = segments.slice(0, i);
      copy.push('**');
      channels.push(this.unparse(copy));
    }

    return channels;
  },

  isValid: function(name) {
    return Faye.Grammar.CHANNEL_NAME.test(name) ||
           Faye.Grammar.CHANNEL_PATTERN.test(name);
  },

  parse: function(name) {
    if (!this.isValid(name)) return null;
    return name.split('/').slice(1);
  },

  unparse: function(segments) {
    return '/' + segments.join('/');
  },

  isMeta: function(name) {
    var segments = this.parse(name);
    return segments ? (segments[0] === this.META) : null;
  },

  isService: function(name) {
    var segments = this.parse(name);
    return segments ? (segments[0] === this.SERVICE) : null;
  },

  isSubscribable: function(name) {
    if (!this.isValid(name)) return null;
    return !this.isMeta(name) && !this.isService(name);
  },

  Set: Faye.Class({
    initialize: function() {
      this._channels = {};
    },

    getKeys: function() {
      var keys = [];
      for (var key in this._channels) keys.push(key);
      return keys;
    },

    remove: function(name) {
      delete this._channels[name];
    },

    hasSubscription: function(name) {
      return this._channels.hasOwnProperty(name);
    },

    subscribe: function(names, callback, context) {
      var name;
      for (var i = 0, n = names.length; i < n; i++) {
        name = names[i];
        var channel = this._channels[name] = this._channels[name] || new Faye.Channel(name);
        if (callback) channel.bind('message', callback, context);
      }
    },

    unsubscribe: function(name, callback, context) {
      var channel = this._channels[name];
      if (!channel) return false;
      channel.unbind('message', callback, context);

      if (channel.isUnused()) {
        this.remove(name);
        return true;
      } else {
        return false;
      }
    },

    distributeMessage: function(message) {
      var channels = Faye.Channel.expand(message.channel);

      for (var i = 0, n = channels.length; i < n; i++) {
        var channel = this._channels[channels[i]];
        if (channel) channel.trigger('message', message.data);
      }
    }
  })
});

Faye.Publication = Faye.Class(Faye.Deferrable);

Faye.Subscription = Faye.Class({
  initialize: function(client, channels, callback, context) {
    this._client    = client;
    this._channels  = channels;
    this._callback  = callback;
    this._context     = context;
    this._cancelled = false;
  },

  cancel: function() {
    if (this._cancelled) return;
    this._client.unsubscribe(this._channels, this._callback, this._context);
    this._cancelled = true;
  },

  unsubscribe: function() {
    this.cancel();
  }
});

Faye.extend(Faye.Subscription.prototype, Faye.Deferrable);

Faye.Client = Faye.Class({
  UNCONNECTED:        1,
  CONNECTING:         2,
  CONNECTED:          3,
  DISCONNECTED:       4,

  HANDSHAKE:          'handshake',
  RETRY:              'retry',
  NONE:               'none',

  CONNECTION_TIMEOUT: 60,

  DEFAULT_ENDPOINT:   '/bayeux',
  INTERVAL:           0,

  initialize: function(endpoint, options) {
    this.info('New client created for ?', endpoint);
    options = options || {};

    Faye.validateOptions(options, ['interval', 'timeout', 'endpoints', 'proxy', 'retry', 'scheduler', 'websocketExtensions', 'tls', 'ca']);

    this._endpoint   = endpoint || this.DEFAULT_ENDPOINT;
    this._channels   = new Faye.Channel.Set();
    this._dispatcher = new Faye.Dispatcher(this, this._endpoint, options);

    this._messageId = 0;
    this._state     = this.UNCONNECTED;

    this._responseCallbacks = {};

    this._advice = {
      reconnect: this.RETRY,
      interval:  1000 * (options.interval || this.INTERVAL),
      timeout:   1000 * (options.timeout  || this.CONNECTION_TIMEOUT)
    };
    this._dispatcher.timeout = this._advice.timeout / 1000;

    this._dispatcher.bind('message', this._receiveMessage, this);

    if (Faye.Event && Faye.ENV.onbeforeunload !== undefined)
      Faye.Event.on(Faye.ENV, 'beforeunload', function() {
        if (Faye.indexOf(this._dispatcher._disabled, 'autodisconnect') < 0)
          this.disconnect();
      }, this);
  },

  addWebsocketExtension: function(extension) {
    return this._dispatcher.addWebsocketExtension(extension);
  },

  disable: function(feature) {
    return this._dispatcher.disable(feature);
  },

  setHeader: function(name, value) {
    return this._dispatcher.setHeader(name, value);
  },

  // Request
  // MUST include:  * channel
  //                * version
  //                * supportedConnectionTypes
  // MAY include:   * minimumVersion
  //                * ext
  //                * id
  //
  // Success Response                             Failed Response
  // MUST include:  * channel                     MUST include:  * channel
  //                * version                                    * successful
  //                * supportedConnectionTypes                   * error
  //                * clientId                    MAY include:   * supportedConnectionTypes
  //                * successful                                 * advice
  // MAY include:   * minimumVersion                             * version
  //                * advice                                     * minimumVersion
  //                * ext                                        * ext
  //                * id                                         * id
  //                * authSuccessful
  handshake: function(callback, context) {
    if (this._advice.reconnect === this.NONE) return;
    if (this._state !== this.UNCONNECTED) return;

    this._state = this.CONNECTING;
    var self = this;

    this.info('Initiating handshake with ?', Faye.URI.stringify(this._endpoint));
    this._dispatcher.selectTransport(Faye.MANDATORY_CONNECTION_TYPES);

    this._sendMessage({
      channel:                  Faye.Channel.HANDSHAKE,
      version:                  Faye.BAYEUX_VERSION,
      supportedConnectionTypes: this._dispatcher.getConnectionTypes()

    }, {}, function(response) {

      if (response.successful) {
        this._state = this.CONNECTED;
        this._dispatcher.clientId  = response.clientId;

        this._dispatcher.selectTransport(response.supportedConnectionTypes);

        this.info('Handshake successful: ?', this._dispatcher.clientId);

        this.subscribe(this._channels.getKeys(), true);
        if (callback) Faye.Promise.defer(function() { callback.call(context) });

      } else {
        this.info('Handshake unsuccessful');
        Faye.ENV.setTimeout(function() { self.handshake(callback, context) }, this._dispatcher.retry * 1000);
        this._state = this.UNCONNECTED;
      }
    }, this);
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  //                * connectionType                     * clientId
  // MAY include:   * ext                 MAY include:   * error
  //                * id                                 * advice
  //                                                     * ext
  //                                                     * id
  //                                                     * timestamp
  connect: function(callback, context) {
    if (this._advice.reconnect === this.NONE) return;
    if (this._state === this.DISCONNECTED) return;

    if (this._state === this.UNCONNECTED)
      return this.handshake(function() { this.connect(callback, context) }, this);

    this.callback(callback, context);
    if (this._state !== this.CONNECTED) return;

    this.info('Calling deferred actions for ?', this._dispatcher.clientId);
    this.setDeferredStatus('succeeded');
    this.setDeferredStatus('unknown');

    if (this._connectRequest) return;
    this._connectRequest = true;

    this.info('Initiating connection for ?', this._dispatcher.clientId);

    this._sendMessage({
      channel:        Faye.Channel.CONNECT,
      clientId:       this._dispatcher.clientId,
      connectionType: this._dispatcher.connectionType

    }, {}, this._cycleConnection, this);
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  // MAY include:   * ext                                * clientId
  //                * id                  MAY include:   * error
  //                                                     * ext
  //                                                     * id
  disconnect: function() {
    if (this._state !== this.CONNECTED) return;
    this._state = this.DISCONNECTED;

    this.info('Disconnecting ?', this._dispatcher.clientId);
    var promise = new Faye.Publication();

    this._sendMessage({
      channel:  Faye.Channel.DISCONNECT,
      clientId: this._dispatcher.clientId

    }, {}, function(response) {
      if (response.successful) {
        this._dispatcher.close();
        promise.setDeferredStatus('succeeded');
      } else {
        promise.setDeferredStatus('failed', Faye.Error.parse(response.error));
      }
    }, this);

    this.info('Clearing channel listeners for ?', this._dispatcher.clientId);
    this._channels = new Faye.Channel.Set();

    return promise;
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  //                * subscription                       * clientId
  // MAY include:   * ext                                * subscription
  //                * id                  MAY include:   * error
  //                                                     * advice
  //                                                     * ext
  //                                                     * id
  //                                                     * timestamp
  subscribe: function(channel, callback, context) {
    if (channel instanceof Array)
      return Faye.map(channel, function(c) {
        return this.subscribe(c, callback, context);
      }, this);

    var subscription = new Faye.Subscription(this, channel, callback, context),
        force        = (callback === true),
        hasSubscribe = this._channels.hasSubscription(channel);

    if (hasSubscribe && !force) {
      this._channels.subscribe([channel], callback, context);
      subscription.setDeferredStatus('succeeded');
      return subscription;
    }

    this.connect(function() {
      this.info('Client ? attempting to subscribe to ?', this._dispatcher.clientId, channel);
      if (!force) this._channels.subscribe([channel], callback, context);

      this._sendMessage({
        channel:      Faye.Channel.SUBSCRIBE,
        clientId:     this._dispatcher.clientId,
        subscription: channel

      }, {}, function(response) {
        if (!response.successful) {
          subscription.setDeferredStatus('failed', Faye.Error.parse(response.error));
          return this._channels.unsubscribe(channel, callback, context);
        }

        var channels = [].concat(response.subscription);
        this.info('Subscription acknowledged for ? to ?', this._dispatcher.clientId, channels);
        subscription.setDeferredStatus('succeeded');
      }, this);
    }, this);

    return subscription;
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * clientId                           * successful
  //                * subscription                       * clientId
  // MAY include:   * ext                                * subscription
  //                * id                  MAY include:   * error
  //                                                     * advice
  //                                                     * ext
  //                                                     * id
  //                                                     * timestamp
  unsubscribe: function(channel, callback, context) {
    if (channel instanceof Array)
      return Faye.map(channel, function(c) {
        return this.unsubscribe(c, callback, context);
      }, this);

    var dead = this._channels.unsubscribe(channel, callback, context);
    if (!dead) return;

    this.connect(function() {
      this.info('Client ? attempting to unsubscribe from ?', this._dispatcher.clientId, channel);

      this._sendMessage({
        channel:      Faye.Channel.UNSUBSCRIBE,
        clientId:     this._dispatcher.clientId,
        subscription: channel

      }, {}, function(response) {
        if (!response.successful) return;

        var channels = [].concat(response.subscription);
        this.info('Unsubscription acknowledged for ? from ?', this._dispatcher.clientId, channels);
      }, this);
    }, this);
  },

  // Request                              Response
  // MUST include:  * channel             MUST include:  * channel
  //                * data                               * successful
  // MAY include:   * clientId            MAY include:   * id
  //                * id                                 * error
  //                * ext                                * ext
  publish: function(channel, data, options) {
    Faye.validateOptions(options || {}, ['attempts', 'deadline']);
    var publication = new Faye.Publication();

    this.connect(function() {
      this.info('Client ? queueing published message to ?: ?', this._dispatcher.clientId, channel, data);

      this._sendMessage({
        channel:  channel,
        data:     data,
        clientId: this._dispatcher.clientId

      }, options, function(response) {
        if (response.successful)
          publication.setDeferredStatus('succeeded');
        else
          publication.setDeferredStatus('failed', Faye.Error.parse(response.error));
      }, this);
    }, this);

    return publication;
  },

  _sendMessage: function(message, options, callback, context) {
    message.id = this._generateMessageId();

    var timeout = this._advice.timeout
                ? 1.2 * this._advice.timeout / 1000
                : 1.2 * this._dispatcher.retry;

    this.pipeThroughExtensions('outgoing', message, null, function(message) {
      if (!message) return;
      if (callback) this._responseCallbacks[message.id] = [callback, context];
      this._dispatcher.sendMessage(message, timeout, options || {});
    }, this);
  },

  _generateMessageId: function() {
    this._messageId += 1;
    if (this._messageId >= Math.pow(2,32)) this._messageId = 0;
    return this._messageId.toString(36);
  },

  _receiveMessage: function(message) {
    var id = message.id, callback;

    if (message.successful !== undefined) {
      callback = this._responseCallbacks[id];
      delete this._responseCallbacks[id];
    }

    this.pipeThroughExtensions('incoming', message, null, function(message) {
      if (!message) return;
      if (message.advice) this._handleAdvice(message.advice);
      this._deliverMessage(message);
      if (callback) callback[0].call(callback[1], message);
    }, this);
  },

  _handleAdvice: function(advice) {
    Faye.extend(this._advice, advice);
    this._dispatcher.timeout = this._advice.timeout / 1000;

    if (this._advice.reconnect === this.HANDSHAKE && this._state !== this.DISCONNECTED) {
      this._state = this.UNCONNECTED;
      this._dispatcher.clientId = null;
      this._cycleConnection();
    }
  },

  _deliverMessage: function(message) {
    if (!message.channel || message.data === undefined) return;
    this.info('Client ? calling listeners for ? with ?', this._dispatcher.clientId, message.channel, message.data);
    this._channels.distributeMessage(message);
  },

  _cycleConnection: function() {
    if (this._connectRequest) {
      this._connectRequest = null;
      this.info('Closed connection for ?', this._dispatcher.clientId);
    }
    var self = this;
    Faye.ENV.setTimeout(function() { self.connect() }, this._advice.interval);
  }
});

Faye.extend(Faye.Client.prototype, Faye.Deferrable);
Faye.extend(Faye.Client.prototype, Faye.Publisher);
Faye.extend(Faye.Client.prototype, Faye.Logging);
Faye.extend(Faye.Client.prototype, Faye.Extensible);

Faye.Dispatcher = Faye.Class({
  MAX_REQUEST_SIZE: 2048,
  DEFAULT_RETRY:    5,

  UP:   1,
  DOWN: 2,

  initialize: function(client, endpoint, options) {
    this._client     = client;
    this.endpoint    = Faye.URI.parse(endpoint);
    this._alternates = options.endpoints || {};

    this.cookies      = Faye.Cookies && new Faye.Cookies.CookieJar();
    this._disabled    = [];
    this._envelopes   = {};
    this.headers      = {};
    this.retry        = options.retry || this.DEFAULT_RETRY;
    this._scheduler   = options.scheduler || Faye.Scheduler;
    this._state       = 0;
    this.transports   = {};
    this.wsExtensions = [];

    this.proxy = options.proxy || {};
    if (typeof this._proxy === 'string') this._proxy = {origin: this._proxy};

    var exts = options.websocketExtensions;
    if (exts) {
      exts = [].concat(exts);
      for (var i = 0, n = exts.length; i < n; i++)
        this.addWebsocketExtension(exts[i]);
    }

    this.tls = options.tls || {};
    this.tls.ca = this.tls.ca || options.ca;

    for (var type in this._alternates)
      this._alternates[type] = Faye.URI.parse(this._alternates[type]);

    this.maxRequestSize = this.MAX_REQUEST_SIZE;
  },

  endpointFor: function(connectionType) {
    return this._alternates[connectionType] || this.endpoint;
  },

  addWebsocketExtension: function(extension) {
    this.wsExtensions.push(extension);
  },

  disable: function(feature) {
    this._disabled.push(feature);
  },

  setHeader: function(name, value) {
    this.headers[name] = value;
  },

  close: function() {
    var transport = this._transport;
    delete this._transport;
    if (transport) transport.close();
  },

  getConnectionTypes: function() {
    return Faye.Transport.getConnectionTypes();
  },

  selectTransport: function(transportTypes) {
    Faye.Transport.get(this, transportTypes, this._disabled, function(transport) {
      this.debug('Selected ? transport for ?', transport.connectionType, Faye.URI.stringify(transport.endpoint));

      if (transport === this._transport) return;
      if (this._transport) this._transport.close();

      this._transport = transport;
      this.connectionType = transport.connectionType;
    }, this);
  },

  sendMessage: function(message, timeout, options) {
    options = options || {};

    var id       = message.id,
        attempts = options.attempts,
        deadline = options.deadline && new Date().getTime() + (options.deadline * 1000),
        envelope = this._envelopes[id],
        scheduler;

    if (!envelope) {
      scheduler = new this._scheduler(message, {timeout: timeout, interval: this.retry, attempts: attempts, deadline: deadline});
      envelope  = this._envelopes[id] = {message: message, scheduler: scheduler};
    }

    this._sendEnvelope(envelope);
  },

  _sendEnvelope: function(envelope) {
    if (!this._transport) return;
    if (envelope.request || envelope.timer) return;

    var message   = envelope.message,
        scheduler = envelope.scheduler,
        self      = this;

    if (!scheduler.isDeliverable()) {
      scheduler.abort();
      delete this._envelopes[message.id];
      return;
    }

    envelope.timer = Faye.ENV.setTimeout(function() {
      self.handleError(message);
    }, scheduler.getTimeout() * 1000);

    scheduler.send();
    envelope.request = this._transport.sendMessage(message);
  },

  handleResponse: function(reply) {
    var envelope = this._envelopes[reply.id];

    if (reply.successful !== undefined && envelope) {
      envelope.scheduler.succeed();
      delete this._envelopes[reply.id];
      Faye.ENV.clearTimeout(envelope.timer);
    }

    this.trigger('message', reply);

    if (this._state === this.UP) return;
    this._state = this.UP;
    this._client.trigger('transport:up');
  },

  handleError: function(message, immediate) {
    var envelope = this._envelopes[message.id],
        request  = envelope && envelope.request,
        self     = this;

    if (!request) return;

    request.then(function(req) {
      if (req && req.abort) req.abort();
    });

    var scheduler = envelope.scheduler;
    scheduler.fail();

    Faye.ENV.clearTimeout(envelope.timer);
    envelope.request = envelope.timer = null;

    if (immediate) {
      this._sendEnvelope(envelope);
    } else {
      envelope.timer = Faye.ENV.setTimeout(function() {
        envelope.timer = null;
        self._sendEnvelope(envelope);
      }, scheduler.getInterval() * 1000);
    }

    if (this._state === this.DOWN) return;
    this._state = this.DOWN;
    this._client.trigger('transport:down');
  }
});

Faye.extend(Faye.Dispatcher.prototype, Faye.Publisher);
Faye.extend(Faye.Dispatcher.prototype, Faye.Logging);

Faye.Scheduler = function(message, options) {
  this.message  = message;
  this.options  = options;
  this.attempts = 0;
};

Faye.extend(Faye.Scheduler.prototype, {
  getTimeout: function() {
    return this.options.timeout;
  },

  getInterval: function() {
    return this.options.interval;
  },

  isDeliverable: function() {
    var attempts = this.options.attempts,
        made     = this.attempts,
        deadline = this.options.deadline,
        now      = new Date().getTime();

    if (attempts !== undefined && made >= attempts)
      return false;

    if (deadline !== undefined && now > deadline)
      return false;

    return true;
  },

  send: function() {
    this.attempts += 1;
  },

  succeed: function() {},

  fail: function() {},

  abort: function() {}
});

Faye.Transport = Faye.extend(Faye.Class({
  DEFAULT_PORTS:    {'http:': 80, 'https:': 443, 'ws:': 80, 'wss:': 443},
  SECURE_PROTOCOLS: ['https:', 'wss:'],
  MAX_DELAY:        0,

  batching:  true,

  initialize: function(dispatcher, endpoint) {
    this._dispatcher = dispatcher;
    this.endpoint    = endpoint;
    this._outbox     = [];
    this._proxy      = Faye.extend({}, this._dispatcher.proxy);

    if (!this._proxy.origin && Faye.NodeAdapter) {
      this._proxy.origin = Faye.indexOf(this.SECURE_PROTOCOLS, this.endpoint.protocol) >= 0
                         ? (process.env.HTTPS_PROXY || process.env.https_proxy)
                         : (process.env.HTTP_PROXY  || process.env.http_proxy);
    }
  },

  close: function() {},

  encode: function(messages) {
    return '';
  },

  sendMessage: function(message) {
    this.debug('Client ? sending message to ?: ?',
               this._dispatcher.clientId, Faye.URI.stringify(this.endpoint), message);

    if (!this.batching) return Faye.Promise.fulfilled(this.request([message]));

    this._outbox.push(message);
    this._promise = this._promise || new Faye.Promise();
    this._flushLargeBatch();

    if (message.channel === Faye.Channel.HANDSHAKE) {
      this.addTimeout('publish', 0.01, this._flush, this);
      return this._promise;
    }

    if (message.channel === Faye.Channel.CONNECT)
      this._connectMessage = message;

    this.addTimeout('publish', this.MAX_DELAY, this._flush, this);
    return this._promise;
  },

  _flush: function() {
    this.removeTimeout('publish');

    if (this._outbox.length > 1 && this._connectMessage)
      this._connectMessage.advice = {timeout: 0};

    Faye.Promise.fulfill(this._promise, this.request(this._outbox));
    delete this._promise;

    this._connectMessage = null;
    this._outbox = [];
  },

  _flushLargeBatch: function() {
    var string = this.encode(this._outbox);
    if (string.length < this._dispatcher.maxRequestSize) return;
    var last = this._outbox.pop();
    this._flush();
    if (last) this._outbox.push(last);
  },

  _receive: function(replies) {
    if (!replies) return;
    replies = [].concat(replies);

    this.debug('Client ? received from ? via ?: ?',
               this._dispatcher.clientId, Faye.URI.stringify(this.endpoint), this.connectionType, replies);

    for (var i = 0, n = replies.length; i < n; i++)
      this._dispatcher.handleResponse(replies[i]);
  },

  _handleError: function(messages, immediate) {
    messages = [].concat(messages);

    this.debug('Client ? failed to send to ? via ?: ?',
               this._dispatcher.clientId, Faye.URI.stringify(this.endpoint), this.connectionType, messages);

    for (var i = 0, n = messages.length; i < n; i++)
      this._dispatcher.handleError(messages[i]);
  },

  _getCookies: function() {
    var cookies = this._dispatcher.cookies,
        url     = Faye.URI.stringify(this.endpoint);

    if (!cookies) return '';

    return Faye.map(cookies.getCookiesSync(url), function(cookie) {
      return cookie.cookieString();
    }).join('; ');
  },

  _storeCookies: function(setCookie) {
    var cookies = this._dispatcher.cookies,
        url     = Faye.URI.stringify(this.endpoint),
        cookie;

    if (!setCookie || !cookies) return;
    setCookie = [].concat(setCookie);

    for (var i = 0, n = setCookie.length; i < n; i++) {
      cookie = Faye.Cookies.Cookie.parse(setCookie[i]);
      cookies.setCookieSync(cookie, url);
    }
  }

}), {
  get: function(dispatcher, allowed, disabled, callback, context) {
    var endpoint = dispatcher.endpoint;

    Faye.asyncEach(this._transports, function(pair, resume) {
      var connType     = pair[0], klass = pair[1],
          connEndpoint = dispatcher.endpointFor(connType);

      if (Faye.indexOf(disabled, connType) >= 0)
        return resume();

      if (Faye.indexOf(allowed, connType) < 0) {
        klass.isUsable(dispatcher, connEndpoint, function() {});
        return resume();
      }

      klass.isUsable(dispatcher, connEndpoint, function(isUsable) {
        if (!isUsable) return resume();
        var transport = klass.hasOwnProperty('create') ? klass.create(dispatcher, connEndpoint) : new klass(dispatcher, connEndpoint);
        callback.call(context, transport);
      });
    }, function() {
      throw new Error('Could not find a usable connection type for ' + Faye.URI.stringify(endpoint));
    });
  },

  register: function(type, klass) {
    this._transports.push([type, klass]);
    klass.prototype.connectionType = type;
  },

  getConnectionTypes: function() {
    return Faye.map(this._transports, function(t) { return t[0] });
  },

  _transports: []
});

Faye.extend(Faye.Transport.prototype, Faye.Logging);
Faye.extend(Faye.Transport.prototype, Faye.Timeouts);

Faye.Event = {
  _registry: [],

  on: function(element, eventName, callback, context) {
    var wrapped = function() { callback.call(context) };

    if (element.addEventListener)
      element.addEventListener(eventName, wrapped, false);
    else
      element.attachEvent('on' + eventName, wrapped);

    this._registry.push({
      _element:   element,
      _type:      eventName,
      _callback:  callback,
      _context:     context,
      _handler:   wrapped
    });
  },

  detach: function(element, eventName, callback, context) {
    var i = this._registry.length, register;
    while (i--) {
      register = this._registry[i];

      if ((element    && element    !== register._element)   ||
          (eventName  && eventName  !== register._type)      ||
          (callback   && callback   !== register._callback)  ||
          (context      && context      !== register._context))
        continue;

      if (register._element.removeEventListener)
        register._element.removeEventListener(register._type, register._handler, false);
      else
        register._element.detachEvent('on' + register._type, register._handler);

      this._registry.splice(i,1);
      register = null;
    }
  }
};

if (Faye.ENV.onunload !== undefined) Faye.Event.on(Faye.ENV, 'unload', Faye.Event.detach, Faye.Event);

/*
    json2.js
    2013-05-26

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html


    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.


    This file creates a global JSON object containing two methods: stringify
    and parse.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the value

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 ? '0' + n : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date ?
                    'Date(' + this[key] + ')' : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.
*/

/*jslint evil: true, regexp: true */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
    call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

if (typeof JSON !== 'object') {
    JSON = {};
}

(function () {
    'use strict';

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function () {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear()     + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate())      + 'T' +
                    f(this.getUTCHours())     + ':' +
                    f(this.getUTCMinutes())   + ':' +
                    f(this.getUTCSeconds())   + 'Z'
                : null;
        };

        String.prototype.toJSON      =
            Number.prototype.toJSON  =
            Boolean.prototype.toJSON = function () {
                return this.valueOf();
            };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? '[]'
                    : gap
                    ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                    : '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === 'string') {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? '{}'
                : gap
                ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    Faye.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

        var i;
        gap = '';
        indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

        if (typeof space === 'number') {
            for (i = 0; i < space; i += 1) {
                indent += ' ';
            }

// If the space parameter is a string, it will be used as the indent string.

        } else if (typeof space === 'string') {
            indent = space;
        }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

        rep = replacer;
        if (replacer && typeof replacer !== 'function' &&
                (typeof replacer !== 'object' ||
                typeof replacer.length !== 'number')) {
            throw new Error('JSON.stringify');
        }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

        return str('', {'': value});
    };

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = Faye.stringify;
    }

// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                    .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function'
                    ? walk({'': j}, '')
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());

Faye.Transport.WebSocket = Faye.extend(Faye.Class(Faye.Transport, {
  UNCONNECTED:  1,
  CONNECTING:   2,
  CONNECTED:    3,

  batching:     false,

  isUsable: function(callback, context) {
    this.callback(function() { callback.call(context, true) });
    this.errback(function() { callback.call(context, false) });
    this.connect();
  },

  request: function(messages) {
    this._pending = this._pending || new Faye.Set();
    for (var i = 0, n = messages.length; i < n; i++) this._pending.add(messages[i]);

    var promise = new Faye.Promise();

    this.callback(function(socket) {
      if (!socket || socket.readyState !== 1) return;
      socket.send(Faye.toJSON(messages));
      Faye.Promise.fulfill(promise, socket);
    }, this);

    this.connect();

    return {
      abort: function() { promise.then(function(ws) { ws.close() }) }
    };
  },

  connect: function() {
    if (Faye.Transport.WebSocket._unloaded) return;

    this._state = this._state || this.UNCONNECTED;
    if (this._state !== this.UNCONNECTED) return;
    this._state = this.CONNECTING;

    var socket = this._createSocket();
    if (!socket) return this.setDeferredStatus('failed');

    var self = this;

    socket.onopen = function() {
      if (socket.headers) self._storeCookies(socket.headers['set-cookie']);
      self._socket = socket;
      self._state = self.CONNECTED;
      self._everConnected = true;
      self._ping();
      self.setDeferredStatus('succeeded', socket);
    };

    var closed = false;
    socket.onclose = socket.onerror = function() {
      if (closed) return;
      closed = true;

      var wasConnected = (self._state === self.CONNECTED);
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;

      delete self._socket;
      self._state = self.UNCONNECTED;
      self.removeTimeout('ping');
      self.setDeferredStatus('unknown');

      var pending = self._pending ? self._pending.toArray() : [];
      delete self._pending;

      if (wasConnected) {
        self._handleError(pending, true);
      } else if (self._everConnected) {
        self._handleError(pending);
      } else {
        self.setDeferredStatus('failed');
      }
    };

    socket.onmessage = function(event) {
      var replies = JSON.parse(event.data);
      if (!replies) return;

      replies = [].concat(replies);

      for (var i = 0, n = replies.length; i < n; i++) {
        if (replies[i].successful === undefined) continue;
        self._pending.remove(replies[i]);
      }
      self._receive(replies);
    };
  },

  close: function() {
    if (!this._socket) return;
    this._socket.close();
  },

  _createSocket: function() {
    var url        = Faye.Transport.WebSocket.getSocketUrl(this.endpoint),
        headers    = this._dispatcher.headers,
        extensions = this._dispatcher.wsExtensions,
        cookie     = this._getCookies(),
        tls        = this._dispatcher.tls,
        options    = {extensions: extensions, headers: headers, proxy: this._proxy, tls: tls};

    if (cookie !== '') options.headers['Cookie'] = cookie;

    if (Faye.WebSocket)        return new Faye.WebSocket.Client(url, [], options);
    if (Faye.ENV.MozWebSocket) return new MozWebSocket(url);
    if (Faye.ENV.WebSocket)    return new WebSocket(url);
  },

  _ping: function() {
    if (!this._socket) return;
    this._socket.send('[]');
    this.addTimeout('ping', this._dispatcher.timeout / 2, this._ping, this);
  }

}), {
  PROTOCOLS: {
    'http:':  'ws:',
    'https:': 'wss:'
  },

  create: function(dispatcher, endpoint) {
    var sockets = dispatcher.transports.websocket = dispatcher.transports.websocket || {};
    sockets[endpoint.href] = sockets[endpoint.href] || new this(dispatcher, endpoint);
    return sockets[endpoint.href];
  },

  getSocketUrl: function(endpoint) {
    endpoint = Faye.copyObject(endpoint);
    endpoint.protocol = this.PROTOCOLS[endpoint.protocol];
    return Faye.URI.stringify(endpoint);
  },

  isUsable: function(dispatcher, endpoint, callback, context) {
    this.create(dispatcher, endpoint).isUsable(callback, context);
  }
});

Faye.extend(Faye.Transport.WebSocket.prototype, Faye.Deferrable);
Faye.Transport.register('websocket', Faye.Transport.WebSocket);

if (Faye.Event && Faye.ENV.onbeforeunload !== undefined)
  Faye.Event.on(Faye.ENV, 'beforeunload', function() {
    Faye.Transport.WebSocket._unloaded = true;
  });

Faye.Transport.EventSource = Faye.extend(Faye.Class(Faye.Transport, {
  initialize: function(dispatcher, endpoint) {
    Faye.Transport.prototype.initialize.call(this, dispatcher, endpoint);
    if (!Faye.ENV.EventSource) return this.setDeferredStatus('failed');

    this._xhr = new Faye.Transport.XHR(dispatcher, endpoint);

    endpoint = Faye.copyObject(endpoint);
    endpoint.pathname += '/' + dispatcher.clientId;

    var socket = new EventSource(Faye.URI.stringify(endpoint)),
        self   = this;

    socket.onopen = function() {
      self._everConnected = true;
      self.setDeferredStatus('succeeded');
    };

    socket.onerror = function() {
      if (self._everConnected) {
        self._handleError([]);
      } else {
        self.setDeferredStatus('failed');
        socket.close();
      }
    };

    socket.onmessage = function(event) {
      self._receive(JSON.parse(event.data));
    };

    this._socket = socket;
  },

  close: function() {
    if (!this._socket) return;
    this._socket.onopen = this._socket.onerror = this._socket.onmessage = null;
    this._socket.close();
    delete this._socket;
  },

  isUsable: function(callback, context) {
    this.callback(function() { callback.call(context, true) });
    this.errback(function() { callback.call(context, false) });
  },

  encode: function(messages) {
    return this._xhr.encode(messages);
  },

  request: function(messages) {
    return this._xhr.request(messages);
  }

}), {
  isUsable: function(dispatcher, endpoint, callback, context) {
    var id = dispatcher.clientId;
    if (!id) return callback.call(context, false);

    Faye.Transport.XHR.isUsable(dispatcher, endpoint, function(usable) {
      if (!usable) return callback.call(context, false);
      this.create(dispatcher, endpoint).isUsable(callback, context);
    }, this);
  },

  create: function(dispatcher, endpoint) {
    var sockets = dispatcher.transports.eventsource = dispatcher.transports.eventsource || {},
        id      = dispatcher.clientId;

    var url = Faye.copyObject(endpoint);
    url.pathname += '/' + (id || '');
    url = Faye.URI.stringify(url);

    sockets[url] = sockets[url] || new this(dispatcher, endpoint);
    return sockets[url];
  }
});

Faye.extend(Faye.Transport.EventSource.prototype, Faye.Deferrable);
Faye.Transport.register('eventsource', Faye.Transport.EventSource);

Faye.Transport.XHR = Faye.extend(Faye.Class(Faye.Transport, {
  encode: function(messages) {
    return Faye.toJSON(messages);
  },

  request: function(messages) {
    var href = this.endpoint.href,
        xhr  = Faye.ENV.ActiveXObject ? new ActiveXObject('Microsoft.XMLHTTP') : new XMLHttpRequest(),
        self = this;

    xhr.open('POST', href, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Pragma', 'no-cache');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    var headers = this._dispatcher.headers;
    for (var key in headers) {
      if (!headers.hasOwnProperty(key)) continue;
      xhr.setRequestHeader(key, headers[key]);
    }

    var abort = function() { xhr.abort() };
    if (Faye.ENV.onbeforeunload !== undefined) Faye.Event.on(Faye.ENV, 'beforeunload', abort);

    xhr.onreadystatechange = function() {
      if (!xhr || xhr.readyState !== 4) return;

      var replies    = null,
          status     = xhr.status,
          text       = xhr.responseText,
          successful = (status >= 200 && status < 300) || status === 304 || status === 1223;

      if (Faye.ENV.onbeforeunload !== undefined) Faye.Event.detach(Faye.ENV, 'beforeunload', abort);
      xhr.onreadystatechange = function() {};
      xhr = null;

      if (!successful) return self._handleError(messages);

      try {
        replies = JSON.parse(text);
      } catch (e) {}

      if (replies)
        self._receive(replies);
      else
        self._handleError(messages);
    };

    xhr.send(this.encode(messages));
    return xhr;
  }
}), {
  isUsable: function(dispatcher, endpoint, callback, context) {
    callback.call(context, Faye.URI.isSameOrigin(endpoint));
  }
});

Faye.Transport.register('long-polling', Faye.Transport.XHR);

Faye.Transport.CORS = Faye.extend(Faye.Class(Faye.Transport, {
  encode: function(messages) {
    return 'message=' + encodeURIComponent(Faye.toJSON(messages));
  },

  request: function(messages) {
    var xhrClass = Faye.ENV.XDomainRequest ? XDomainRequest : XMLHttpRequest,
        xhr      = new xhrClass(),
        id       = ++Faye.Transport.CORS._id,
        headers  = this._dispatcher.headers,
        self     = this,
        key;

    xhr.open('POST', Faye.URI.stringify(this.endpoint), true);

    if (xhr.setRequestHeader) {
      xhr.setRequestHeader('Pragma', 'no-cache');
      for (key in headers) {
        if (!headers.hasOwnProperty(key)) continue;
        xhr.setRequestHeader(key, headers[key]);
      }
    }

    var cleanUp = function() {
      if (!xhr) return false;
      Faye.Transport.CORS._pending.remove(id);
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onprogress = null;
      xhr = null;
    };

    xhr.onload = function() {
      var replies = null;
      try {
        replies = JSON.parse(xhr.responseText);
      } catch (e) {}

      cleanUp();

      if (replies)
        self._receive(replies);
      else
        self._handleError(messages);
    };

    xhr.onerror = xhr.ontimeout = function() {
      cleanUp();
      self._handleError(messages);
    };

    xhr.onprogress = function() {};

    if (xhrClass === Faye.ENV.XDomainRequest)
      Faye.Transport.CORS._pending.add({id: id, xhr: xhr});

    xhr.send(this.encode(messages));
    return xhr;
  }
}), {
  _id:      0,
  _pending: new Faye.Set(),

  isUsable: function(dispatcher, endpoint, callback, context) {
    if (Faye.URI.isSameOrigin(endpoint))
      return callback.call(context, false);

    if (Faye.ENV.XDomainRequest)
      return callback.call(context, endpoint.protocol === Faye.ENV.location.protocol);

    if (Faye.ENV.XMLHttpRequest) {
      var xhr = new Faye.ENV.XMLHttpRequest();
      return callback.call(context, xhr.withCredentials !== undefined);
    }
    return callback.call(context, false);
  }
});

Faye.Transport.register('cross-origin-long-polling', Faye.Transport.CORS);

Faye.Transport.JSONP = Faye.extend(Faye.Class(Faye.Transport, {
 encode: function(messages) {
    var url = Faye.copyObject(this.endpoint);
    url.query.message = Faye.toJSON(messages);
    url.query.jsonp   = '__jsonp' + Faye.Transport.JSONP._cbCount + '__';
    return Faye.URI.stringify(url);
  },

  request: function(messages) {
    var head         = document.getElementsByTagName('head')[0],
        script       = document.createElement('script'),
        callbackName = Faye.Transport.JSONP.getCallbackName(),
        endpoint     = Faye.copyObject(this.endpoint),
        self         = this;

    endpoint.query.message = Faye.toJSON(messages);
    endpoint.query.jsonp   = callbackName;

    var cleanup = function() {
      if (!Faye.ENV[callbackName]) return false;
      Faye.ENV[callbackName] = undefined;
      try { delete Faye.ENV[callbackName] } catch (e) {}
      script.parentNode.removeChild(script);
    };

    Faye.ENV[callbackName] = function(replies) {
      cleanup();
      self._receive(replies);
    };

    script.type = 'text/javascript';
    script.src  = Faye.URI.stringify(endpoint);
    head.appendChild(script);

    script.onerror = function() {
      cleanup();
      self._handleError(messages);
    };

    return {abort: cleanup};
  }
}), {
  _cbCount: 0,

  getCallbackName: function() {
    this._cbCount += 1;
    return '__jsonp' + this._cbCount + '__';
  },

  isUsable: function(dispatcher, endpoint, callback, context) {
    callback.call(context, true);
  }
});

Faye.Transport.register('callback-polling', Faye.Transport.JSONP);

})();
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":4}],3:[function(require,module,exports){
/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @type {Function}
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified,
 *  else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

module.exports = isArray;

},{}],4:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

(function () {
  try {
    cachedSetTimeout = setTimeout;
  } catch (e) {
    cachedSetTimeout = function () {
      throw new Error('setTimeout is not defined');
    }
  }
  try {
    cachedClearTimeout = clearTimeout;
  } catch (e) {
    cachedClearTimeout = function () {
      throw new Error('clearTimeout is not defined');
    }
  }
} ())
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = cachedSetTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    cachedClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        cachedSetTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL3N0cmVhbWluZy5qcyIsIm5vZGVfbW9kdWxlcy9mYXllL2Jyb3dzZXIvZmF5ZS1icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC9pc0FycmF5LmpzIiwibm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDck1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNydEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcclxuICogQGZpbGUgTWFuYWdlcyBTdHJlYW1pbmcgQVBJc1xyXG4gKiBAYXV0aG9yIFNoaW5pY2hpIFRvbWl0YSA8c2hpbmljaGkudG9taXRhQGdtYWlsLmNvbT5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgZXZlbnRzID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnZXZlbnRzJyksXHJcbiAgICBpbmhlcml0cyA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJ2luaGVyaXRzJyksXHJcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnbG9kYXNoL2lzQXJyYXknKSxcclxuICAgIEZheWUgICA9IHJlcXVpcmUoJ2ZheWUnKSxcclxuICAgIGpzZm9yY2UgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCcuL2NvcmUnKTtcclxuXHJcbi8qKlxyXG4gKiBTdHJlYW1pbmcgQVBJIHRvcGljIGNsYXNzXHJcbiAqXHJcbiAqIEBjbGFzcyBTdHJlYW1pbmd+VG9waWNcclxuICogQHBhcmFtIHtTdHJlYW1pbmd9IHN0ZWFtaW5nIC0gU3RyZWFtaW5nIEFQSSBvYmplY3RcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBUb3BpYyBuYW1lXHJcbiAqL1xyXG52YXIgVG9waWMgPSBmdW5jdGlvbihzdHJlYW1pbmcsIG5hbWUpIHtcclxuICB0aGlzLl9zdHJlYW1pbmcgPSBzdHJlYW1pbmc7XHJcbiAgdGhpcy5uYW1lID0gbmFtZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBTdHJlYW1pbmd+U3RyZWFtaW5nTWVzc2FnZVxyXG4gKiBAcHJvcCB7T2JqZWN0fSBldmVudFxyXG4gKiBAcHJvcCB7T2JqZWN0fSBldmVudC50eXBlIC0gRXZlbnQgdHlwZVxyXG4gKiBAcHJvcCB7UmVjb3JkfSBzb2JqZWN0IC0gUmVjb3JkIGluZm9ybWF0aW9uXHJcbiAqL1xyXG4vKipcclxuICogU3Vic2NyaWJlIGxpc3RlbmVyIHRvIHRvcGljXHJcbiAqXHJcbiAqIEBtZXRob2QgU3RyZWFtaW5nflRvcGljI3N1YnNjcmliZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxTdHJlYW1pbmd+U3RyZWFtaW5nTWVzYXNnZT59IGxpc3RlbmVyIC0gU3RyZWFtaW5nIG1lc3NhZ2UgbGlzdGVuZXJcclxuICogQHJldHVybnMge1N1YnNjcmlwdGlvbn0gLSBGYXllIHN1YnNjcmlwdGlvbiBvYmplY3RcclxuICovXHJcblRvcGljLnByb3RvdHlwZS5zdWJzY3JpYmUgPSBmdW5jdGlvbihsaXN0ZW5lcikge1xyXG4gIHJldHVybiB0aGlzLl9zdHJlYW1pbmcuc3Vic2NyaWJlKHRoaXMubmFtZSwgbGlzdGVuZXIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFVuc3Vic2NyaWJlIGxpc3RlbmVyIGZyb20gdG9waWNcclxuICpcclxuICogQG1ldGhvZCBTdHJlYW1pbmd+VG9waWMjdW5zdWJzY3JpYmVcclxuICogQHBhcmFtIHtDYWxsYmFjay48U3RyZWFtaW5nflN0cmVhbWluZ01lc2FzZ2U+fSBsaXN0ZW5lciAtIFN0cmVhbWluZyBtZXNzYWdlIGxpc3RlbmVyXHJcbiAqIEByZXR1cm5zIHtTdHJlYW1pbmd+VG9waWN9XHJcbiAqL1xyXG5Ub3BpYy5wcm90b3R5cGUudW5zdWJzY3JpYmUgPSBmdW5jdGlvbihsaXN0ZW5lcikge1xyXG4gIHRoaXMuX3N0cmVhbWluZy51bnN1YnNjcmliZSh0aGlzLm5hbWUsIGxpc3RlbmVyKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG5cclxuLyoqXHJcbiAqIFN0cmVhbWluZyBBUEkgR2VuZXJpYyBTdHJlYW1pbmcgQ2hhbm5lbFxyXG4gKlxyXG4gKiBAY2xhc3MgU3RyZWFtaW5nfkNoYW5uZWxcclxuICogQHBhcmFtIHtTdHJlYW1pbmd9IHN0ZWFtaW5nIC0gU3RyZWFtaW5nIEFQSSBvYmplY3RcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBDaGFubmVsIG5hbWUgKHN0YXJ0cyB3aXRoIFwiL3UvXCIpXHJcbiAqL1xyXG52YXIgQ2hhbm5lbCA9IGZ1bmN0aW9uKHN0cmVhbWluZywgbmFtZSkge1xyXG4gIHRoaXMuX3N0cmVhbWluZyA9IHN0cmVhbWluZztcclxuICB0aGlzLl9uYW1lID0gbmFtZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTdWJzY3JpYmUgdG8gaGFubmVsXHJcbiAqXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFN0cmVhbWluZ35TdHJlYW1pbmdNZXNzYWdlPn0gbGlzdGVuZXIgLSBTdHJlYW1pbmcgbWVzc2FnZSBsaXN0ZW5lclxyXG4gKiBAcmV0dXJucyB7U3Vic2NyaXB0aW9ufSAtIEZheWUgc3Vic2NyaXB0aW9uIG9iamVjdFxyXG4gKi9cclxuQ2hhbm5lbC5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24obGlzdGVuZXIpIHtcclxuICByZXR1cm4gdGhpcy5fc3RyZWFtaW5nLnN1YnNjcmliZSh0aGlzLl9uYW1lLCBsaXN0ZW5lcik7XHJcbn07XHJcblxyXG5DaGFubmVsLnByb3RvdHlwZS51bnN1YnNjcmliZSA9IGZ1bmN0aW9uKGxpc3RlbmVyKSB7XHJcbiAgdGhpcy5fc3RyZWFtaW5nLnVuc3Vic2NyaWJlKHRoaXMuX25hbWUsIGxpc3RlbmVyKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbkNoYW5uZWwucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbihldmVudHMsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIGlzQXJyYXkgPSBpc0FycmF5KGV2ZW50cyk7XHJcbiAgZXZlbnRzID0gaXNBcnJheSA/IGV2ZW50cyA6IFsgZXZlbnRzIF07XHJcbiAgdmFyIGNvbm4gPSB0aGlzLl9zdHJlYW1pbmcuX2Nvbm47XHJcbiAgaWYgKCF0aGlzLl9pZCkge1xyXG4gICAgdGhpcy5faWQgPSBjb25uLnNvYmplY3QoJ1N0cmVhbWluZ0NoYW5uZWwnKS5maW5kT25lKHsgTmFtZTogdGhpcy5fbmFtZSB9LCAnSWQnKVxyXG4gICAgICAudGhlbihmdW5jdGlvbihyZWMpIHsgcmV0dXJuIHJlYy5JZCB9KTtcclxuICB9XHJcbiAgcmV0dXJuIHRoaXMuX2lkLnRoZW4oZnVuY3Rpb24oaWQpIHtcclxuICAgIHZhciBjaGFubmVsVXJsID0gJy9zb2JqZWN0cy9TdHJlYW1pbmdDaGFubmVsLycgKyBpZCArICcvcHVzaCc7XHJcbiAgICByZXR1cm4gY29ubi5yZXF1ZXN0UG9zdChjaGFubmVsVXJsLCB7IHB1c2hFdmVudHM6IGV2ZW50cyB9KTtcclxuICB9KS50aGVuKGZ1bmN0aW9uKHJldHMpIHtcclxuICAgIHJldHVybiBpc0FycmF5ID8gcmV0cyA6IHJldHNbMF07XHJcbiAgfSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG4vKipcclxuICogU3RyZWFtaW5nIEFQSSBjbGFzc1xyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQGV4dGVuZHMgZXZlbnRzLkV2ZW50RW1pdHRlclxyXG4gKiBAcGFyYW0ge0Nvbm5lY3Rpb259IGNvbm4gLSBDb25uZWN0aW9uIG9iamVjdFxyXG4gKi9cclxudmFyIFN0cmVhbWluZyA9IGZ1bmN0aW9uKGNvbm4pIHtcclxuICB0aGlzLl9jb25uID0gY29ubjtcclxufTtcclxuXHJcbmluaGVyaXRzKFN0cmVhbWluZywgZXZlbnRzLkV2ZW50RW1pdHRlcik7XHJcblxyXG4vKiogQHByaXZhdGUgKiovXHJcblN0cmVhbWluZy5wcm90b3R5cGUuX2NyZWF0ZUNsaWVudCA9IGZ1bmN0aW9uKHJlcGxheSkge1xyXG4gIHZhciBlbmRwb2ludFVybCA9IFsgdGhpcy5fY29ubi5pbnN0YW5jZVVybCwgXCJjb21ldGRcIiArIChyZXBsYXkgPyBcIi9yZXBsYXlcIiA6IFwiXCIpLCB0aGlzLl9jb25uLnZlcnNpb24gXS5qb2luKCcvJyk7XHJcbiAgdmFyIGZheWVDbGllbnQgPSBuZXcgRmF5ZS5DbGllbnQoZW5kcG9pbnRVcmwsIHt9KTtcclxuICBmYXllQ2xpZW50LnNldEhlYWRlcignQXV0aG9yaXphdGlvbicsICdPQXV0aCAnK3RoaXMuX2Nvbm4uYWNjZXNzVG9rZW4pO1xyXG4gIHJldHVybiBmYXllQ2xpZW50O1xyXG59O1xyXG5cclxuLyoqIEBwcml2YXRlICoqL1xyXG5TdHJlYW1pbmcucHJvdG90eXBlLl9nZXRGYXllQ2xpZW50ID0gZnVuY3Rpb24oY2hhbm5lbE5hbWUpIHtcclxuICB2YXIgaXNHZW5lcmljID0gY2hhbm5lbE5hbWUuaW5kZXhPZignL3UvJykgPT09IDA7XHJcbiAgdmFyIGNsaWVudFR5cGUgPSBpc0dlbmVyaWMgPyAnZ2VuZXJpYycgOiAncHVzaFRvcGljJztcclxuICBpZiAoIXRoaXMuX2ZheWVDbGllbnRzIHx8ICF0aGlzLl9mYXllQ2xpZW50c1tjbGllbnRUeXBlXSkge1xyXG4gICAgdGhpcy5fZmF5ZUNsaWVudHMgPSB0aGlzLl9mYXllQ2xpZW50cyB8fCB7fTtcclxuICAgIHRoaXMuX2ZheWVDbGllbnRzW2NsaWVudFR5cGVdID0gdGhpcy5fY3JlYXRlQ2xpZW50KGlzR2VuZXJpYyk7XHJcbiAgICBpZiAoRmF5ZS5UcmFuc3BvcnQuTm9kZUh0dHApIHtcclxuICAgICAgRmF5ZS5UcmFuc3BvcnQuTm9kZUh0dHAucHJvdG90eXBlLmJhdGNoaW5nID0gZmFsc2U7IC8vIHByZXZlbnQgc3RyZWFtaW5nIEFQSSBzZXJ2ZXIgZXJyb3JcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIHRoaXMuX2ZheWVDbGllbnRzW2NsaWVudFR5cGVdO1xyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBHZXQgbmFtZWQgdG9waWNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBUb3BpYyBuYW1lXHJcbiAqIEByZXR1cm5zIHtTdHJlYW1pbmd+VG9waWN9XHJcbiAqL1xyXG5TdHJlYW1pbmcucHJvdG90eXBlLnRvcGljID0gZnVuY3Rpb24obmFtZSkge1xyXG4gIHRoaXMuX3RvcGljcyA9IHRoaXMuX3RvcGljcyB8fCB7fTtcclxuICB2YXIgdG9waWMgPSB0aGlzLl90b3BpY3NbbmFtZV0gPVxyXG4gICAgdGhpcy5fdG9waWNzW25hbWVdIHx8IG5ldyBUb3BpYyh0aGlzLCBuYW1lKTtcclxuICByZXR1cm4gdG9waWM7XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0IENoYW5uZWwgZm9yIElkXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBjaGFubmVsSWQgLSBJZCBvZiBTdHJlYW1pbmdDaGFubmVsIG9iamVjdFxyXG4gKiBAcmV0dXJucyB7U3RyZWFtaW5nfkNoYW5uZWx9XHJcbiAqL1xyXG5TdHJlYW1pbmcucHJvdG90eXBlLmNoYW5uZWwgPSBmdW5jdGlvbihjaGFubmVsSWQpIHtcclxuICByZXR1cm4gbmV3IENoYW5uZWwodGhpcywgY2hhbm5lbElkKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTdWJzY3JpYmUgdG9waWMvY2hhbm5lbFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAtIFRvcGljIG5hbWVcclxuICogQHBhcmFtIHtDYWxsYmFjay48U3RyZWFtaW5nflN0cmVhbWluZ01lc3NhZ2U+fSBsaXN0ZW5lciAtIFN0cmVhbWluZyBtZXNzYWdlIGxpc3RlbmVyXHJcbiAqIEByZXR1cm5zIHtTdWJzY3JpcHRpb259IC0gRmF5ZSBzdWJzY3JpcHRpb24gb2JqZWN0XHJcbiAqL1xyXG5TdHJlYW1pbmcucHJvdG90eXBlLnN1YnNjcmliZSA9IGZ1bmN0aW9uKG5hbWUsIGxpc3RlbmVyKSB7XHJcbiAgdmFyIGNoYW5uZWxOYW1lID0gbmFtZS5pbmRleE9mKCcvJykgPT09IDAgPyBuYW1lIDogJy90b3BpYy8nICsgbmFtZTtcclxuICB2YXIgZmF5ZUNsaWVudCA9IHRoaXMuX2dldEZheWVDbGllbnQoY2hhbm5lbE5hbWUpO1xyXG4gIHJldHVybiBmYXllQ2xpZW50LnN1YnNjcmliZShjaGFubmVsTmFtZSwgbGlzdGVuZXIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFVuc3Vic2NyaWJlIHRvcGljXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gVG9waWMgbmFtZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxTdHJlYW1pbmd+U3RyZWFtaW5nTWVzc2FnZT59IGxpc3RlbmVyIC0gU3RyZWFtaW5nIG1lc3NhZ2UgbGlzdGVuZXJcclxuICogQHJldHVybnMge1N0cmVhbWluZ31cclxuICovXHJcblN0cmVhbWluZy5wcm90b3R5cGUudW5zdWJzY3JpYmUgPSBmdW5jdGlvbihuYW1lLCBsaXN0ZW5lcikge1xyXG4gIHZhciBjaGFubmVsTmFtZSA9IG5hbWUuaW5kZXhPZignLycpID09PSAwID8gbmFtZSA6ICcvdG9waWMvJyArIG5hbWU7XHJcbiAgdmFyIGZheWVDbGllbnQgPSB0aGlzLl9nZXRGYXllQ2xpZW50KGNoYW5uZWxOYW1lKTtcclxuICBmYXllQ2xpZW50LnVuc3Vic2NyaWJlKGNoYW5uZWxOYW1lLCBsaXN0ZW5lcik7XHJcbiAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5cclxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbi8qXHJcbiAqIFJlZ2lzdGVyIGhvb2sgaW4gY29ubmVjdGlvbiBpbnN0YW50aWF0aW9uIGZvciBkeW5hbWljYWxseSBhZGRpbmcgdGhpcyBBUEkgbW9kdWxlIGZlYXR1cmVzXHJcbiAqL1xyXG5qc2ZvcmNlLm9uKCdjb25uZWN0aW9uOm5ldycsIGZ1bmN0aW9uKGNvbm4pIHtcclxuICBjb25uLnN0cmVhbWluZyA9IG5ldyBTdHJlYW1pbmcoY29ubik7XHJcbn0pO1xyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU3RyZWFtaW5nO1xyXG4iLCIoZnVuY3Rpb24oKSB7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBGYXllID0ge1xuICBWRVJTSU9OOiAgICAgICAgICAnMS4xLjInLFxuXG4gIEJBWUVVWF9WRVJTSU9OOiAgICcxLjAnLFxuICBJRF9MRU5HVEg6ICAgICAgICAxNjAsXG4gIEpTT05QX0NBTExCQUNLOiAgICdqc29ucGNhbGxiYWNrJyxcbiAgQ09OTkVDVElPTl9UWVBFUzogWydsb25nLXBvbGxpbmcnLCAnY3Jvc3Mtb3JpZ2luLWxvbmctcG9sbGluZycsICdjYWxsYmFjay1wb2xsaW5nJywgJ3dlYnNvY2tldCcsICdldmVudHNvdXJjZScsICdpbi1wcm9jZXNzJ10sXG5cbiAgTUFOREFUT1JZX0NPTk5FQ1RJT05fVFlQRVM6IFsnbG9uZy1wb2xsaW5nJywgJ2NhbGxiYWNrLXBvbGxpbmcnLCAnaW4tcHJvY2VzcyddLFxuXG4gIEVOVjogKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHdpbmRvdyA6IGdsb2JhbCxcblxuICBleHRlbmQ6IGZ1bmN0aW9uKGRlc3QsIHNvdXJjZSwgb3ZlcndyaXRlKSB7XG4gICAgaWYgKCFzb3VyY2UpIHJldHVybiBkZXN0O1xuICAgIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICAgIGlmICghc291cmNlLmhhc093blByb3BlcnR5KGtleSkpIGNvbnRpbnVlO1xuICAgICAgaWYgKGRlc3QuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBvdmVyd3JpdGUgPT09IGZhbHNlKSBjb250aW51ZTtcbiAgICAgIGlmIChkZXN0W2tleV0gIT09IHNvdXJjZVtrZXldKVxuICAgICAgICBkZXN0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRlc3Q7XG4gIH0sXG5cbiAgcmFuZG9tOiBmdW5jdGlvbihiaXRsZW5ndGgpIHtcbiAgICBiaXRsZW5ndGggPSBiaXRsZW5ndGggfHwgdGhpcy5JRF9MRU5HVEg7XG4gICAgdmFyIG1heExlbmd0aCA9IE1hdGguY2VpbChiaXRsZW5ndGggKiBNYXRoLmxvZygyKSAvIE1hdGgubG9nKDM2KSk7XG4gICAgdmFyIHN0cmluZyA9IGNzcHJuZyhiaXRsZW5ndGgsIDM2KTtcbiAgICB3aGlsZSAoc3RyaW5nLmxlbmd0aCA8IG1heExlbmd0aCkgc3RyaW5nID0gJzAnICsgc3RyaW5nO1xuICAgIHJldHVybiBzdHJpbmc7XG4gIH0sXG5cbiAgdmFsaWRhdGVPcHRpb25zOiBmdW5jdGlvbihvcHRpb25zLCB2YWxpZEtleXMpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKHRoaXMuaW5kZXhPZih2YWxpZEtleXMsIGtleSkgPCAwKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VucmVjb2duaXplZCBvcHRpb246ICcgKyBrZXkpO1xuICAgIH1cbiAgfSxcblxuICBjbGllbnRJZEZyb21NZXNzYWdlczogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICB2YXIgY29ubmVjdCA9IHRoaXMuZmlsdGVyKFtdLmNvbmNhdChtZXNzYWdlcyksIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgIHJldHVybiBtZXNzYWdlLmNoYW5uZWwgPT09ICcvbWV0YS9jb25uZWN0JztcbiAgICB9KTtcbiAgICByZXR1cm4gY29ubmVjdFswXSAmJiBjb25uZWN0WzBdLmNsaWVudElkO1xuICB9LFxuXG4gIGNvcHlPYmplY3Q6IGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIHZhciBjbG9uZSwgaSwga2V5O1xuICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgY2xvbmUgPSBbXTtcbiAgICAgIGkgPSBvYmplY3QubGVuZ3RoO1xuICAgICAgd2hpbGUgKGktLSkgY2xvbmVbaV0gPSBGYXllLmNvcHlPYmplY3Qob2JqZWN0W2ldKTtcbiAgICAgIHJldHVybiBjbG9uZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnKSB7XG4gICAgICBjbG9uZSA9IChvYmplY3QgPT09IG51bGwpID8gbnVsbCA6IHt9O1xuICAgICAgZm9yIChrZXkgaW4gb2JqZWN0KSBjbG9uZVtrZXldID0gRmF5ZS5jb3B5T2JqZWN0KG9iamVjdFtrZXldKTtcbiAgICAgIHJldHVybiBjbG9uZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gIH0sXG5cbiAgY29tbW9uRWxlbWVudDogZnVuY3Rpb24obGlzdGEsIGxpc3RiKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIG4gPSBsaXN0YS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgIGlmICh0aGlzLmluZGV4T2YobGlzdGIsIGxpc3RhW2ldKSAhPT0gLTEpXG4gICAgICAgIHJldHVybiBsaXN0YVtpXTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH0sXG5cbiAgaW5kZXhPZjogZnVuY3Rpb24obGlzdCwgbmVlZGxlKSB7XG4gICAgaWYgKGxpc3QuaW5kZXhPZikgcmV0dXJuIGxpc3QuaW5kZXhPZihuZWVkbGUpO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIG4gPSBsaXN0Lmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgaWYgKGxpc3RbaV0gPT09IG5lZWRsZSkgcmV0dXJuIGk7XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfSxcblxuICBtYXA6IGZ1bmN0aW9uKG9iamVjdCwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICBpZiAob2JqZWN0Lm1hcCkgcmV0dXJuIG9iamVjdC5tYXAoY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcblxuICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBvYmplY3QubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKGNhbGxiYWNrLmNhbGwoY29udGV4dCB8fCBudWxsLCBvYmplY3RbaV0sIGkpKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgICAgICBpZiAoIW9iamVjdC5oYXNPd25Qcm9wZXJ0eShrZXkpKSBjb250aW51ZTtcbiAgICAgICAgcmVzdWx0LnB1c2goY2FsbGJhY2suY2FsbChjb250ZXh0IHx8IG51bGwsIGtleSwgb2JqZWN0W2tleV0pKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcblxuICBmaWx0ZXI6IGZ1bmN0aW9uKGFycmF5LCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGlmIChhcnJheS5maWx0ZXIpIHJldHVybiBhcnJheS5maWx0ZXIoY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IGFycmF5Lmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgaWYgKGNhbGxiYWNrLmNhbGwoY29udGV4dCB8fCBudWxsLCBhcnJheVtpXSwgaSkpXG4gICAgICAgIHJlc3VsdC5wdXNoKGFycmF5W2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcblxuICBhc3luY0VhY2g6IGZ1bmN0aW9uKGxpc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIHZhciBuICAgICAgID0gbGlzdC5sZW5ndGgsXG4gICAgICAgIGkgICAgICAgPSAtMSxcbiAgICAgICAgY2FsbHMgICA9IDAsXG4gICAgICAgIGxvb3BpbmcgPSBmYWxzZTtcblxuICAgIHZhciBpdGVyYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICBjYWxscyAtPSAxO1xuICAgICAgaSArPSAxO1xuICAgICAgaWYgKGkgPT09IG4pIHJldHVybiBjYWxsYmFjayAmJiBjYWxsYmFjay5jYWxsKGNvbnRleHQpO1xuICAgICAgaXRlcmF0b3IobGlzdFtpXSwgcmVzdW1lKTtcbiAgICB9O1xuXG4gICAgdmFyIGxvb3AgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChsb29waW5nKSByZXR1cm47XG4gICAgICBsb29waW5nID0gdHJ1ZTtcbiAgICAgIHdoaWxlIChjYWxscyA+IDApIGl0ZXJhdGUoKTtcbiAgICAgIGxvb3BpbmcgPSBmYWxzZTtcbiAgICB9O1xuXG4gICAgdmFyIHJlc3VtZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgY2FsbHMgKz0gMTtcbiAgICAgIGxvb3AoKTtcbiAgICB9O1xuICAgIHJlc3VtZSgpO1xuICB9LFxuXG4gIC8vIGh0dHA6Ly9hc3NhbmthLm5ldC9jb250ZW50L3RlY2gvMjAwOS8wOS8wMi9qc29uMi1qcy12cy1wcm90b3R5cGUvXG4gIHRvSlNPTjogZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgaWYgKCF0aGlzLnN0cmluZ2lmeSkgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iamVjdCk7XG5cbiAgICByZXR1cm4gdGhpcy5zdHJpbmdpZnkob2JqZWN0LCBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICByZXR1cm4gKHRoaXNba2V5XSBpbnN0YW5jZW9mIEFycmF5KSA/IHRoaXNba2V5XSA6IHZhbHVlO1xuICAgIH0pO1xuICB9XG59O1xuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpXG4gIG1vZHVsZS5leHBvcnRzID0gRmF5ZTtcbmVsc2UgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKVxuICB3aW5kb3cuRmF5ZSA9IEZheWU7XG5cbkZheWUuQ2xhc3MgPSBmdW5jdGlvbihwYXJlbnQsIG1ldGhvZHMpIHtcbiAgaWYgKHR5cGVvZiBwYXJlbnQgIT09ICdmdW5jdGlvbicpIHtcbiAgICBtZXRob2RzID0gcGFyZW50O1xuICAgIHBhcmVudCAgPSBPYmplY3Q7XG4gIH1cblxuICB2YXIga2xhc3MgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuaW5pdGlhbGl6ZSkgcmV0dXJuIHRoaXM7XG4gICAgcmV0dXJuIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpIHx8IHRoaXM7XG4gIH07XG5cbiAgdmFyIGJyaWRnZSA9IGZ1bmN0aW9uKCkge307XG4gIGJyaWRnZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXG4gIGtsYXNzLnByb3RvdHlwZSA9IG5ldyBicmlkZ2UoKTtcbiAgRmF5ZS5leHRlbmQoa2xhc3MucHJvdG90eXBlLCBtZXRob2RzKTtcblxuICByZXR1cm4ga2xhc3M7XG59O1xuXG4oZnVuY3Rpb24oKSB7XG52YXIgRXZlbnRFbWl0dGVyID0gRmF5ZS5FdmVudEVtaXR0ZXIgPSBmdW5jdGlvbigpIHt9O1xuXG4vKlxuQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5IG9mXG50aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluXG50aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvXG51c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllc1xub2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvXG5zbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuU09GVFdBUkUuXG4qL1xuXG52YXIgaXNBcnJheSA9IHR5cGVvZiBBcnJheS5pc0FycmF5ID09PSAnZnVuY3Rpb24nXG4gICAgPyBBcnJheS5pc0FycmF5XG4gICAgOiBmdW5jdGlvbiAoeHMpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgICB9XG47XG5mdW5jdGlvbiBpbmRleE9mICh4cywgeCkge1xuICAgIGlmICh4cy5pbmRleE9mKSByZXR1cm4geHMuaW5kZXhPZih4KTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh4ID09PSB4c1tpXSkgcmV0dXJuIGk7XG4gICAgfVxuICAgIHJldHVybiAtMTtcbn1cblxuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc0FycmF5KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKVxuICAgIHtcbiAgICAgIGlmIChhcmd1bWVudHNbMV0gaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBhcmd1bWVudHNbMV07IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmNhdWdodCwgdW5zcGVjaWZpZWQgJ2Vycm9yJyBldmVudC5cIik7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiBmYWxzZTtcbiAgdmFyIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG4gIGlmICghaGFuZGxlcikgcmV0dXJuIGZhbHNlO1xuXG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG5cbiAgfSBlbHNlIGlmIChpc0FycmF5KGhhbmRsZXIpKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXG4gICAgdmFyIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG5cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn07XG5cbi8vIEV2ZW50RW1pdHRlciBpcyBkZWZpbmVkIGluIHNyYy9ub2RlX2V2ZW50cy5jY1xuLy8gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0KCkgaXMgYWxzbyBkZWZpbmVkIHRoZXJlLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICgnZnVuY3Rpb24nICE9PSB0eXBlb2YgbGlzdGVuZXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2FkZExpc3RlbmVyIG9ubHkgdGFrZXMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XG4gIH1cblxuICBpZiAoIXRoaXMuX2V2ZW50cykgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PSBcIm5ld0xpc3RlbmVyc1wiISBCZWZvcmVcbiAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lcnNcIi5cbiAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkge1xuICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkodGhpcy5fZXZlbnRzW3R5cGVdKSkge1xuICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFwcGVuZC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIH0gZWxzZSB7XG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzZWxmLm9uKHR5cGUsIGZ1bmN0aW9uIGcoKSB7XG4gICAgc2VsZi5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcbiAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9KTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAoJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGxpc3RlbmVyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmVMaXN0ZW5lciBvbmx5IHRha2VzIGluc3RhbmNlcyBvZiBGdW5jdGlvbicpO1xuICB9XG5cbiAgLy8gZG9lcyBub3QgdXNlIGxpc3RlbmVycygpLCBzbyBubyBzaWRlIGVmZmVjdCBvZiBjcmVhdGluZyBfZXZlbnRzW3R5cGVdXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pIHJldHVybiB0aGlzO1xuXG4gIHZhciBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0FycmF5KGxpc3QpKSB7XG4gICAgdmFyIGkgPSBpbmRleE9mKGxpc3QsIGxpc3RlbmVyKTtcbiAgICBpZiAoaSA8IDApIHJldHVybiB0aGlzO1xuICAgIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PSAwKVxuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgfSBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0gPT09IGxpc3RlbmVyKSB7XG4gICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBkb2VzIG5vdCB1c2UgbGlzdGVuZXJzKCksIHNvIG5vIHNpZGUgZWZmZWN0IG9mIGNyZWF0aW5nIF9ldmVudHNbdHlwZV1cbiAgaWYgKHR5cGUgJiYgdGhpcy5fZXZlbnRzICYmIHRoaXMuX2V2ZW50c1t0eXBlXSkgdGhpcy5fZXZlbnRzW3R5cGVdID0gbnVsbDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgaWYgKCF0aGlzLl9ldmVudHMpIHRoaXMuX2V2ZW50cyA9IHt9O1xuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSkgdGhpcy5fZXZlbnRzW3R5cGVdID0gW107XG4gIGlmICghaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XG4gIH1cbiAgcmV0dXJuIHRoaXMuX2V2ZW50c1t0eXBlXTtcbn07XG5cbn0pKCk7XG5cbkZheWUuTmFtZXNwYWNlID0gRmF5ZS5DbGFzcyh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3VzZWQgPSB7fTtcbiAgfSxcblxuICBleGlzdHM6IGZ1bmN0aW9uKGlkKSB7XG4gICAgcmV0dXJuIHRoaXMuX3VzZWQuaGFzT3duUHJvcGVydHkoaWQpO1xuICB9LFxuXG4gIGdlbmVyYXRlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbmFtZSA9IEZheWUucmFuZG9tKCk7XG4gICAgd2hpbGUgKHRoaXMuX3VzZWQuaGFzT3duUHJvcGVydHkobmFtZSkpXG4gICAgICBuYW1lID0gRmF5ZS5yYW5kb20oKTtcbiAgICByZXR1cm4gdGhpcy5fdXNlZFtuYW1lXSA9IG5hbWU7XG4gIH0sXG5cbiAgcmVsZWFzZTogZnVuY3Rpb24oaWQpIHtcbiAgICBkZWxldGUgdGhpcy5fdXNlZFtpZF07XG4gIH1cbn0pO1xuXG4oZnVuY3Rpb24oKSB7XG4ndXNlIHN0cmljdCc7XG5cbnZhciB0aW1lb3V0ID0gc2V0VGltZW91dCwgZGVmZXI7XG5cbmlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nKVxuICBkZWZlciA9IGZ1bmN0aW9uKGZuKSB7IHNldEltbWVkaWF0ZShmbikgfTtcbmVsc2UgaWYgKHR5cGVvZiBwcm9jZXNzID09PSAnb2JqZWN0JyAmJiBwcm9jZXNzLm5leHRUaWNrKVxuICBkZWZlciA9IGZ1bmN0aW9uKGZuKSB7IHByb2Nlc3MubmV4dFRpY2soZm4pIH07XG5lbHNlXG4gIGRlZmVyID0gZnVuY3Rpb24oZm4pIHsgdGltZW91dChmbiwgMCkgfTtcblxudmFyIFBFTkRJTkcgICA9IDAsXG4gICAgRlVMRklMTEVEID0gMSxcbiAgICBSRUpFQ1RFRCAgPSAyO1xuXG52YXIgUkVUVVJOID0gZnVuY3Rpb24oeCkgeyByZXR1cm4geCB9LFxuICAgIFRIUk9XICA9IGZ1bmN0aW9uKHgpIHsgdGhyb3cgIHggfTtcblxudmFyIFByb21pc2UgPSBmdW5jdGlvbih0YXNrKSB7XG4gIHRoaXMuX3N0YXRlICAgICAgID0gUEVORElORztcbiAgdGhpcy5fb25GdWxmaWxsZWQgPSBbXTtcbiAgdGhpcy5fb25SZWplY3RlZCAgPSBbXTtcblxuICBpZiAodHlwZW9mIHRhc2sgIT09ICdmdW5jdGlvbicpIHJldHVybjtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHRhc2soZnVuY3Rpb24odmFsdWUpICB7IGZ1bGZpbGwoc2VsZiwgdmFsdWUpIH0sXG4gICAgICAgZnVuY3Rpb24ocmVhc29uKSB7IHJlamVjdChzZWxmLCByZWFzb24pIH0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uKG9uRnVsZmlsbGVkLCBvblJlamVjdGVkKSB7XG4gIHZhciBuZXh0ID0gbmV3IFByb21pc2UoKTtcbiAgcmVnaXN0ZXJPbkZ1bGZpbGxlZCh0aGlzLCBvbkZ1bGZpbGxlZCwgbmV4dCk7XG4gIHJlZ2lzdGVyT25SZWplY3RlZCh0aGlzLCBvblJlamVjdGVkLCBuZXh0KTtcbiAgcmV0dXJuIG5leHQ7XG59O1xuXG52YXIgcmVnaXN0ZXJPbkZ1bGZpbGxlZCA9IGZ1bmN0aW9uKHByb21pc2UsIG9uRnVsZmlsbGVkLCBuZXh0KSB7XG4gIGlmICh0eXBlb2Ygb25GdWxmaWxsZWQgIT09ICdmdW5jdGlvbicpIG9uRnVsZmlsbGVkID0gUkVUVVJOO1xuICB2YXIgaGFuZGxlciA9IGZ1bmN0aW9uKHZhbHVlKSB7IGludm9rZShvbkZ1bGZpbGxlZCwgdmFsdWUsIG5leHQpIH07XG5cbiAgaWYgKHByb21pc2UuX3N0YXRlID09PSBQRU5ESU5HKSB7XG4gICAgcHJvbWlzZS5fb25GdWxmaWxsZWQucHVzaChoYW5kbGVyKTtcbiAgfSBlbHNlIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gRlVMRklMTEVEKSB7XG4gICAgaGFuZGxlcihwcm9taXNlLl92YWx1ZSk7XG4gIH1cbn07XG5cbnZhciByZWdpc3Rlck9uUmVqZWN0ZWQgPSBmdW5jdGlvbihwcm9taXNlLCBvblJlamVjdGVkLCBuZXh0KSB7XG4gIGlmICh0eXBlb2Ygb25SZWplY3RlZCAhPT0gJ2Z1bmN0aW9uJykgb25SZWplY3RlZCA9IFRIUk9XO1xuICB2YXIgaGFuZGxlciA9IGZ1bmN0aW9uKHJlYXNvbikgeyBpbnZva2Uob25SZWplY3RlZCwgcmVhc29uLCBuZXh0KSB9O1xuXG4gIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gUEVORElORykge1xuICAgIHByb21pc2UuX29uUmVqZWN0ZWQucHVzaChoYW5kbGVyKTtcbiAgfSBlbHNlIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gUkVKRUNURUQpIHtcbiAgICBoYW5kbGVyKHByb21pc2UuX3JlYXNvbik7XG4gIH1cbn07XG5cbnZhciBpbnZva2UgPSBmdW5jdGlvbihmbiwgdmFsdWUsIG5leHQpIHtcbiAgZGVmZXIoZnVuY3Rpb24oKSB7IF9pbnZva2UoZm4sIHZhbHVlLCBuZXh0KSB9KTtcbn07XG5cbnZhciBfaW52b2tlID0gZnVuY3Rpb24oZm4sIHZhbHVlLCBuZXh0KSB7XG4gIHZhciBvdXRjb21lO1xuXG4gIHRyeSB7XG4gICAgb3V0Y29tZSA9IGZuKHZhbHVlKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4gcmVqZWN0KG5leHQsIGVycm9yKTtcbiAgfVxuXG4gIGlmIChvdXRjb21lID09PSBuZXh0KSB7XG4gICAgcmVqZWN0KG5leHQsIG5ldyBUeXBlRXJyb3IoJ1JlY3Vyc2l2ZSBwcm9taXNlIGNoYWluIGRldGVjdGVkJykpO1xuICB9IGVsc2Uge1xuICAgIGZ1bGZpbGwobmV4dCwgb3V0Y29tZSk7XG4gIH1cbn07XG5cbnZhciBmdWxmaWxsID0gUHJvbWlzZS5mdWxmaWxsID0gUHJvbWlzZS5yZXNvbHZlID0gZnVuY3Rpb24ocHJvbWlzZSwgdmFsdWUpIHtcbiAgdmFyIGNhbGxlZCA9IGZhbHNlLCB0eXBlLCB0aGVuO1xuXG4gIHRyeSB7XG4gICAgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgICB0aGVuID0gdmFsdWUgIT09IG51bGwgJiYgKHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcpICYmIHZhbHVlLnRoZW47XG5cbiAgICBpZiAodHlwZW9mIHRoZW4gIT09ICdmdW5jdGlvbicpIHJldHVybiBfZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG5cbiAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bmN0aW9uKHYpIHtcbiAgICAgIGlmICghKGNhbGxlZCBeIChjYWxsZWQgPSB0cnVlKSkpIHJldHVybjtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgdik7XG4gICAgfSwgZnVuY3Rpb24ocikge1xuICAgICAgaWYgKCEoY2FsbGVkIF4gKGNhbGxlZCA9IHRydWUpKSkgcmV0dXJuO1xuICAgICAgcmVqZWN0KHByb21pc2UsIHIpO1xuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmICghKGNhbGxlZCBeIChjYWxsZWQgPSB0cnVlKSkpIHJldHVybjtcbiAgICByZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICB9XG59O1xuXG52YXIgX2Z1bGZpbGwgPSBmdW5jdGlvbihwcm9taXNlLCB2YWx1ZSkge1xuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHJldHVybjtcblxuICBwcm9taXNlLl9zdGF0ZSAgICAgID0gRlVMRklMTEVEO1xuICBwcm9taXNlLl92YWx1ZSAgICAgID0gdmFsdWU7XG4gIHByb21pc2UuX29uUmVqZWN0ZWQgPSBbXTtcblxuICB2YXIgb25GdWxmaWxsZWQgPSBwcm9taXNlLl9vbkZ1bGZpbGxlZCwgZm47XG4gIHdoaWxlIChmbiA9IG9uRnVsZmlsbGVkLnNoaWZ0KCkpIGZuKHZhbHVlKTtcbn07XG5cbnZhciByZWplY3QgPSBQcm9taXNlLnJlamVjdCA9IGZ1bmN0aW9uKHByb21pc2UsIHJlYXNvbikge1xuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHJldHVybjtcblxuICBwcm9taXNlLl9zdGF0ZSAgICAgICA9IFJFSkVDVEVEO1xuICBwcm9taXNlLl9yZWFzb24gICAgICA9IHJlYXNvbjtcbiAgcHJvbWlzZS5fb25GdWxmaWxsZWQgPSBbXTtcblxuICB2YXIgb25SZWplY3RlZCA9IHByb21pc2UuX29uUmVqZWN0ZWQsIGZuO1xuICB3aGlsZSAoZm4gPSBvblJlamVjdGVkLnNoaWZ0KCkpIGZuKHJlYXNvbik7XG59O1xuXG5Qcm9taXNlLmFsbCA9IGZ1bmN0aW9uKHByb21pc2VzKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihmdWxmaWxsLCByZWplY3QpIHtcbiAgICB2YXIgbGlzdCA9IFtdLFxuICAgICAgICAgbiAgID0gcHJvbWlzZXMubGVuZ3RoLFxuICAgICAgICAgaTtcblxuICAgIGlmIChuID09PSAwKSByZXR1cm4gZnVsZmlsbChsaXN0KTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIChmdW5jdGlvbihwcm9taXNlLCBpKSB7XG4gICAgICBQcm9taXNlLmZ1bGZpbGxlZChwcm9taXNlKS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIGxpc3RbaV0gPSB2YWx1ZTtcbiAgICAgICAgaWYgKC0tbiA9PT0gMCkgZnVsZmlsbChsaXN0KTtcbiAgICAgIH0sIHJlamVjdCk7XG4gICAgfSkocHJvbWlzZXNbaV0sIGkpO1xuICB9KTtcbn07XG5cblByb21pc2UuZGVmZXIgPSBkZWZlcjtcblxuUHJvbWlzZS5kZWZlcnJlZCA9IFByb21pc2UucGVuZGluZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdHVwbGUgPSB7fTtcblxuICB0dXBsZS5wcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24oZnVsZmlsbCwgcmVqZWN0KSB7XG4gICAgdHVwbGUuZnVsZmlsbCA9IHR1cGxlLnJlc29sdmUgPSBmdWxmaWxsO1xuICAgIHR1cGxlLnJlamVjdCAgPSByZWplY3Q7XG4gIH0pO1xuICByZXR1cm4gdHVwbGU7XG59O1xuXG5Qcm9taXNlLmZ1bGZpbGxlZCA9IFByb21pc2UucmVzb2x2ZWQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZnVsZmlsbCwgcmVqZWN0KSB7IGZ1bGZpbGwodmFsdWUpIH0pO1xufTtcblxuUHJvbWlzZS5yZWplY3RlZCA9IGZ1bmN0aW9uKHJlYXNvbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24oZnVsZmlsbCwgcmVqZWN0KSB7IHJlamVjdChyZWFzb24pIH0pO1xufTtcblxuaWYgKHR5cGVvZiBGYXllID09PSAndW5kZWZpbmVkJylcbiAgbW9kdWxlLmV4cG9ydHMgPSBQcm9taXNlO1xuZWxzZVxuICBGYXllLlByb21pc2UgPSBQcm9taXNlO1xuXG59KSgpO1xuXG5GYXllLlNldCA9IEZheWUuQ2xhc3Moe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9pbmRleCA9IHt9O1xuICB9LFxuXG4gIGFkZDogZnVuY3Rpb24oaXRlbSkge1xuICAgIHZhciBrZXkgPSAoaXRlbS5pZCAhPT0gdW5kZWZpbmVkKSA/IGl0ZW0uaWQgOiBpdGVtO1xuICAgIGlmICh0aGlzLl9pbmRleC5oYXNPd25Qcm9wZXJ0eShrZXkpKSByZXR1cm4gZmFsc2U7XG4gICAgdGhpcy5faW5kZXhba2V5XSA9IGl0ZW07XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgZm9yRWFjaDogZnVuY3Rpb24oYmxvY2ssIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5faW5kZXgpIHtcbiAgICAgIGlmICh0aGlzLl9pbmRleC5oYXNPd25Qcm9wZXJ0eShrZXkpKVxuICAgICAgICBibG9jay5jYWxsKGNvbnRleHQsIHRoaXMuX2luZGV4W2tleV0pO1xuICAgIH1cbiAgfSxcblxuICBpc0VtcHR5OiBmdW5jdGlvbigpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5faW5kZXgpIHtcbiAgICAgIGlmICh0aGlzLl9pbmRleC5oYXNPd25Qcm9wZXJ0eShrZXkpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9LFxuXG4gIG1lbWJlcjogZnVuY3Rpb24oaXRlbSkge1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLl9pbmRleCkge1xuICAgICAgaWYgKHRoaXMuX2luZGV4W2tleV0gPT09IGl0ZW0pIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG5cbiAgcmVtb3ZlOiBmdW5jdGlvbihpdGVtKSB7XG4gICAgdmFyIGtleSA9IChpdGVtLmlkICE9PSB1bmRlZmluZWQpID8gaXRlbS5pZCA6IGl0ZW07XG4gICAgdmFyIHJlbW92ZWQgPSB0aGlzLl9pbmRleFtrZXldO1xuICAgIGRlbGV0ZSB0aGlzLl9pbmRleFtrZXldO1xuICAgIHJldHVybiByZW1vdmVkO1xuICB9LFxuXG4gIHRvQXJyYXk6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcnJheSA9IFtdO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7IGFycmF5LnB1c2goaXRlbSkgfSk7XG4gICAgcmV0dXJuIGFycmF5O1xuICB9XG59KTtcblxuRmF5ZS5VUkkgPSB7XG4gIGlzVVJJOiBmdW5jdGlvbih1cmkpIHtcbiAgICByZXR1cm4gdXJpICYmIHVyaS5wcm90b2NvbCAmJiB1cmkuaG9zdCAmJiB1cmkucGF0aDtcbiAgfSxcblxuICBpc1NhbWVPcmlnaW46IGZ1bmN0aW9uKHVyaSkge1xuICAgIHZhciBsb2NhdGlvbiA9IEZheWUuRU5WLmxvY2F0aW9uO1xuICAgIHJldHVybiB1cmkucHJvdG9jb2wgPT09IGxvY2F0aW9uLnByb3RvY29sICYmXG4gICAgICAgICAgIHVyaS5ob3N0bmFtZSA9PT0gbG9jYXRpb24uaG9zdG5hbWUgJiZcbiAgICAgICAgICAgdXJpLnBvcnQgICAgID09PSBsb2NhdGlvbi5wb3J0O1xuICB9LFxuXG4gIHBhcnNlOiBmdW5jdGlvbih1cmwpIHtcbiAgICBpZiAodHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHJldHVybiB1cmw7XG4gICAgdmFyIHVyaSA9IHt9LCBwYXJ0cywgcXVlcnksIHBhaXJzLCBpLCBuLCBkYXRhO1xuXG4gICAgdmFyIGNvbnN1bWUgPSBmdW5jdGlvbihuYW1lLCBwYXR0ZXJuKSB7XG4gICAgICB1cmwgPSB1cmwucmVwbGFjZShwYXR0ZXJuLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICB1cmlbbmFtZV0gPSBtYXRjaDtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfSk7XG4gICAgICB1cmlbbmFtZV0gPSB1cmlbbmFtZV0gfHwgJyc7XG4gICAgfTtcblxuICAgIGNvbnN1bWUoJ3Byb3RvY29sJywgL15bYS16XStcXDovaSk7XG4gICAgY29uc3VtZSgnaG9zdCcsICAgICAvXlxcL1xcL1teXFwvXFw/I10rLyk7XG5cbiAgICBpZiAoIS9eXFwvLy50ZXN0KHVybCkgJiYgIXVyaS5ob3N0KVxuICAgICAgdXJsID0gRmF5ZS5FTlYubG9jYXRpb24ucGF0aG5hbWUucmVwbGFjZSgvW15cXC9dKiQvLCAnJykgKyB1cmw7XG5cbiAgICBjb25zdW1lKCdwYXRobmFtZScsIC9eW15cXD8jXSovKTtcbiAgICBjb25zdW1lKCdzZWFyY2gnLCAgIC9eXFw/W14jXSovKTtcbiAgICBjb25zdW1lKCdoYXNoJywgICAgIC9eIy4qLyk7XG5cbiAgICB1cmkucHJvdG9jb2wgPSB1cmkucHJvdG9jb2wgfHwgRmF5ZS5FTlYubG9jYXRpb24ucHJvdG9jb2w7XG5cbiAgICBpZiAodXJpLmhvc3QpIHtcbiAgICAgIHVyaS5ob3N0ICAgICA9IHVyaS5ob3N0LnN1YnN0cigyKTtcbiAgICAgIHBhcnRzICAgICAgICA9IHVyaS5ob3N0LnNwbGl0KCc6Jyk7XG4gICAgICB1cmkuaG9zdG5hbWUgPSBwYXJ0c1swXTtcbiAgICAgIHVyaS5wb3J0ICAgICA9IHBhcnRzWzFdIHx8ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICB1cmkuaG9zdCAgICAgPSBGYXllLkVOVi5sb2NhdGlvbi5ob3N0O1xuICAgICAgdXJpLmhvc3RuYW1lID0gRmF5ZS5FTlYubG9jYXRpb24uaG9zdG5hbWU7XG4gICAgICB1cmkucG9ydCAgICAgPSBGYXllLkVOVi5sb2NhdGlvbi5wb3J0O1xuICAgIH1cblxuICAgIHVyaS5wYXRobmFtZSA9IHVyaS5wYXRobmFtZSB8fCAnLyc7XG4gICAgdXJpLnBhdGggPSB1cmkucGF0aG5hbWUgKyB1cmkuc2VhcmNoO1xuXG4gICAgcXVlcnkgPSB1cmkuc2VhcmNoLnJlcGxhY2UoL15cXD8vLCAnJyk7XG4gICAgcGFpcnMgPSBxdWVyeSA/IHF1ZXJ5LnNwbGl0KCcmJykgOiBbXTtcbiAgICBkYXRhICA9IHt9O1xuXG4gICAgZm9yIChpID0gMCwgbiA9IHBhaXJzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgcGFydHMgPSBwYWlyc1tpXS5zcGxpdCgnPScpO1xuICAgICAgZGF0YVtkZWNvZGVVUklDb21wb25lbnQocGFydHNbMF0gfHwgJycpXSA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXSB8fCAnJyk7XG4gICAgfVxuXG4gICAgdXJpLnF1ZXJ5ID0gZGF0YTtcblxuICAgIHVyaS5ocmVmID0gdGhpcy5zdHJpbmdpZnkodXJpKTtcbiAgICByZXR1cm4gdXJpO1xuICB9LFxuXG4gIHN0cmluZ2lmeTogZnVuY3Rpb24odXJpKSB7XG4gICAgdmFyIHN0cmluZyA9IHVyaS5wcm90b2NvbCArICcvLycgKyB1cmkuaG9zdG5hbWU7XG4gICAgaWYgKHVyaS5wb3J0KSBzdHJpbmcgKz0gJzonICsgdXJpLnBvcnQ7XG4gICAgc3RyaW5nICs9IHVyaS5wYXRobmFtZSArIHRoaXMucXVlcnlTdHJpbmcodXJpLnF1ZXJ5KSArICh1cmkuaGFzaCB8fCAnJyk7XG4gICAgcmV0dXJuIHN0cmluZztcbiAgfSxcblxuICBxdWVyeVN0cmluZzogZnVuY3Rpb24ocXVlcnkpIHtcbiAgICB2YXIgcGFpcnMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnkuaGFzT3duUHJvcGVydHkoa2V5KSkgY29udGludWU7XG4gICAgICBwYWlycy5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChrZXkpICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHF1ZXJ5W2tleV0pKTtcbiAgICB9XG4gICAgaWYgKHBhaXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuICAgIHJldHVybiAnPycgKyBwYWlycy5qb2luKCcmJyk7XG4gIH1cbn07XG5cbkZheWUuRXJyb3IgPSBGYXllLkNsYXNzKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oY29kZSwgcGFyYW1zLCBtZXNzYWdlKSB7XG4gICAgdGhpcy5jb2RlICAgID0gY29kZTtcbiAgICB0aGlzLnBhcmFtcyAgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChwYXJhbXMpO1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIH0sXG5cbiAgdG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmNvZGUgKyAnOicgK1xuICAgICAgICAgICB0aGlzLnBhcmFtcy5qb2luKCcsJykgKyAnOicgK1xuICAgICAgICAgICB0aGlzLm1lc3NhZ2U7XG4gIH1cbn0pO1xuXG5GYXllLkVycm9yLnBhcnNlID0gZnVuY3Rpb24obWVzc2FnZSkge1xuICBtZXNzYWdlID0gbWVzc2FnZSB8fCAnJztcbiAgaWYgKCFGYXllLkdyYW1tYXIuRVJST1IudGVzdChtZXNzYWdlKSkgcmV0dXJuIG5ldyB0aGlzKG51bGwsIFtdLCBtZXNzYWdlKTtcblxuICB2YXIgcGFydHMgICA9IG1lc3NhZ2Uuc3BsaXQoJzonKSxcbiAgICAgIGNvZGUgICAgPSBwYXJzZUludChwYXJ0c1swXSksXG4gICAgICBwYXJhbXMgID0gcGFydHNbMV0uc3BsaXQoJywnKSxcbiAgICAgIG1lc3NhZ2UgPSBwYXJ0c1syXTtcblxuICByZXR1cm4gbmV3IHRoaXMoY29kZSwgcGFyYW1zLCBtZXNzYWdlKTtcbn07XG5cblxuXG5cbkZheWUuRXJyb3IudmVyc2lvbk1pc21hdGNoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcygzMDAsIGFyZ3VtZW50cywgJ1ZlcnNpb24gbWlzbWF0Y2gnKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5jb25udHlwZU1pc21hdGNoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcygzMDEsIGFyZ3VtZW50cywgJ0Nvbm5lY3Rpb24gdHlwZXMgbm90IHN1cHBvcnRlZCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmV4dE1pc21hdGNoID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcygzMDIsIGFyZ3VtZW50cywgJ0V4dGVuc2lvbiBtaXNtYXRjaCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmJhZFJlcXVlc3QgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDQwMCwgYXJndW1lbnRzLCAnQmFkIHJlcXVlc3QnKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5jbGllbnRVbmtub3duID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg0MDEsIGFyZ3VtZW50cywgJ1Vua25vd24gY2xpZW50JykudG9TdHJpbmcoKTtcbn07XG5cbkZheWUuRXJyb3IucGFyYW1ldGVyTWlzc2luZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IHRoaXMoNDAyLCBhcmd1bWVudHMsICdNaXNzaW5nIHJlcXVpcmVkIHBhcmFtZXRlcicpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmNoYW5uZWxGb3JiaWRkZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDQwMywgYXJndW1lbnRzLCAnRm9yYmlkZGVuIGNoYW5uZWwnKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5jaGFubmVsVW5rbm93biA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IHRoaXMoNDA0LCBhcmd1bWVudHMsICdVbmtub3duIGNoYW5uZWwnKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5jaGFubmVsSW52YWxpZCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IHRoaXMoNDA1LCBhcmd1bWVudHMsICdJbnZhbGlkIGNoYW5uZWwnKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5leHRVbmtub3duID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg0MDYsIGFyZ3VtZW50cywgJ1Vua25vd24gZXh0ZW5zaW9uJykudG9TdHJpbmcoKTtcbn07XG5cbkZheWUuRXJyb3IucHVibGlzaEZhaWxlZCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IHRoaXMoNDA3LCBhcmd1bWVudHMsICdGYWlsZWQgdG8gcHVibGlzaCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLnNlcnZlckVycm9yID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg1MDAsIGFyZ3VtZW50cywgJ0ludGVybmFsIHNlcnZlciBlcnJvcicpLnRvU3RyaW5nKCk7XG59O1xuXG5cbkZheWUuRGVmZXJyYWJsZSA9IHtcbiAgdGhlbjogZnVuY3Rpb24oY2FsbGJhY2ssIGVycmJhY2spIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCF0aGlzLl9wcm9taXNlKVxuICAgICAgdGhpcy5fcHJvbWlzZSA9IG5ldyBGYXllLlByb21pc2UoZnVuY3Rpb24oZnVsZmlsbCwgcmVqZWN0KSB7XG4gICAgICAgIHNlbGYuX2Z1bGZpbGwgPSBmdWxmaWxsO1xuICAgICAgICBzZWxmLl9yZWplY3QgID0gcmVqZWN0O1xuICAgICAgfSk7XG5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHJldHVybiB0aGlzLl9wcm9taXNlO1xuICAgIGVsc2VcbiAgICAgIHJldHVybiB0aGlzLl9wcm9taXNlLnRoZW4oY2FsbGJhY2ssIGVycmJhY2spO1xuICB9LFxuXG4gIGNhbGxiYWNrOiBmdW5jdGlvbihjYWxsYmFjaywgY29udGV4dCkge1xuICAgIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24odmFsdWUpIHsgY2FsbGJhY2suY2FsbChjb250ZXh0LCB2YWx1ZSkgfSk7XG4gIH0sXG5cbiAgZXJyYmFjazogZnVuY3Rpb24oY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIGZ1bmN0aW9uKHJlYXNvbikgeyBjYWxsYmFjay5jYWxsKGNvbnRleHQsIHJlYXNvbikgfSk7XG4gIH0sXG5cbiAgdGltZW91dDogZnVuY3Rpb24oc2Vjb25kcywgbWVzc2FnZSkge1xuICAgIHRoaXMudGhlbigpO1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLl90aW1lciA9IEZheWUuRU5WLnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBzZWxmLl9yZWplY3QobWVzc2FnZSk7XG4gICAgfSwgc2Vjb25kcyAqIDEwMDApO1xuICB9LFxuXG4gIHNldERlZmVycmVkU3RhdHVzOiBmdW5jdGlvbihzdGF0dXMsIHZhbHVlKSB7XG4gICAgaWYgKHRoaXMuX3RpbWVyKSBGYXllLkVOVi5jbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xuXG4gICAgdGhpcy50aGVuKCk7XG5cbiAgICBpZiAoc3RhdHVzID09PSAnc3VjY2VlZGVkJylcbiAgICAgIHRoaXMuX2Z1bGZpbGwodmFsdWUpO1xuICAgIGVsc2UgaWYgKHN0YXR1cyA9PT0gJ2ZhaWxlZCcpXG4gICAgICB0aGlzLl9yZWplY3QodmFsdWUpO1xuICAgIGVsc2VcbiAgICAgIGRlbGV0ZSB0aGlzLl9wcm9taXNlO1xuICB9XG59O1xuXG5GYXllLlB1Ymxpc2hlciA9IHtcbiAgY291bnRMaXN0ZW5lcnM6IGZ1bmN0aW9uKGV2ZW50VHlwZSkge1xuICAgIHJldHVybiB0aGlzLmxpc3RlbmVycyhldmVudFR5cGUpLmxlbmd0aDtcbiAgfSxcblxuICBiaW5kOiBmdW5jdGlvbihldmVudFR5cGUsIGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgdmFyIHNsaWNlICAgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UsXG4gICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbigpIHsgbGlzdGVuZXIuYXBwbHkoY29udGV4dCwgc2xpY2UuY2FsbChhcmd1bWVudHMpKSB9O1xuXG4gICAgdGhpcy5fbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzIHx8IFtdO1xuICAgIHRoaXMuX2xpc3RlbmVycy5wdXNoKFtldmVudFR5cGUsIGxpc3RlbmVyLCBjb250ZXh0LCBoYW5kbGVyXSk7XG4gICAgcmV0dXJuIHRoaXMub24oZXZlbnRUeXBlLCBoYW5kbGVyKTtcbiAgfSxcblxuICB1bmJpbmQ6IGZ1bmN0aW9uKGV2ZW50VHlwZSwgbGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICB0aGlzLl9saXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMgfHwgW107XG4gICAgdmFyIG4gPSB0aGlzLl9saXN0ZW5lcnMubGVuZ3RoLCB0dXBsZTtcblxuICAgIHdoaWxlIChuLS0pIHtcbiAgICAgIHR1cGxlID0gdGhpcy5fbGlzdGVuZXJzW25dO1xuICAgICAgaWYgKHR1cGxlWzBdICE9PSBldmVudFR5cGUpIGNvbnRpbnVlO1xuICAgICAgaWYgKGxpc3RlbmVyICYmICh0dXBsZVsxXSAhPT0gbGlzdGVuZXIgfHwgdHVwbGVbMl0gIT09IGNvbnRleHQpKSBjb250aW51ZTtcbiAgICAgIHRoaXMuX2xpc3RlbmVycy5zcGxpY2UobiwgMSk7XG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKGV2ZW50VHlwZSwgdHVwbGVbM10pO1xuICAgIH1cbiAgfVxufTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5QdWJsaXNoZXIsIEZheWUuRXZlbnRFbWl0dGVyLnByb3RvdHlwZSk7XG5GYXllLlB1Ymxpc2hlci50cmlnZ2VyID0gRmF5ZS5QdWJsaXNoZXIuZW1pdDtcblxuRmF5ZS5UaW1lb3V0cyA9IHtcbiAgYWRkVGltZW91dDogZnVuY3Rpb24obmFtZSwgZGVsYXksIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdGhpcy5fdGltZW91dHMgPSB0aGlzLl90aW1lb3V0cyB8fCB7fTtcbiAgICBpZiAodGhpcy5fdGltZW91dHMuaGFzT3duUHJvcGVydHkobmFtZSkpIHJldHVybjtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy5fdGltZW91dHNbbmFtZV0gPSBGYXllLkVOVi5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgZGVsZXRlIHNlbGYuX3RpbWVvdXRzW25hbWVdO1xuICAgICAgY2FsbGJhY2suY2FsbChjb250ZXh0KTtcbiAgICB9LCAxMDAwICogZGVsYXkpO1xuICB9LFxuXG4gIHJlbW92ZVRpbWVvdXQ6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB0aGlzLl90aW1lb3V0cyA9IHRoaXMuX3RpbWVvdXRzIHx8IHt9O1xuICAgIHZhciB0aW1lb3V0ID0gdGhpcy5fdGltZW91dHNbbmFtZV07XG4gICAgaWYgKCF0aW1lb3V0KSByZXR1cm47XG4gICAgRmF5ZS5FTlYuY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgIGRlbGV0ZSB0aGlzLl90aW1lb3V0c1tuYW1lXTtcbiAgfSxcblxuICByZW1vdmVBbGxUaW1lb3V0czogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fdGltZW91dHMgPSB0aGlzLl90aW1lb3V0cyB8fCB7fTtcbiAgICBmb3IgKHZhciBuYW1lIGluIHRoaXMuX3RpbWVvdXRzKSB0aGlzLnJlbW92ZVRpbWVvdXQobmFtZSk7XG4gIH1cbn07XG5cbkZheWUuTG9nZ2luZyA9IHtcbiAgTE9HX0xFVkVMUzoge1xuICAgIGZhdGFsOiAgNCxcbiAgICBlcnJvcjogIDMsXG4gICAgd2FybjogICAyLFxuICAgIGluZm86ICAgMSxcbiAgICBkZWJ1ZzogIDBcbiAgfSxcblxuICB3cml0ZUxvZzogZnVuY3Rpb24obWVzc2FnZUFyZ3MsIGxldmVsKSB7XG4gICAgaWYgKCFGYXllLmxvZ2dlcikgcmV0dXJuO1xuXG4gICAgdmFyIGFyZ3MgICA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShtZXNzYWdlQXJncyksXG4gICAgICAgIGJhbm5lciA9ICdbRmF5ZScsXG4gICAgICAgIGtsYXNzICA9IHRoaXMuY2xhc3NOYW1lLFxuXG4gICAgICAgIG1lc3NhZ2UgPSBhcmdzLnNoaWZ0KCkucmVwbGFjZSgvXFw/L2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gRmF5ZS50b0pTT04oYXJncy5zaGlmdCgpKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tPYmplY3RdJztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgZm9yICh2YXIga2V5IGluIEZheWUpIHtcbiAgICAgIGlmIChrbGFzcykgY29udGludWU7XG4gICAgICBpZiAodHlwZW9mIEZheWVba2V5XSAhPT0gJ2Z1bmN0aW9uJykgY29udGludWU7XG4gICAgICBpZiAodGhpcyBpbnN0YW5jZW9mIEZheWVba2V5XSkga2xhc3MgPSBrZXk7XG4gICAgfVxuICAgIGlmIChrbGFzcykgYmFubmVyICs9ICcuJyArIGtsYXNzO1xuICAgIGJhbm5lciArPSAnXSAnO1xuXG4gICAgaWYgKHR5cGVvZiBGYXllLmxvZ2dlcltsZXZlbF0gPT09ICdmdW5jdGlvbicpXG4gICAgICBGYXllLmxvZ2dlcltsZXZlbF0oYmFubmVyICsgbWVzc2FnZSk7XG4gICAgZWxzZSBpZiAodHlwZW9mIEZheWUubG9nZ2VyID09PSAnZnVuY3Rpb24nKVxuICAgICAgRmF5ZS5sb2dnZXIoYmFubmVyICsgbWVzc2FnZSk7XG4gIH1cbn07XG5cbihmdW5jdGlvbigpIHtcbiAgZm9yICh2YXIga2V5IGluIEZheWUuTG9nZ2luZy5MT0dfTEVWRUxTKVxuICAgIChmdW5jdGlvbihsZXZlbCkge1xuICAgICAgRmF5ZS5Mb2dnaW5nW2xldmVsXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLndyaXRlTG9nKGFyZ3VtZW50cywgbGV2ZWwpO1xuICAgICAgfTtcbiAgICB9KShrZXkpO1xufSkoKTtcblxuRmF5ZS5HcmFtbWFyID0ge1xuICBDSEFOTkVMX05BTUU6ICAgICAvXlxcLygoKChbYS16XXxbQS1aXSl8WzAtOV0pfChcXC18XFxffFxcIXxcXH58XFwofFxcKXxcXCR8XFxAKSkpKyhcXC8oKCgoW2Etel18W0EtWl0pfFswLTldKXwoXFwtfFxcX3xcXCF8XFx+fFxcKHxcXCl8XFwkfFxcQCkpKSspKiQvLFxuICBDSEFOTkVMX1BBVFRFUk46ICAvXihcXC8oKCgoW2Etel18W0EtWl0pfFswLTldKXwoXFwtfFxcX3xcXCF8XFx+fFxcKHxcXCl8XFwkfFxcQCkpKSspKlxcL1xcKnsxLDJ9JC8sXG4gIEVSUk9SOiAgICAgICAgICAgIC9eKFswLTldWzAtOV1bMC05XTooKCgoW2Etel18W0EtWl0pfFswLTldKXwoXFwtfFxcX3xcXCF8XFx+fFxcKHxcXCl8XFwkfFxcQCl8IHxcXC98XFwqfFxcLikpKigsKCgoKFthLXpdfFtBLVpdKXxbMC05XSl8KFxcLXxcXF98XFwhfFxcfnxcXCh8XFwpfFxcJHxcXEApfCB8XFwvfFxcKnxcXC4pKSopKjooKCgoW2Etel18W0EtWl0pfFswLTldKXwoXFwtfFxcX3xcXCF8XFx+fFxcKHxcXCl8XFwkfFxcQCl8IHxcXC98XFwqfFxcLikpKnxbMC05XVswLTldWzAtOV06OigoKChbYS16XXxbQS1aXSl8WzAtOV0pfChcXC18XFxffFxcIXxcXH58XFwofFxcKXxcXCR8XFxAKXwgfFxcL3xcXCp8XFwuKSkqKSQvLFxuICBWRVJTSU9OOiAgICAgICAgICAvXihbMC05XSkrKFxcLigoW2Etel18W0EtWl0pfFswLTldKSgoKChbYS16XXxbQS1aXSl8WzAtOV0pfFxcLXxcXF8pKSopKiQvXG59O1xuXG5GYXllLkV4dGVuc2libGUgPSB7XG4gIGFkZEV4dGVuc2lvbjogZnVuY3Rpb24oZXh0ZW5zaW9uKSB7XG4gICAgdGhpcy5fZXh0ZW5zaW9ucyA9IHRoaXMuX2V4dGVuc2lvbnMgfHwgW107XG4gICAgdGhpcy5fZXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG4gICAgaWYgKGV4dGVuc2lvbi5hZGRlZCkgZXh0ZW5zaW9uLmFkZGVkKHRoaXMpO1xuICB9LFxuXG4gIHJlbW92ZUV4dGVuc2lvbjogZnVuY3Rpb24oZXh0ZW5zaW9uKSB7XG4gICAgaWYgKCF0aGlzLl9leHRlbnNpb25zKSByZXR1cm47XG4gICAgdmFyIGkgPSB0aGlzLl9leHRlbnNpb25zLmxlbmd0aDtcbiAgICB3aGlsZSAoaS0tKSB7XG4gICAgICBpZiAodGhpcy5fZXh0ZW5zaW9uc1tpXSAhPT0gZXh0ZW5zaW9uKSBjb250aW51ZTtcbiAgICAgIHRoaXMuX2V4dGVuc2lvbnMuc3BsaWNlKGksMSk7XG4gICAgICBpZiAoZXh0ZW5zaW9uLnJlbW92ZWQpIGV4dGVuc2lvbi5yZW1vdmVkKHRoaXMpO1xuICAgIH1cbiAgfSxcblxuICBwaXBlVGhyb3VnaEV4dGVuc2lvbnM6IGZ1bmN0aW9uKHN0YWdlLCBtZXNzYWdlLCByZXF1ZXN0LCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIHRoaXMuZGVidWcoJ1Bhc3NpbmcgdGhyb3VnaCA/IGV4dGVuc2lvbnM6ID8nLCBzdGFnZSwgbWVzc2FnZSk7XG5cbiAgICBpZiAoIXRoaXMuX2V4dGVuc2lvbnMpIHJldHVybiBjYWxsYmFjay5jYWxsKGNvbnRleHQsIG1lc3NhZ2UpO1xuICAgIHZhciBleHRlbnNpb25zID0gdGhpcy5fZXh0ZW5zaW9ucy5zbGljZSgpO1xuXG4gICAgdmFyIHBpcGUgPSBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgICBpZiAoIW1lc3NhZ2UpIHJldHVybiBjYWxsYmFjay5jYWxsKGNvbnRleHQsIG1lc3NhZ2UpO1xuXG4gICAgICB2YXIgZXh0ZW5zaW9uID0gZXh0ZW5zaW9ucy5zaGlmdCgpO1xuICAgICAgaWYgKCFleHRlbnNpb24pIHJldHVybiBjYWxsYmFjay5jYWxsKGNvbnRleHQsIG1lc3NhZ2UpO1xuXG4gICAgICB2YXIgZm4gPSBleHRlbnNpb25bc3RhZ2VdO1xuICAgICAgaWYgKCFmbikgcmV0dXJuIHBpcGUobWVzc2FnZSk7XG5cbiAgICAgIGlmIChmbi5sZW5ndGggPj0gMykgZXh0ZW5zaW9uW3N0YWdlXShtZXNzYWdlLCByZXF1ZXN0LCBwaXBlKTtcbiAgICAgIGVsc2UgICAgICAgICAgICAgICAgZXh0ZW5zaW9uW3N0YWdlXShtZXNzYWdlLCBwaXBlKTtcbiAgICB9O1xuICAgIHBpcGUobWVzc2FnZSk7XG4gIH1cbn07XG5cbkZheWUuZXh0ZW5kKEZheWUuRXh0ZW5zaWJsZSwgRmF5ZS5Mb2dnaW5nKTtcblxuRmF5ZS5DaGFubmVsID0gRmF5ZS5DbGFzcyh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB0aGlzLmlkID0gdGhpcy5uYW1lID0gbmFtZTtcbiAgfSxcblxuICBwdXNoOiBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgdGhpcy50cmlnZ2VyKCdtZXNzYWdlJywgbWVzc2FnZSk7XG4gIH0sXG5cbiAgaXNVbnVzZWQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmNvdW50TGlzdGVuZXJzKCdtZXNzYWdlJykgPT09IDA7XG4gIH1cbn0pO1xuXG5GYXllLmV4dGVuZChGYXllLkNoYW5uZWwucHJvdG90eXBlLCBGYXllLlB1Ymxpc2hlcik7XG5cbkZheWUuZXh0ZW5kKEZheWUuQ2hhbm5lbCwge1xuICBIQU5EU0hBS0U6ICAgICcvbWV0YS9oYW5kc2hha2UnLFxuICBDT05ORUNUOiAgICAgICcvbWV0YS9jb25uZWN0JyxcbiAgU1VCU0NSSUJFOiAgICAnL21ldGEvc3Vic2NyaWJlJyxcbiAgVU5TVUJTQ1JJQkU6ICAnL21ldGEvdW5zdWJzY3JpYmUnLFxuICBESVNDT05ORUNUOiAgICcvbWV0YS9kaXNjb25uZWN0JyxcblxuICBNRVRBOiAgICAgICAgICdtZXRhJyxcbiAgU0VSVklDRTogICAgICAnc2VydmljZScsXG5cbiAgZXhwYW5kOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIHNlZ21lbnRzID0gdGhpcy5wYXJzZShuYW1lKSxcbiAgICAgICAgY2hhbm5lbHMgPSBbJy8qKicsIG5hbWVdO1xuXG4gICAgdmFyIGNvcHkgPSBzZWdtZW50cy5zbGljZSgpO1xuICAgIGNvcHlbY29weS5sZW5ndGggLSAxXSA9ICcqJztcbiAgICBjaGFubmVscy5wdXNoKHRoaXMudW5wYXJzZShjb3B5KSk7XG5cbiAgICBmb3IgKHZhciBpID0gMSwgbiA9IHNlZ21lbnRzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgY29weSA9IHNlZ21lbnRzLnNsaWNlKDAsIGkpO1xuICAgICAgY29weS5wdXNoKCcqKicpO1xuICAgICAgY2hhbm5lbHMucHVzaCh0aGlzLnVucGFyc2UoY29weSkpO1xuICAgIH1cblxuICAgIHJldHVybiBjaGFubmVscztcbiAgfSxcblxuICBpc1ZhbGlkOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIEZheWUuR3JhbW1hci5DSEFOTkVMX05BTUUudGVzdChuYW1lKSB8fFxuICAgICAgICAgICBGYXllLkdyYW1tYXIuQ0hBTk5FTF9QQVRURVJOLnRlc3QobmFtZSk7XG4gIH0sXG5cbiAgcGFyc2U6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBpZiAoIXRoaXMuaXNWYWxpZChuYW1lKSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIG5hbWUuc3BsaXQoJy8nKS5zbGljZSgxKTtcbiAgfSxcblxuICB1bnBhcnNlOiBmdW5jdGlvbihzZWdtZW50cykge1xuICAgIHJldHVybiAnLycgKyBzZWdtZW50cy5qb2luKCcvJyk7XG4gIH0sXG5cbiAgaXNNZXRhOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIHNlZ21lbnRzID0gdGhpcy5wYXJzZShuYW1lKTtcbiAgICByZXR1cm4gc2VnbWVudHMgPyAoc2VnbWVudHNbMF0gPT09IHRoaXMuTUVUQSkgOiBudWxsO1xuICB9LFxuXG4gIGlzU2VydmljZTogZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBzZWdtZW50cyA9IHRoaXMucGFyc2UobmFtZSk7XG4gICAgcmV0dXJuIHNlZ21lbnRzID8gKHNlZ21lbnRzWzBdID09PSB0aGlzLlNFUlZJQ0UpIDogbnVsbDtcbiAgfSxcblxuICBpc1N1YnNjcmliYWJsZTogZnVuY3Rpb24obmFtZSkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKG5hbWUpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gIXRoaXMuaXNNZXRhKG5hbWUpICYmICF0aGlzLmlzU2VydmljZShuYW1lKTtcbiAgfSxcblxuICBTZXQ6IEZheWUuQ2xhc3Moe1xuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fY2hhbm5lbHMgPSB7fTtcbiAgICB9LFxuXG4gICAgZ2V0S2V5czogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIga2V5cyA9IFtdO1xuICAgICAgZm9yICh2YXIga2V5IGluIHRoaXMuX2NoYW5uZWxzKSBrZXlzLnB1c2goa2V5KTtcbiAgICAgIHJldHVybiBrZXlzO1xuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIGRlbGV0ZSB0aGlzLl9jaGFubmVsc1tuYW1lXTtcbiAgICB9LFxuXG4gICAgaGFzU3Vic2NyaXB0aW9uOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5fY2hhbm5lbHMuaGFzT3duUHJvcGVydHkobmFtZSk7XG4gICAgfSxcblxuICAgIHN1YnNjcmliZTogZnVuY3Rpb24obmFtZXMsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICB2YXIgbmFtZTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gbmFtZXMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIG5hbWUgPSBuYW1lc1tpXTtcbiAgICAgICAgdmFyIGNoYW5uZWwgPSB0aGlzLl9jaGFubmVsc1tuYW1lXSA9IHRoaXMuX2NoYW5uZWxzW25hbWVdIHx8IG5ldyBGYXllLkNoYW5uZWwobmFtZSk7XG4gICAgICAgIGlmIChjYWxsYmFjaykgY2hhbm5lbC5iaW5kKCdtZXNzYWdlJywgY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICB1bnN1YnNjcmliZTogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICAgIHZhciBjaGFubmVsID0gdGhpcy5fY2hhbm5lbHNbbmFtZV07XG4gICAgICBpZiAoIWNoYW5uZWwpIHJldHVybiBmYWxzZTtcbiAgICAgIGNoYW5uZWwudW5iaW5kKCdtZXNzYWdlJywgY2FsbGJhY2ssIGNvbnRleHQpO1xuXG4gICAgICBpZiAoY2hhbm5lbC5pc1VudXNlZCgpKSB7XG4gICAgICAgIHRoaXMucmVtb3ZlKG5hbWUpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgZGlzdHJpYnV0ZU1lc3NhZ2U6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgIHZhciBjaGFubmVscyA9IEZheWUuQ2hhbm5lbC5leHBhbmQobWVzc2FnZS5jaGFubmVsKTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBjaGFubmVscy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGNoYW5uZWwgPSB0aGlzLl9jaGFubmVsc1tjaGFubmVsc1tpXV07XG4gICAgICAgIGlmIChjaGFubmVsKSBjaGFubmVsLnRyaWdnZXIoJ21lc3NhZ2UnLCBtZXNzYWdlLmRhdGEpO1xuICAgICAgfVxuICAgIH1cbiAgfSlcbn0pO1xuXG5GYXllLlB1YmxpY2F0aW9uID0gRmF5ZS5DbGFzcyhGYXllLkRlZmVycmFibGUpO1xuXG5GYXllLlN1YnNjcmlwdGlvbiA9IEZheWUuQ2xhc3Moe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbihjbGllbnQsIGNoYW5uZWxzLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIHRoaXMuX2NsaWVudCAgICA9IGNsaWVudDtcbiAgICB0aGlzLl9jaGFubmVscyAgPSBjaGFubmVscztcbiAgICB0aGlzLl9jYWxsYmFjayAgPSBjYWxsYmFjaztcbiAgICB0aGlzLl9jb250ZXh0ICAgICA9IGNvbnRleHQ7XG4gICAgdGhpcy5fY2FuY2VsbGVkID0gZmFsc2U7XG4gIH0sXG5cbiAgY2FuY2VsOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5fY2FuY2VsbGVkKSByZXR1cm47XG4gICAgdGhpcy5fY2xpZW50LnVuc3Vic2NyaWJlKHRoaXMuX2NoYW5uZWxzLCB0aGlzLl9jYWxsYmFjaywgdGhpcy5fY29udGV4dCk7XG4gICAgdGhpcy5fY2FuY2VsbGVkID0gdHJ1ZTtcbiAgfSxcblxuICB1bnN1YnNjcmliZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jYW5jZWwoKTtcbiAgfVxufSk7XG5cbkZheWUuZXh0ZW5kKEZheWUuU3Vic2NyaXB0aW9uLnByb3RvdHlwZSwgRmF5ZS5EZWZlcnJhYmxlKTtcblxuRmF5ZS5DbGllbnQgPSBGYXllLkNsYXNzKHtcbiAgVU5DT05ORUNURUQ6ICAgICAgICAxLFxuICBDT05ORUNUSU5HOiAgICAgICAgIDIsXG4gIENPTk5FQ1RFRDogICAgICAgICAgMyxcbiAgRElTQ09OTkVDVEVEOiAgICAgICA0LFxuXG4gIEhBTkRTSEFLRTogICAgICAgICAgJ2hhbmRzaGFrZScsXG4gIFJFVFJZOiAgICAgICAgICAgICAgJ3JldHJ5JyxcbiAgTk9ORTogICAgICAgICAgICAgICAnbm9uZScsXG5cbiAgQ09OTkVDVElPTl9USU1FT1VUOiA2MCxcblxuICBERUZBVUxUX0VORFBPSU5UOiAgICcvYmF5ZXV4JyxcbiAgSU5URVJWQUw6ICAgICAgICAgICAwLFxuXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKGVuZHBvaW50LCBvcHRpb25zKSB7XG4gICAgdGhpcy5pbmZvKCdOZXcgY2xpZW50IGNyZWF0ZWQgZm9yID8nLCBlbmRwb2ludCk7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICBGYXllLnZhbGlkYXRlT3B0aW9ucyhvcHRpb25zLCBbJ2ludGVydmFsJywgJ3RpbWVvdXQnLCAnZW5kcG9pbnRzJywgJ3Byb3h5JywgJ3JldHJ5JywgJ3NjaGVkdWxlcicsICd3ZWJzb2NrZXRFeHRlbnNpb25zJywgJ3RscycsICdjYSddKTtcblxuICAgIHRoaXMuX2VuZHBvaW50ICAgPSBlbmRwb2ludCB8fCB0aGlzLkRFRkFVTFRfRU5EUE9JTlQ7XG4gICAgdGhpcy5fY2hhbm5lbHMgICA9IG5ldyBGYXllLkNoYW5uZWwuU2V0KCk7XG4gICAgdGhpcy5fZGlzcGF0Y2hlciA9IG5ldyBGYXllLkRpc3BhdGNoZXIodGhpcywgdGhpcy5fZW5kcG9pbnQsIG9wdGlvbnMpO1xuXG4gICAgdGhpcy5fbWVzc2FnZUlkID0gMDtcbiAgICB0aGlzLl9zdGF0ZSAgICAgPSB0aGlzLlVOQ09OTkVDVEVEO1xuXG4gICAgdGhpcy5fcmVzcG9uc2VDYWxsYmFja3MgPSB7fTtcblxuICAgIHRoaXMuX2FkdmljZSA9IHtcbiAgICAgIHJlY29ubmVjdDogdGhpcy5SRVRSWSxcbiAgICAgIGludGVydmFsOiAgMTAwMCAqIChvcHRpb25zLmludGVydmFsIHx8IHRoaXMuSU5URVJWQUwpLFxuICAgICAgdGltZW91dDogICAxMDAwICogKG9wdGlvbnMudGltZW91dCAgfHwgdGhpcy5DT05ORUNUSU9OX1RJTUVPVVQpXG4gICAgfTtcbiAgICB0aGlzLl9kaXNwYXRjaGVyLnRpbWVvdXQgPSB0aGlzLl9hZHZpY2UudGltZW91dCAvIDEwMDA7XG5cbiAgICB0aGlzLl9kaXNwYXRjaGVyLmJpbmQoJ21lc3NhZ2UnLCB0aGlzLl9yZWNlaXZlTWVzc2FnZSwgdGhpcyk7XG5cbiAgICBpZiAoRmF5ZS5FdmVudCAmJiBGYXllLkVOVi5vbmJlZm9yZXVubG9hZCAhPT0gdW5kZWZpbmVkKVxuICAgICAgRmF5ZS5FdmVudC5vbihGYXllLkVOViwgJ2JlZm9yZXVubG9hZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoRmF5ZS5pbmRleE9mKHRoaXMuX2Rpc3BhdGNoZXIuX2Rpc2FibGVkLCAnYXV0b2Rpc2Nvbm5lY3QnKSA8IDApXG4gICAgICAgICAgdGhpcy5kaXNjb25uZWN0KCk7XG4gICAgICB9LCB0aGlzKTtcbiAgfSxcblxuICBhZGRXZWJzb2NrZXRFeHRlbnNpb246IGZ1bmN0aW9uKGV4dGVuc2lvbikge1xuICAgIHJldHVybiB0aGlzLl9kaXNwYXRjaGVyLmFkZFdlYnNvY2tldEV4dGVuc2lvbihleHRlbnNpb24pO1xuICB9LFxuXG4gIGRpc2FibGU6IGZ1bmN0aW9uKGZlYXR1cmUpIHtcbiAgICByZXR1cm4gdGhpcy5fZGlzcGF0Y2hlci5kaXNhYmxlKGZlYXR1cmUpO1xuICB9LFxuXG4gIHNldEhlYWRlcjogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcbiAgICByZXR1cm4gdGhpcy5fZGlzcGF0Y2hlci5zZXRIZWFkZXIobmFtZSwgdmFsdWUpO1xuICB9LFxuXG4gIC8vIFJlcXVlc3RcbiAgLy8gTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsXG4gIC8vICAgICAgICAgICAgICAgICogdmVyc2lvblxuICAvLyAgICAgICAgICAgICAgICAqIHN1cHBvcnRlZENvbm5lY3Rpb25UeXBlc1xuICAvLyBNQVkgaW5jbHVkZTogICAqIG1pbmltdW1WZXJzaW9uXG4gIC8vICAgICAgICAgICAgICAgICogZXh0XG4gIC8vICAgICAgICAgICAgICAgICogaWRcbiAgLy9cbiAgLy8gU3VjY2VzcyBSZXNwb25zZSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRmFpbGVkIFJlc3BvbnNlXG4gIC8vIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbCAgICAgICAgICAgICAgICAgICAgIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbFxuICAvLyAgICAgICAgICAgICAgICAqIHZlcnNpb24gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHN1Y2Nlc3NmdWxcbiAgLy8gICAgICAgICAgICAgICAgKiBzdXBwb3J0ZWRDb25uZWN0aW9uVHlwZXMgICAgICAgICAgICAgICAgICAgKiBlcnJvclxuICAvLyAgICAgICAgICAgICAgICAqIGNsaWVudElkICAgICAgICAgICAgICAgICAgICBNQVkgaW5jbHVkZTogICAqIHN1cHBvcnRlZENvbm5lY3Rpb25UeXBlc1xuICAvLyAgICAgICAgICAgICAgICAqIHN1Y2Nlc3NmdWwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGFkdmljZVxuICAvLyBNQVkgaW5jbHVkZTogICAqIG1pbmltdW1WZXJzaW9uICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHZlcnNpb25cbiAgLy8gICAgICAgICAgICAgICAgKiBhZHZpY2UgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBtaW5pbXVtVmVyc2lvblxuICAvLyAgICAgICAgICAgICAgICAqIGV4dCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4dFxuICAvLyAgICAgICAgICAgICAgICAqIGlkICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGlkXG4gIC8vICAgICAgICAgICAgICAgICogYXV0aFN1Y2Nlc3NmdWxcbiAgaGFuZHNoYWtlOiBmdW5jdGlvbihjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGlmICh0aGlzLl9hZHZpY2UucmVjb25uZWN0ID09PSB0aGlzLk5PTkUpIHJldHVybjtcbiAgICBpZiAodGhpcy5fc3RhdGUgIT09IHRoaXMuVU5DT05ORUNURUQpIHJldHVybjtcblxuICAgIHRoaXMuX3N0YXRlID0gdGhpcy5DT05ORUNUSU5HO1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuaW5mbygnSW5pdGlhdGluZyBoYW5kc2hha2Ugd2l0aCA/JywgRmF5ZS5VUkkuc3RyaW5naWZ5KHRoaXMuX2VuZHBvaW50KSk7XG4gICAgdGhpcy5fZGlzcGF0Y2hlci5zZWxlY3RUcmFuc3BvcnQoRmF5ZS5NQU5EQVRPUllfQ09OTkVDVElPTl9UWVBFUyk7XG5cbiAgICB0aGlzLl9zZW5kTWVzc2FnZSh7XG4gICAgICBjaGFubmVsOiAgICAgICAgICAgICAgICAgIEZheWUuQ2hhbm5lbC5IQU5EU0hBS0UsXG4gICAgICB2ZXJzaW9uOiAgICAgICAgICAgICAgICAgIEZheWUuQkFZRVVYX1ZFUlNJT04sXG4gICAgICBzdXBwb3J0ZWRDb25uZWN0aW9uVHlwZXM6IHRoaXMuX2Rpc3BhdGNoZXIuZ2V0Q29ubmVjdGlvblR5cGVzKClcblxuICAgIH0sIHt9LCBmdW5jdGlvbihyZXNwb25zZSkge1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3VjY2Vzc2Z1bCkge1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IHRoaXMuQ09OTkVDVEVEO1xuICAgICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkICA9IHJlc3BvbnNlLmNsaWVudElkO1xuXG4gICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuc2VsZWN0VHJhbnNwb3J0KHJlc3BvbnNlLnN1cHBvcnRlZENvbm5lY3Rpb25UeXBlcyk7XG5cbiAgICAgICAgdGhpcy5pbmZvKCdIYW5kc2hha2Ugc3VjY2Vzc2Z1bDogPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQpO1xuXG4gICAgICAgIHRoaXMuc3Vic2NyaWJlKHRoaXMuX2NoYW5uZWxzLmdldEtleXMoKSwgdHJ1ZSk7XG4gICAgICAgIGlmIChjYWxsYmFjaykgRmF5ZS5Qcm9taXNlLmRlZmVyKGZ1bmN0aW9uKCkgeyBjYWxsYmFjay5jYWxsKGNvbnRleHQpIH0pO1xuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmluZm8oJ0hhbmRzaGFrZSB1bnN1Y2Nlc3NmdWwnKTtcbiAgICAgICAgRmF5ZS5FTlYuc2V0VGltZW91dChmdW5jdGlvbigpIHsgc2VsZi5oYW5kc2hha2UoY2FsbGJhY2ssIGNvbnRleHQpIH0sIHRoaXMuX2Rpc3BhdGNoZXIucmV0cnkgKiAxMDAwKTtcbiAgICAgICAgdGhpcy5fc3RhdGUgPSB0aGlzLlVOQ09OTkVDVEVEO1xuICAgICAgfVxuICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIC8vIFJlcXVlc3QgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBSZXNwb25zZVxuICAvLyBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWwgICAgICAgICAgICAgTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsXG4gIC8vICAgICAgICAgICAgICAgICogY2xpZW50SWQgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHN1Y2Nlc3NmdWxcbiAgLy8gICAgICAgICAgICAgICAgKiBjb25uZWN0aW9uVHlwZSAgICAgICAgICAgICAgICAgICAgICogY2xpZW50SWRcbiAgLy8gTUFZIGluY2x1ZGU6ICAgKiBleHQgICAgICAgICAgICAgICAgIE1BWSBpbmNsdWRlOiAgICogZXJyb3JcbiAgLy8gICAgICAgICAgICAgICAgKiBpZCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogYWR2aWNlXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4dFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBpZFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiB0aW1lc3RhbXBcbiAgY29ubmVjdDogZnVuY3Rpb24oY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5fYWR2aWNlLnJlY29ubmVjdCA9PT0gdGhpcy5OT05FKSByZXR1cm47XG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSB0aGlzLkRJU0NPTk5FQ1RFRCkgcmV0dXJuO1xuXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSB0aGlzLlVOQ09OTkVDVEVEKVxuICAgICAgcmV0dXJuIHRoaXMuaGFuZHNoYWtlKGZ1bmN0aW9uKCkgeyB0aGlzLmNvbm5lY3QoY2FsbGJhY2ssIGNvbnRleHQpIH0sIHRoaXMpO1xuXG4gICAgdGhpcy5jYWxsYmFjayhjYWxsYmFjaywgY29udGV4dCk7XG4gICAgaWYgKHRoaXMuX3N0YXRlICE9PSB0aGlzLkNPTk5FQ1RFRCkgcmV0dXJuO1xuXG4gICAgdGhpcy5pbmZvKCdDYWxsaW5nIGRlZmVycmVkIGFjdGlvbnMgZm9yID8nLCB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkKTtcbiAgICB0aGlzLnNldERlZmVycmVkU3RhdHVzKCdzdWNjZWVkZWQnKTtcbiAgICB0aGlzLnNldERlZmVycmVkU3RhdHVzKCd1bmtub3duJyk7XG5cbiAgICBpZiAodGhpcy5fY29ubmVjdFJlcXVlc3QpIHJldHVybjtcbiAgICB0aGlzLl9jb25uZWN0UmVxdWVzdCA9IHRydWU7XG5cbiAgICB0aGlzLmluZm8oJ0luaXRpYXRpbmcgY29ubmVjdGlvbiBmb3IgPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQpO1xuXG4gICAgdGhpcy5fc2VuZE1lc3NhZ2Uoe1xuICAgICAgY2hhbm5lbDogICAgICAgIEZheWUuQ2hhbm5lbC5DT05ORUNULFxuICAgICAgY2xpZW50SWQ6ICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQsXG4gICAgICBjb25uZWN0aW9uVHlwZTogdGhpcy5fZGlzcGF0Y2hlci5jb25uZWN0aW9uVHlwZVxuXG4gICAgfSwge30sIHRoaXMuX2N5Y2xlQ29ubmVjdGlvbiwgdGhpcyk7XG4gIH0sXG5cbiAgLy8gUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlc3BvbnNlXG4gIC8vIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbCAgICAgICAgICAgICBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWxcbiAgLy8gICAgICAgICAgICAgICAgKiBjbGllbnRJZCAgICAgICAgICAgICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bFxuICAvLyBNQVkgaW5jbHVkZTogICAqIGV4dCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBjbGllbnRJZFxuICAvLyAgICAgICAgICAgICAgICAqIGlkICAgICAgICAgICAgICAgICAgTUFZIGluY2x1ZGU6ICAgKiBlcnJvclxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBleHRcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogaWRcbiAgZGlzY29ubmVjdDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuX3N0YXRlICE9PSB0aGlzLkNPTk5FQ1RFRCkgcmV0dXJuO1xuICAgIHRoaXMuX3N0YXRlID0gdGhpcy5ESVNDT05ORUNURUQ7XG5cbiAgICB0aGlzLmluZm8oJ0Rpc2Nvbm5lY3RpbmcgPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQpO1xuICAgIHZhciBwcm9taXNlID0gbmV3IEZheWUuUHVibGljYXRpb24oKTtcblxuICAgIHRoaXMuX3NlbmRNZXNzYWdlKHtcbiAgICAgIGNoYW5uZWw6ICBGYXllLkNoYW5uZWwuRElTQ09OTkVDVCxcbiAgICAgIGNsaWVudElkOiB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkXG5cbiAgICB9LCB7fSwgZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXNwb25zZS5zdWNjZXNzZnVsKSB7XG4gICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuY2xvc2UoKTtcbiAgICAgICAgcHJvbWlzZS5zZXREZWZlcnJlZFN0YXR1cygnc3VjY2VlZGVkJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwcm9taXNlLnNldERlZmVycmVkU3RhdHVzKCdmYWlsZWQnLCBGYXllLkVycm9yLnBhcnNlKHJlc3BvbnNlLmVycm9yKSk7XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG5cbiAgICB0aGlzLmluZm8oJ0NsZWFyaW5nIGNoYW5uZWwgbGlzdGVuZXJzIGZvciA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCk7XG4gICAgdGhpcy5fY2hhbm5lbHMgPSBuZXcgRmF5ZS5DaGFubmVsLlNldCgpO1xuXG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH0sXG5cbiAgLy8gUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlc3BvbnNlXG4gIC8vIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbCAgICAgICAgICAgICBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWxcbiAgLy8gICAgICAgICAgICAgICAgKiBjbGllbnRJZCAgICAgICAgICAgICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bFxuICAvLyAgICAgICAgICAgICAgICAqIHN1YnNjcmlwdGlvbiAgICAgICAgICAgICAgICAgICAgICAgKiBjbGllbnRJZFxuICAvLyBNQVkgaW5jbHVkZTogICAqIGV4dCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBzdWJzY3JpcHRpb25cbiAgLy8gICAgICAgICAgICAgICAgKiBpZCAgICAgICAgICAgICAgICAgIE1BWSBpbmNsdWRlOiAgICogZXJyb3JcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogYWR2aWNlXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4dFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBpZFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiB0aW1lc3RhbXBcbiAgc3Vic2NyaWJlOiBmdW5jdGlvbihjaGFubmVsLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGlmIChjaGFubmVsIGluc3RhbmNlb2YgQXJyYXkpXG4gICAgICByZXR1cm4gRmF5ZS5tYXAoY2hhbm5lbCwgZnVuY3Rpb24oYykge1xuICAgICAgICByZXR1cm4gdGhpcy5zdWJzY3JpYmUoYywgY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgICAgfSwgdGhpcyk7XG5cbiAgICB2YXIgc3Vic2NyaXB0aW9uID0gbmV3IEZheWUuU3Vic2NyaXB0aW9uKHRoaXMsIGNoYW5uZWwsIGNhbGxiYWNrLCBjb250ZXh0KSxcbiAgICAgICAgZm9yY2UgICAgICAgID0gKGNhbGxiYWNrID09PSB0cnVlKSxcbiAgICAgICAgaGFzU3Vic2NyaWJlID0gdGhpcy5fY2hhbm5lbHMuaGFzU3Vic2NyaXB0aW9uKGNoYW5uZWwpO1xuXG4gICAgaWYgKGhhc1N1YnNjcmliZSAmJiAhZm9yY2UpIHtcbiAgICAgIHRoaXMuX2NoYW5uZWxzLnN1YnNjcmliZShbY2hhbm5lbF0sIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICAgIHN1YnNjcmlwdGlvbi5zZXREZWZlcnJlZFN0YXR1cygnc3VjY2VlZGVkJyk7XG4gICAgICByZXR1cm4gc3Vic2NyaXB0aW9uO1xuICAgIH1cblxuICAgIHRoaXMuY29ubmVjdChmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMuaW5mbygnQ2xpZW50ID8gYXR0ZW1wdGluZyB0byBzdWJzY3JpYmUgdG8gPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQsIGNoYW5uZWwpO1xuICAgICAgaWYgKCFmb3JjZSkgdGhpcy5fY2hhbm5lbHMuc3Vic2NyaWJlKFtjaGFubmVsXSwgY2FsbGJhY2ssIGNvbnRleHQpO1xuXG4gICAgICB0aGlzLl9zZW5kTWVzc2FnZSh7XG4gICAgICAgIGNoYW5uZWw6ICAgICAgRmF5ZS5DaGFubmVsLlNVQlNDUklCRSxcbiAgICAgICAgY2xpZW50SWQ6ICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLFxuICAgICAgICBzdWJzY3JpcHRpb246IGNoYW5uZWxcblxuICAgICAgfSwge30sIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2Uuc3VjY2Vzc2Z1bCkge1xuICAgICAgICAgIHN1YnNjcmlwdGlvbi5zZXREZWZlcnJlZFN0YXR1cygnZmFpbGVkJywgRmF5ZS5FcnJvci5wYXJzZShyZXNwb25zZS5lcnJvcikpO1xuICAgICAgICAgIHJldHVybiB0aGlzLl9jaGFubmVscy51bnN1YnNjcmliZShjaGFubmVsLCBjYWxsYmFjaywgY29udGV4dCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2hhbm5lbHMgPSBbXS5jb25jYXQocmVzcG9uc2Uuc3Vic2NyaXB0aW9uKTtcbiAgICAgICAgdGhpcy5pbmZvKCdTdWJzY3JpcHRpb24gYWNrbm93bGVkZ2VkIGZvciA/IHRvID8nLCB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBjaGFubmVscyk7XG4gICAgICAgIHN1YnNjcmlwdGlvbi5zZXREZWZlcnJlZFN0YXR1cygnc3VjY2VlZGVkJyk7XG4gICAgICB9LCB0aGlzKTtcbiAgICB9LCB0aGlzKTtcblxuICAgIHJldHVybiBzdWJzY3JpcHRpb247XG4gIH0sXG5cbiAgLy8gUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlc3BvbnNlXG4gIC8vIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbCAgICAgICAgICAgICBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWxcbiAgLy8gICAgICAgICAgICAgICAgKiBjbGllbnRJZCAgICAgICAgICAgICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bFxuICAvLyAgICAgICAgICAgICAgICAqIHN1YnNjcmlwdGlvbiAgICAgICAgICAgICAgICAgICAgICAgKiBjbGllbnRJZFxuICAvLyBNQVkgaW5jbHVkZTogICAqIGV4dCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBzdWJzY3JpcHRpb25cbiAgLy8gICAgICAgICAgICAgICAgKiBpZCAgICAgICAgICAgICAgICAgIE1BWSBpbmNsdWRlOiAgICogZXJyb3JcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogYWR2aWNlXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4dFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBpZFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiB0aW1lc3RhbXBcbiAgdW5zdWJzY3JpYmU6IGZ1bmN0aW9uKGNoYW5uZWwsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgaWYgKGNoYW5uZWwgaW5zdGFuY2VvZiBBcnJheSlcbiAgICAgIHJldHVybiBGYXllLm1hcChjaGFubmVsLCBmdW5jdGlvbihjKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnVuc3Vic2NyaWJlKGMsIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICAgIH0sIHRoaXMpO1xuXG4gICAgdmFyIGRlYWQgPSB0aGlzLl9jaGFubmVscy51bnN1YnNjcmliZShjaGFubmVsLCBjYWxsYmFjaywgY29udGV4dCk7XG4gICAgaWYgKCFkZWFkKSByZXR1cm47XG5cbiAgICB0aGlzLmNvbm5lY3QoZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLmluZm8oJ0NsaWVudCA/IGF0dGVtcHRpbmcgdG8gdW5zdWJzY3JpYmUgZnJvbSA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgY2hhbm5lbCk7XG5cbiAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKHtcbiAgICAgICAgY2hhbm5lbDogICAgICBGYXllLkNoYW5uZWwuVU5TVUJTQ1JJQkUsXG4gICAgICAgIGNsaWVudElkOiAgICAgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCxcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBjaGFubmVsXG5cbiAgICAgIH0sIHt9LCBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnN1Y2Nlc3NmdWwpIHJldHVybjtcblxuICAgICAgICB2YXIgY2hhbm5lbHMgPSBbXS5jb25jYXQocmVzcG9uc2Uuc3Vic2NyaXB0aW9uKTtcbiAgICAgICAgdGhpcy5pbmZvKCdVbnN1YnNjcmlwdGlvbiBhY2tub3dsZWRnZWQgZm9yID8gZnJvbSA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgY2hhbm5lbHMpO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgLy8gUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlc3BvbnNlXG4gIC8vIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbCAgICAgICAgICAgICBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWxcbiAgLy8gICAgICAgICAgICAgICAgKiBkYXRhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bFxuICAvLyBNQVkgaW5jbHVkZTogICAqIGNsaWVudElkICAgICAgICAgICAgTUFZIGluY2x1ZGU6ICAgKiBpZFxuICAvLyAgICAgICAgICAgICAgICAqIGlkICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBlcnJvclxuICAvLyAgICAgICAgICAgICAgICAqIGV4dCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBleHRcbiAgcHVibGlzaDogZnVuY3Rpb24oY2hhbm5lbCwgZGF0YSwgb3B0aW9ucykge1xuICAgIEZheWUudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMgfHwge30sIFsnYXR0ZW1wdHMnLCAnZGVhZGxpbmUnXSk7XG4gICAgdmFyIHB1YmxpY2F0aW9uID0gbmV3IEZheWUuUHVibGljYXRpb24oKTtcblxuICAgIHRoaXMuY29ubmVjdChmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMuaW5mbygnQ2xpZW50ID8gcXVldWVpbmcgcHVibGlzaGVkIG1lc3NhZ2UgdG8gPzogPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQsIGNoYW5uZWwsIGRhdGEpO1xuXG4gICAgICB0aGlzLl9zZW5kTWVzc2FnZSh7XG4gICAgICAgIGNoYW5uZWw6ICBjaGFubmVsLFxuICAgICAgICBkYXRhOiAgICAgZGF0YSxcbiAgICAgICAgY2xpZW50SWQ6IHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWRcblxuICAgICAgfSwgb3B0aW9ucywgZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKHJlc3BvbnNlLnN1Y2Nlc3NmdWwpXG4gICAgICAgICAgcHVibGljYXRpb24uc2V0RGVmZXJyZWRTdGF0dXMoJ3N1Y2NlZWRlZCcpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcHVibGljYXRpb24uc2V0RGVmZXJyZWRTdGF0dXMoJ2ZhaWxlZCcsIEZheWUuRXJyb3IucGFyc2UocmVzcG9uc2UuZXJyb3IpKTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH0sIHRoaXMpO1xuXG4gICAgcmV0dXJuIHB1YmxpY2F0aW9uO1xuICB9LFxuXG4gIF9zZW5kTWVzc2FnZTogZnVuY3Rpb24obWVzc2FnZSwgb3B0aW9ucywgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICBtZXNzYWdlLmlkID0gdGhpcy5fZ2VuZXJhdGVNZXNzYWdlSWQoKTtcblxuICAgIHZhciB0aW1lb3V0ID0gdGhpcy5fYWR2aWNlLnRpbWVvdXRcbiAgICAgICAgICAgICAgICA/IDEuMiAqIHRoaXMuX2FkdmljZS50aW1lb3V0IC8gMTAwMFxuICAgICAgICAgICAgICAgIDogMS4yICogdGhpcy5fZGlzcGF0Y2hlci5yZXRyeTtcblxuICAgIHRoaXMucGlwZVRocm91Z2hFeHRlbnNpb25zKCdvdXRnb2luZycsIG1lc3NhZ2UsIG51bGwsIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgIGlmICghbWVzc2FnZSkgcmV0dXJuO1xuICAgICAgaWYgKGNhbGxiYWNrKSB0aGlzLl9yZXNwb25zZUNhbGxiYWNrc1ttZXNzYWdlLmlkXSA9IFtjYWxsYmFjaywgY29udGV4dF07XG4gICAgICB0aGlzLl9kaXNwYXRjaGVyLnNlbmRNZXNzYWdlKG1lc3NhZ2UsIHRpbWVvdXQsIG9wdGlvbnMgfHwge30pO1xuICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIF9nZW5lcmF0ZU1lc3NhZ2VJZDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fbWVzc2FnZUlkICs9IDE7XG4gICAgaWYgKHRoaXMuX21lc3NhZ2VJZCA+PSBNYXRoLnBvdygyLDMyKSkgdGhpcy5fbWVzc2FnZUlkID0gMDtcbiAgICByZXR1cm4gdGhpcy5fbWVzc2FnZUlkLnRvU3RyaW5nKDM2KTtcbiAgfSxcblxuICBfcmVjZWl2ZU1lc3NhZ2U6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICB2YXIgaWQgPSBtZXNzYWdlLmlkLCBjYWxsYmFjaztcblxuICAgIGlmIChtZXNzYWdlLnN1Y2Nlc3NmdWwgIT09IHVuZGVmaW5lZCkge1xuICAgICAgY2FsbGJhY2sgPSB0aGlzLl9yZXNwb25zZUNhbGxiYWNrc1tpZF07XG4gICAgICBkZWxldGUgdGhpcy5fcmVzcG9uc2VDYWxsYmFja3NbaWRdO1xuICAgIH1cblxuICAgIHRoaXMucGlwZVRocm91Z2hFeHRlbnNpb25zKCdpbmNvbWluZycsIG1lc3NhZ2UsIG51bGwsIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgIGlmICghbWVzc2FnZSkgcmV0dXJuO1xuICAgICAgaWYgKG1lc3NhZ2UuYWR2aWNlKSB0aGlzLl9oYW5kbGVBZHZpY2UobWVzc2FnZS5hZHZpY2UpO1xuICAgICAgdGhpcy5fZGVsaXZlck1lc3NhZ2UobWVzc2FnZSk7XG4gICAgICBpZiAoY2FsbGJhY2spIGNhbGxiYWNrWzBdLmNhbGwoY2FsbGJhY2tbMV0sIG1lc3NhZ2UpO1xuICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIF9oYW5kbGVBZHZpY2U6IGZ1bmN0aW9uKGFkdmljZSkge1xuICAgIEZheWUuZXh0ZW5kKHRoaXMuX2FkdmljZSwgYWR2aWNlKTtcbiAgICB0aGlzLl9kaXNwYXRjaGVyLnRpbWVvdXQgPSB0aGlzLl9hZHZpY2UudGltZW91dCAvIDEwMDA7XG5cbiAgICBpZiAodGhpcy5fYWR2aWNlLnJlY29ubmVjdCA9PT0gdGhpcy5IQU5EU0hBS0UgJiYgdGhpcy5fc3RhdGUgIT09IHRoaXMuRElTQ09OTkVDVEVEKSB7XG4gICAgICB0aGlzLl9zdGF0ZSA9IHRoaXMuVU5DT05ORUNURUQ7XG4gICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkID0gbnVsbDtcbiAgICAgIHRoaXMuX2N5Y2xlQ29ubmVjdGlvbigpO1xuICAgIH1cbiAgfSxcblxuICBfZGVsaXZlck1lc3NhZ2U6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICBpZiAoIW1lc3NhZ2UuY2hhbm5lbCB8fCBtZXNzYWdlLmRhdGEgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICAgIHRoaXMuaW5mbygnQ2xpZW50ID8gY2FsbGluZyBsaXN0ZW5lcnMgZm9yID8gd2l0aCA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgbWVzc2FnZS5jaGFubmVsLCBtZXNzYWdlLmRhdGEpO1xuICAgIHRoaXMuX2NoYW5uZWxzLmRpc3RyaWJ1dGVNZXNzYWdlKG1lc3NhZ2UpO1xuICB9LFxuXG4gIF9jeWNsZUNvbm5lY3Rpb246IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLl9jb25uZWN0UmVxdWVzdCkge1xuICAgICAgdGhpcy5fY29ubmVjdFJlcXVlc3QgPSBudWxsO1xuICAgICAgdGhpcy5pbmZvKCdDbG9zZWQgY29ubmVjdGlvbiBmb3IgPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQpO1xuICAgIH1cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgRmF5ZS5FTlYuc2V0VGltZW91dChmdW5jdGlvbigpIHsgc2VsZi5jb25uZWN0KCkgfSwgdGhpcy5fYWR2aWNlLmludGVydmFsKTtcbiAgfVxufSk7XG5cbkZheWUuZXh0ZW5kKEZheWUuQ2xpZW50LnByb3RvdHlwZSwgRmF5ZS5EZWZlcnJhYmxlKTtcbkZheWUuZXh0ZW5kKEZheWUuQ2xpZW50LnByb3RvdHlwZSwgRmF5ZS5QdWJsaXNoZXIpO1xuRmF5ZS5leHRlbmQoRmF5ZS5DbGllbnQucHJvdG90eXBlLCBGYXllLkxvZ2dpbmcpO1xuRmF5ZS5leHRlbmQoRmF5ZS5DbGllbnQucHJvdG90eXBlLCBGYXllLkV4dGVuc2libGUpO1xuXG5GYXllLkRpc3BhdGNoZXIgPSBGYXllLkNsYXNzKHtcbiAgTUFYX1JFUVVFU1RfU0laRTogMjA0OCxcbiAgREVGQVVMVF9SRVRSWTogICAgNSxcblxuICBVUDogICAxLFxuICBET1dOOiAyLFxuXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKGNsaWVudCwgZW5kcG9pbnQsIG9wdGlvbnMpIHtcbiAgICB0aGlzLl9jbGllbnQgICAgID0gY2xpZW50O1xuICAgIHRoaXMuZW5kcG9pbnQgICAgPSBGYXllLlVSSS5wYXJzZShlbmRwb2ludCk7XG4gICAgdGhpcy5fYWx0ZXJuYXRlcyA9IG9wdGlvbnMuZW5kcG9pbnRzIHx8IHt9O1xuXG4gICAgdGhpcy5jb29raWVzICAgICAgPSBGYXllLkNvb2tpZXMgJiYgbmV3IEZheWUuQ29va2llcy5Db29raWVKYXIoKTtcbiAgICB0aGlzLl9kaXNhYmxlZCAgICA9IFtdO1xuICAgIHRoaXMuX2VudmVsb3BlcyAgID0ge307XG4gICAgdGhpcy5oZWFkZXJzICAgICAgPSB7fTtcbiAgICB0aGlzLnJldHJ5ICAgICAgICA9IG9wdGlvbnMucmV0cnkgfHwgdGhpcy5ERUZBVUxUX1JFVFJZO1xuICAgIHRoaXMuX3NjaGVkdWxlciAgID0gb3B0aW9ucy5zY2hlZHVsZXIgfHwgRmF5ZS5TY2hlZHVsZXI7XG4gICAgdGhpcy5fc3RhdGUgICAgICAgPSAwO1xuICAgIHRoaXMudHJhbnNwb3J0cyAgID0ge307XG4gICAgdGhpcy53c0V4dGVuc2lvbnMgPSBbXTtcblxuICAgIHRoaXMucHJveHkgPSBvcHRpb25zLnByb3h5IHx8IHt9O1xuICAgIGlmICh0eXBlb2YgdGhpcy5fcHJveHkgPT09ICdzdHJpbmcnKSB0aGlzLl9wcm94eSA9IHtvcmlnaW46IHRoaXMuX3Byb3h5fTtcblxuICAgIHZhciBleHRzID0gb3B0aW9ucy53ZWJzb2NrZXRFeHRlbnNpb25zO1xuICAgIGlmIChleHRzKSB7XG4gICAgICBleHRzID0gW10uY29uY2F0KGV4dHMpO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBleHRzLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgICAgdGhpcy5hZGRXZWJzb2NrZXRFeHRlbnNpb24oZXh0c1tpXSk7XG4gICAgfVxuXG4gICAgdGhpcy50bHMgPSBvcHRpb25zLnRscyB8fCB7fTtcbiAgICB0aGlzLnRscy5jYSA9IHRoaXMudGxzLmNhIHx8IG9wdGlvbnMuY2E7XG5cbiAgICBmb3IgKHZhciB0eXBlIGluIHRoaXMuX2FsdGVybmF0ZXMpXG4gICAgICB0aGlzLl9hbHRlcm5hdGVzW3R5cGVdID0gRmF5ZS5VUkkucGFyc2UodGhpcy5fYWx0ZXJuYXRlc1t0eXBlXSk7XG5cbiAgICB0aGlzLm1heFJlcXVlc3RTaXplID0gdGhpcy5NQVhfUkVRVUVTVF9TSVpFO1xuICB9LFxuXG4gIGVuZHBvaW50Rm9yOiBmdW5jdGlvbihjb25uZWN0aW9uVHlwZSkge1xuICAgIHJldHVybiB0aGlzLl9hbHRlcm5hdGVzW2Nvbm5lY3Rpb25UeXBlXSB8fCB0aGlzLmVuZHBvaW50O1xuICB9LFxuXG4gIGFkZFdlYnNvY2tldEV4dGVuc2lvbjogZnVuY3Rpb24oZXh0ZW5zaW9uKSB7XG4gICAgdGhpcy53c0V4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuICB9LFxuXG4gIGRpc2FibGU6IGZ1bmN0aW9uKGZlYXR1cmUpIHtcbiAgICB0aGlzLl9kaXNhYmxlZC5wdXNoKGZlYXR1cmUpO1xuICB9LFxuXG4gIHNldEhlYWRlcjogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcbiAgICB0aGlzLmhlYWRlcnNbbmFtZV0gPSB2YWx1ZTtcbiAgfSxcblxuICBjbG9zZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRyYW5zcG9ydCA9IHRoaXMuX3RyYW5zcG9ydDtcbiAgICBkZWxldGUgdGhpcy5fdHJhbnNwb3J0O1xuICAgIGlmICh0cmFuc3BvcnQpIHRyYW5zcG9ydC5jbG9zZSgpO1xuICB9LFxuXG4gIGdldENvbm5lY3Rpb25UeXBlczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIEZheWUuVHJhbnNwb3J0LmdldENvbm5lY3Rpb25UeXBlcygpO1xuICB9LFxuXG4gIHNlbGVjdFRyYW5zcG9ydDogZnVuY3Rpb24odHJhbnNwb3J0VHlwZXMpIHtcbiAgICBGYXllLlRyYW5zcG9ydC5nZXQodGhpcywgdHJhbnNwb3J0VHlwZXMsIHRoaXMuX2Rpc2FibGVkLCBmdW5jdGlvbih0cmFuc3BvcnQpIHtcbiAgICAgIHRoaXMuZGVidWcoJ1NlbGVjdGVkID8gdHJhbnNwb3J0IGZvciA/JywgdHJhbnNwb3J0LmNvbm5lY3Rpb25UeXBlLCBGYXllLlVSSS5zdHJpbmdpZnkodHJhbnNwb3J0LmVuZHBvaW50KSk7XG5cbiAgICAgIGlmICh0cmFuc3BvcnQgPT09IHRoaXMuX3RyYW5zcG9ydCkgcmV0dXJuO1xuICAgICAgaWYgKHRoaXMuX3RyYW5zcG9ydCkgdGhpcy5fdHJhbnNwb3J0LmNsb3NlKCk7XG5cbiAgICAgIHRoaXMuX3RyYW5zcG9ydCA9IHRyYW5zcG9ydDtcbiAgICAgIHRoaXMuY29ubmVjdGlvblR5cGUgPSB0cmFuc3BvcnQuY29ubmVjdGlvblR5cGU7XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgc2VuZE1lc3NhZ2U6IGZ1bmN0aW9uKG1lc3NhZ2UsIHRpbWVvdXQsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIHZhciBpZCAgICAgICA9IG1lc3NhZ2UuaWQsXG4gICAgICAgIGF0dGVtcHRzID0gb3B0aW9ucy5hdHRlbXB0cyxcbiAgICAgICAgZGVhZGxpbmUgPSBvcHRpb25zLmRlYWRsaW5lICYmIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgKG9wdGlvbnMuZGVhZGxpbmUgKiAxMDAwKSxcbiAgICAgICAgZW52ZWxvcGUgPSB0aGlzLl9lbnZlbG9wZXNbaWRdLFxuICAgICAgICBzY2hlZHVsZXI7XG5cbiAgICBpZiAoIWVudmVsb3BlKSB7XG4gICAgICBzY2hlZHVsZXIgPSBuZXcgdGhpcy5fc2NoZWR1bGVyKG1lc3NhZ2UsIHt0aW1lb3V0OiB0aW1lb3V0LCBpbnRlcnZhbDogdGhpcy5yZXRyeSwgYXR0ZW1wdHM6IGF0dGVtcHRzLCBkZWFkbGluZTogZGVhZGxpbmV9KTtcbiAgICAgIGVudmVsb3BlICA9IHRoaXMuX2VudmVsb3Blc1tpZF0gPSB7bWVzc2FnZTogbWVzc2FnZSwgc2NoZWR1bGVyOiBzY2hlZHVsZXJ9O1xuICAgIH1cblxuICAgIHRoaXMuX3NlbmRFbnZlbG9wZShlbnZlbG9wZSk7XG4gIH0sXG5cbiAgX3NlbmRFbnZlbG9wZTogZnVuY3Rpb24oZW52ZWxvcGUpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zcG9ydCkgcmV0dXJuO1xuICAgIGlmIChlbnZlbG9wZS5yZXF1ZXN0IHx8IGVudmVsb3BlLnRpbWVyKSByZXR1cm47XG5cbiAgICB2YXIgbWVzc2FnZSAgID0gZW52ZWxvcGUubWVzc2FnZSxcbiAgICAgICAgc2NoZWR1bGVyID0gZW52ZWxvcGUuc2NoZWR1bGVyLFxuICAgICAgICBzZWxmICAgICAgPSB0aGlzO1xuXG4gICAgaWYgKCFzY2hlZHVsZXIuaXNEZWxpdmVyYWJsZSgpKSB7XG4gICAgICBzY2hlZHVsZXIuYWJvcnQoKTtcbiAgICAgIGRlbGV0ZSB0aGlzLl9lbnZlbG9wZXNbbWVzc2FnZS5pZF07XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZW52ZWxvcGUudGltZXIgPSBGYXllLkVOVi5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgc2VsZi5oYW5kbGVFcnJvcihtZXNzYWdlKTtcbiAgICB9LCBzY2hlZHVsZXIuZ2V0VGltZW91dCgpICogMTAwMCk7XG5cbiAgICBzY2hlZHVsZXIuc2VuZCgpO1xuICAgIGVudmVsb3BlLnJlcXVlc3QgPSB0aGlzLl90cmFuc3BvcnQuc2VuZE1lc3NhZ2UobWVzc2FnZSk7XG4gIH0sXG5cbiAgaGFuZGxlUmVzcG9uc2U6IGZ1bmN0aW9uKHJlcGx5KSB7XG4gICAgdmFyIGVudmVsb3BlID0gdGhpcy5fZW52ZWxvcGVzW3JlcGx5LmlkXTtcblxuICAgIGlmIChyZXBseS5zdWNjZXNzZnVsICE9PSB1bmRlZmluZWQgJiYgZW52ZWxvcGUpIHtcbiAgICAgIGVudmVsb3BlLnNjaGVkdWxlci5zdWNjZWVkKCk7XG4gICAgICBkZWxldGUgdGhpcy5fZW52ZWxvcGVzW3JlcGx5LmlkXTtcbiAgICAgIEZheWUuRU5WLmNsZWFyVGltZW91dChlbnZlbG9wZS50aW1lcik7XG4gICAgfVxuXG4gICAgdGhpcy50cmlnZ2VyKCdtZXNzYWdlJywgcmVwbHkpO1xuXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSB0aGlzLlVQKSByZXR1cm47XG4gICAgdGhpcy5fc3RhdGUgPSB0aGlzLlVQO1xuICAgIHRoaXMuX2NsaWVudC50cmlnZ2VyKCd0cmFuc3BvcnQ6dXAnKTtcbiAgfSxcblxuICBoYW5kbGVFcnJvcjogZnVuY3Rpb24obWVzc2FnZSwgaW1tZWRpYXRlKSB7XG4gICAgdmFyIGVudmVsb3BlID0gdGhpcy5fZW52ZWxvcGVzW21lc3NhZ2UuaWRdLFxuICAgICAgICByZXF1ZXN0ICA9IGVudmVsb3BlICYmIGVudmVsb3BlLnJlcXVlc3QsXG4gICAgICAgIHNlbGYgICAgID0gdGhpcztcblxuICAgIGlmICghcmVxdWVzdCkgcmV0dXJuO1xuXG4gICAgcmVxdWVzdC50aGVuKGZ1bmN0aW9uKHJlcSkge1xuICAgICAgaWYgKHJlcSAmJiByZXEuYWJvcnQpIHJlcS5hYm9ydCgpO1xuICAgIH0pO1xuXG4gICAgdmFyIHNjaGVkdWxlciA9IGVudmVsb3BlLnNjaGVkdWxlcjtcbiAgICBzY2hlZHVsZXIuZmFpbCgpO1xuXG4gICAgRmF5ZS5FTlYuY2xlYXJUaW1lb3V0KGVudmVsb3BlLnRpbWVyKTtcbiAgICBlbnZlbG9wZS5yZXF1ZXN0ID0gZW52ZWxvcGUudGltZXIgPSBudWxsO1xuXG4gICAgaWYgKGltbWVkaWF0ZSkge1xuICAgICAgdGhpcy5fc2VuZEVudmVsb3BlKGVudmVsb3BlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW52ZWxvcGUudGltZXIgPSBGYXllLkVOVi5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBlbnZlbG9wZS50aW1lciA9IG51bGw7XG4gICAgICAgIHNlbGYuX3NlbmRFbnZlbG9wZShlbnZlbG9wZSk7XG4gICAgICB9LCBzY2hlZHVsZXIuZ2V0SW50ZXJ2YWwoKSAqIDEwMDApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9zdGF0ZSA9PT0gdGhpcy5ET1dOKSByZXR1cm47XG4gICAgdGhpcy5fc3RhdGUgPSB0aGlzLkRPV047XG4gICAgdGhpcy5fY2xpZW50LnRyaWdnZXIoJ3RyYW5zcG9ydDpkb3duJyk7XG4gIH1cbn0pO1xuXG5GYXllLmV4dGVuZChGYXllLkRpc3BhdGNoZXIucHJvdG90eXBlLCBGYXllLlB1Ymxpc2hlcik7XG5GYXllLmV4dGVuZChGYXllLkRpc3BhdGNoZXIucHJvdG90eXBlLCBGYXllLkxvZ2dpbmcpO1xuXG5GYXllLlNjaGVkdWxlciA9IGZ1bmN0aW9uKG1lc3NhZ2UsIG9wdGlvbnMpIHtcbiAgdGhpcy5tZXNzYWdlICA9IG1lc3NhZ2U7XG4gIHRoaXMub3B0aW9ucyAgPSBvcHRpb25zO1xuICB0aGlzLmF0dGVtcHRzID0gMDtcbn07XG5cbkZheWUuZXh0ZW5kKEZheWUuU2NoZWR1bGVyLnByb3RvdHlwZSwge1xuICBnZXRUaW1lb3V0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5vcHRpb25zLnRpbWVvdXQ7XG4gIH0sXG5cbiAgZ2V0SW50ZXJ2YWw6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLm9wdGlvbnMuaW50ZXJ2YWw7XG4gIH0sXG5cbiAgaXNEZWxpdmVyYWJsZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGF0dGVtcHRzID0gdGhpcy5vcHRpb25zLmF0dGVtcHRzLFxuICAgICAgICBtYWRlICAgICA9IHRoaXMuYXR0ZW1wdHMsXG4gICAgICAgIGRlYWRsaW5lID0gdGhpcy5vcHRpb25zLmRlYWRsaW5lLFxuICAgICAgICBub3cgICAgICA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgaWYgKGF0dGVtcHRzICE9PSB1bmRlZmluZWQgJiYgbWFkZSA+PSBhdHRlbXB0cylcbiAgICAgIHJldHVybiBmYWxzZTtcblxuICAgIGlmIChkZWFkbGluZSAhPT0gdW5kZWZpbmVkICYmIG5vdyA+IGRlYWRsaW5lKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgc2VuZDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5hdHRlbXB0cyArPSAxO1xuICB9LFxuXG4gIHN1Y2NlZWQ6IGZ1bmN0aW9uKCkge30sXG5cbiAgZmFpbDogZnVuY3Rpb24oKSB7fSxcblxuICBhYm9ydDogZnVuY3Rpb24oKSB7fVxufSk7XG5cbkZheWUuVHJhbnNwb3J0ID0gRmF5ZS5leHRlbmQoRmF5ZS5DbGFzcyh7XG4gIERFRkFVTFRfUE9SVFM6ICAgIHsnaHR0cDonOiA4MCwgJ2h0dHBzOic6IDQ0MywgJ3dzOic6IDgwLCAnd3NzOic6IDQ0M30sXG4gIFNFQ1VSRV9QUk9UT0NPTFM6IFsnaHR0cHM6JywgJ3dzczonXSxcbiAgTUFYX0RFTEFZOiAgICAgICAgMCxcblxuICBiYXRjaGluZzogIHRydWUsXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQpIHtcbiAgICB0aGlzLl9kaXNwYXRjaGVyID0gZGlzcGF0Y2hlcjtcbiAgICB0aGlzLmVuZHBvaW50ICAgID0gZW5kcG9pbnQ7XG4gICAgdGhpcy5fb3V0Ym94ICAgICA9IFtdO1xuICAgIHRoaXMuX3Byb3h5ICAgICAgPSBGYXllLmV4dGVuZCh7fSwgdGhpcy5fZGlzcGF0Y2hlci5wcm94eSk7XG5cbiAgICBpZiAoIXRoaXMuX3Byb3h5Lm9yaWdpbiAmJiBGYXllLk5vZGVBZGFwdGVyKSB7XG4gICAgICB0aGlzLl9wcm94eS5vcmlnaW4gPSBGYXllLmluZGV4T2YodGhpcy5TRUNVUkVfUFJPVE9DT0xTLCB0aGlzLmVuZHBvaW50LnByb3RvY29sKSA+PSAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgPyAocHJvY2Vzcy5lbnYuSFRUUFNfUFJPWFkgfHwgcHJvY2Vzcy5lbnYuaHR0cHNfcHJveHkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgOiAocHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSAgfHwgcHJvY2Vzcy5lbnYuaHR0cF9wcm94eSk7XG4gICAgfVxuICB9LFxuXG4gIGNsb3NlOiBmdW5jdGlvbigpIHt9LFxuXG4gIGVuY29kZTogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICByZXR1cm4gJyc7XG4gIH0sXG5cbiAgc2VuZE1lc3NhZ2U6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICB0aGlzLmRlYnVnKCdDbGllbnQgPyBzZW5kaW5nIG1lc3NhZ2UgdG8gPzogPycsXG4gICAgICAgICAgICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBGYXllLlVSSS5zdHJpbmdpZnkodGhpcy5lbmRwb2ludCksIG1lc3NhZ2UpO1xuXG4gICAgaWYgKCF0aGlzLmJhdGNoaW5nKSByZXR1cm4gRmF5ZS5Qcm9taXNlLmZ1bGZpbGxlZCh0aGlzLnJlcXVlc3QoW21lc3NhZ2VdKSk7XG5cbiAgICB0aGlzLl9vdXRib3gucHVzaChtZXNzYWdlKTtcbiAgICB0aGlzLl9wcm9taXNlID0gdGhpcy5fcHJvbWlzZSB8fCBuZXcgRmF5ZS5Qcm9taXNlKCk7XG4gICAgdGhpcy5fZmx1c2hMYXJnZUJhdGNoKCk7XG5cbiAgICBpZiAobWVzc2FnZS5jaGFubmVsID09PSBGYXllLkNoYW5uZWwuSEFORFNIQUtFKSB7XG4gICAgICB0aGlzLmFkZFRpbWVvdXQoJ3B1Ymxpc2gnLCAwLjAxLCB0aGlzLl9mbHVzaCwgdGhpcyk7XG4gICAgICByZXR1cm4gdGhpcy5fcHJvbWlzZTtcbiAgICB9XG5cbiAgICBpZiAobWVzc2FnZS5jaGFubmVsID09PSBGYXllLkNoYW5uZWwuQ09OTkVDVClcbiAgICAgIHRoaXMuX2Nvbm5lY3RNZXNzYWdlID0gbWVzc2FnZTtcblxuICAgIHRoaXMuYWRkVGltZW91dCgncHVibGlzaCcsIHRoaXMuTUFYX0RFTEFZLCB0aGlzLl9mbHVzaCwgdGhpcyk7XG4gICAgcmV0dXJuIHRoaXMuX3Byb21pc2U7XG4gIH0sXG5cbiAgX2ZsdXNoOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlbW92ZVRpbWVvdXQoJ3B1Ymxpc2gnKTtcblxuICAgIGlmICh0aGlzLl9vdXRib3gubGVuZ3RoID4gMSAmJiB0aGlzLl9jb25uZWN0TWVzc2FnZSlcbiAgICAgIHRoaXMuX2Nvbm5lY3RNZXNzYWdlLmFkdmljZSA9IHt0aW1lb3V0OiAwfTtcblxuICAgIEZheWUuUHJvbWlzZS5mdWxmaWxsKHRoaXMuX3Byb21pc2UsIHRoaXMucmVxdWVzdCh0aGlzLl9vdXRib3gpKTtcbiAgICBkZWxldGUgdGhpcy5fcHJvbWlzZTtcblxuICAgIHRoaXMuX2Nvbm5lY3RNZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLl9vdXRib3ggPSBbXTtcbiAgfSxcblxuICBfZmx1c2hMYXJnZUJhdGNoOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc3RyaW5nID0gdGhpcy5lbmNvZGUodGhpcy5fb3V0Ym94KTtcbiAgICBpZiAoc3RyaW5nLmxlbmd0aCA8IHRoaXMuX2Rpc3BhdGNoZXIubWF4UmVxdWVzdFNpemUpIHJldHVybjtcbiAgICB2YXIgbGFzdCA9IHRoaXMuX291dGJveC5wb3AoKTtcbiAgICB0aGlzLl9mbHVzaCgpO1xuICAgIGlmIChsYXN0KSB0aGlzLl9vdXRib3gucHVzaChsYXN0KTtcbiAgfSxcblxuICBfcmVjZWl2ZTogZnVuY3Rpb24ocmVwbGllcykge1xuICAgIGlmICghcmVwbGllcykgcmV0dXJuO1xuICAgIHJlcGxpZXMgPSBbXS5jb25jYXQocmVwbGllcyk7XG5cbiAgICB0aGlzLmRlYnVnKCdDbGllbnQgPyByZWNlaXZlZCBmcm9tID8gdmlhID86ID8nLFxuICAgICAgICAgICAgICAgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgRmF5ZS5VUkkuc3RyaW5naWZ5KHRoaXMuZW5kcG9pbnQpLCB0aGlzLmNvbm5lY3Rpb25UeXBlLCByZXBsaWVzKTtcblxuICAgIGZvciAodmFyIGkgPSAwLCBuID0gcmVwbGllcy5sZW5ndGg7IGkgPCBuOyBpKyspXG4gICAgICB0aGlzLl9kaXNwYXRjaGVyLmhhbmRsZVJlc3BvbnNlKHJlcGxpZXNbaV0pO1xuICB9LFxuXG4gIF9oYW5kbGVFcnJvcjogZnVuY3Rpb24obWVzc2FnZXMsIGltbWVkaWF0ZSkge1xuICAgIG1lc3NhZ2VzID0gW10uY29uY2F0KG1lc3NhZ2VzKTtcblxuICAgIHRoaXMuZGVidWcoJ0NsaWVudCA/IGZhaWxlZCB0byBzZW5kIHRvID8gdmlhID86ID8nLFxuICAgICAgICAgICAgICAgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgRmF5ZS5VUkkuc3RyaW5naWZ5KHRoaXMuZW5kcG9pbnQpLCB0aGlzLmNvbm5lY3Rpb25UeXBlLCBtZXNzYWdlcyk7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IG1lc3NhZ2VzLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuaGFuZGxlRXJyb3IobWVzc2FnZXNbaV0pO1xuICB9LFxuXG4gIF9nZXRDb29raWVzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgY29va2llcyA9IHRoaXMuX2Rpc3BhdGNoZXIuY29va2llcyxcbiAgICAgICAgdXJsICAgICA9IEZheWUuVVJJLnN0cmluZ2lmeSh0aGlzLmVuZHBvaW50KTtcblxuICAgIGlmICghY29va2llcykgcmV0dXJuICcnO1xuXG4gICAgcmV0dXJuIEZheWUubWFwKGNvb2tpZXMuZ2V0Q29va2llc1N5bmModXJsKSwgZnVuY3Rpb24oY29va2llKSB7XG4gICAgICByZXR1cm4gY29va2llLmNvb2tpZVN0cmluZygpO1xuICAgIH0pLmpvaW4oJzsgJyk7XG4gIH0sXG5cbiAgX3N0b3JlQ29va2llczogZnVuY3Rpb24oc2V0Q29va2llKSB7XG4gICAgdmFyIGNvb2tpZXMgPSB0aGlzLl9kaXNwYXRjaGVyLmNvb2tpZXMsXG4gICAgICAgIHVybCAgICAgPSBGYXllLlVSSS5zdHJpbmdpZnkodGhpcy5lbmRwb2ludCksXG4gICAgICAgIGNvb2tpZTtcblxuICAgIGlmICghc2V0Q29va2llIHx8ICFjb29raWVzKSByZXR1cm47XG4gICAgc2V0Q29va2llID0gW10uY29uY2F0KHNldENvb2tpZSk7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IHNldENvb2tpZS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgIGNvb2tpZSA9IEZheWUuQ29va2llcy5Db29raWUucGFyc2Uoc2V0Q29va2llW2ldKTtcbiAgICAgIGNvb2tpZXMuc2V0Q29va2llU3luYyhjb29raWUsIHVybCk7XG4gICAgfVxuICB9XG5cbn0pLCB7XG4gIGdldDogZnVuY3Rpb24oZGlzcGF0Y2hlciwgYWxsb3dlZCwgZGlzYWJsZWQsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdmFyIGVuZHBvaW50ID0gZGlzcGF0Y2hlci5lbmRwb2ludDtcblxuICAgIEZheWUuYXN5bmNFYWNoKHRoaXMuX3RyYW5zcG9ydHMsIGZ1bmN0aW9uKHBhaXIsIHJlc3VtZSkge1xuICAgICAgdmFyIGNvbm5UeXBlICAgICA9IHBhaXJbMF0sIGtsYXNzID0gcGFpclsxXSxcbiAgICAgICAgICBjb25uRW5kcG9pbnQgPSBkaXNwYXRjaGVyLmVuZHBvaW50Rm9yKGNvbm5UeXBlKTtcblxuICAgICAgaWYgKEZheWUuaW5kZXhPZihkaXNhYmxlZCwgY29ublR5cGUpID49IDApXG4gICAgICAgIHJldHVybiByZXN1bWUoKTtcblxuICAgICAgaWYgKEZheWUuaW5kZXhPZihhbGxvd2VkLCBjb25uVHlwZSkgPCAwKSB7XG4gICAgICAgIGtsYXNzLmlzVXNhYmxlKGRpc3BhdGNoZXIsIGNvbm5FbmRwb2ludCwgZnVuY3Rpb24oKSB7fSk7XG4gICAgICAgIHJldHVybiByZXN1bWUoKTtcbiAgICAgIH1cblxuICAgICAga2xhc3MuaXNVc2FibGUoZGlzcGF0Y2hlciwgY29ubkVuZHBvaW50LCBmdW5jdGlvbihpc1VzYWJsZSkge1xuICAgICAgICBpZiAoIWlzVXNhYmxlKSByZXR1cm4gcmVzdW1lKCk7XG4gICAgICAgIHZhciB0cmFuc3BvcnQgPSBrbGFzcy5oYXNPd25Qcm9wZXJ0eSgnY3JlYXRlJykgPyBrbGFzcy5jcmVhdGUoZGlzcGF0Y2hlciwgY29ubkVuZHBvaW50KSA6IG5ldyBrbGFzcyhkaXNwYXRjaGVyLCBjb25uRW5kcG9pbnQpO1xuICAgICAgICBjYWxsYmFjay5jYWxsKGNvbnRleHQsIHRyYW5zcG9ydCk7XG4gICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbigpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgYSB1c2FibGUgY29ubmVjdGlvbiB0eXBlIGZvciAnICsgRmF5ZS5VUkkuc3RyaW5naWZ5KGVuZHBvaW50KSk7XG4gICAgfSk7XG4gIH0sXG5cbiAgcmVnaXN0ZXI6IGZ1bmN0aW9uKHR5cGUsIGtsYXNzKSB7XG4gICAgdGhpcy5fdHJhbnNwb3J0cy5wdXNoKFt0eXBlLCBrbGFzc10pO1xuICAgIGtsYXNzLnByb3RvdHlwZS5jb25uZWN0aW9uVHlwZSA9IHR5cGU7XG4gIH0sXG5cbiAgZ2V0Q29ubmVjdGlvblR5cGVzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gRmF5ZS5tYXAodGhpcy5fdHJhbnNwb3J0cywgZnVuY3Rpb24odCkgeyByZXR1cm4gdFswXSB9KTtcbiAgfSxcblxuICBfdHJhbnNwb3J0czogW11cbn0pO1xuXG5GYXllLmV4dGVuZChGYXllLlRyYW5zcG9ydC5wcm90b3R5cGUsIEZheWUuTG9nZ2luZyk7XG5GYXllLmV4dGVuZChGYXllLlRyYW5zcG9ydC5wcm90b3R5cGUsIEZheWUuVGltZW91dHMpO1xuXG5GYXllLkV2ZW50ID0ge1xuICBfcmVnaXN0cnk6IFtdLFxuXG4gIG9uOiBmdW5jdGlvbihlbGVtZW50LCBldmVudE5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdmFyIHdyYXBwZWQgPSBmdW5jdGlvbigpIHsgY2FsbGJhY2suY2FsbChjb250ZXh0KSB9O1xuXG4gICAgaWYgKGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcilcbiAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHdyYXBwZWQsIGZhbHNlKTtcbiAgICBlbHNlXG4gICAgICBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyBldmVudE5hbWUsIHdyYXBwZWQpO1xuXG4gICAgdGhpcy5fcmVnaXN0cnkucHVzaCh7XG4gICAgICBfZWxlbWVudDogICBlbGVtZW50LFxuICAgICAgX3R5cGU6ICAgICAgZXZlbnROYW1lLFxuICAgICAgX2NhbGxiYWNrOiAgY2FsbGJhY2ssXG4gICAgICBfY29udGV4dDogICAgIGNvbnRleHQsXG4gICAgICBfaGFuZGxlcjogICB3cmFwcGVkXG4gICAgfSk7XG4gIH0sXG5cbiAgZGV0YWNoOiBmdW5jdGlvbihlbGVtZW50LCBldmVudE5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdmFyIGkgPSB0aGlzLl9yZWdpc3RyeS5sZW5ndGgsIHJlZ2lzdGVyO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIHJlZ2lzdGVyID0gdGhpcy5fcmVnaXN0cnlbaV07XG5cbiAgICAgIGlmICgoZWxlbWVudCAgICAmJiBlbGVtZW50ICAgICE9PSByZWdpc3Rlci5fZWxlbWVudCkgICB8fFxuICAgICAgICAgIChldmVudE5hbWUgICYmIGV2ZW50TmFtZSAgIT09IHJlZ2lzdGVyLl90eXBlKSAgICAgIHx8XG4gICAgICAgICAgKGNhbGxiYWNrICAgJiYgY2FsbGJhY2sgICAhPT0gcmVnaXN0ZXIuX2NhbGxiYWNrKSAgfHxcbiAgICAgICAgICAoY29udGV4dCAgICAgICYmIGNvbnRleHQgICAgICAhPT0gcmVnaXN0ZXIuX2NvbnRleHQpKVxuICAgICAgICBjb250aW51ZTtcblxuICAgICAgaWYgKHJlZ2lzdGVyLl9lbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIpXG4gICAgICAgIHJlZ2lzdGVyLl9lbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIocmVnaXN0ZXIuX3R5cGUsIHJlZ2lzdGVyLl9oYW5kbGVyLCBmYWxzZSk7XG4gICAgICBlbHNlXG4gICAgICAgIHJlZ2lzdGVyLl9lbGVtZW50LmRldGFjaEV2ZW50KCdvbicgKyByZWdpc3Rlci5fdHlwZSwgcmVnaXN0ZXIuX2hhbmRsZXIpO1xuXG4gICAgICB0aGlzLl9yZWdpc3RyeS5zcGxpY2UoaSwxKTtcbiAgICAgIHJlZ2lzdGVyID0gbnVsbDtcbiAgICB9XG4gIH1cbn07XG5cbmlmIChGYXllLkVOVi5vbnVubG9hZCAhPT0gdW5kZWZpbmVkKSBGYXllLkV2ZW50Lm9uKEZheWUuRU5WLCAndW5sb2FkJywgRmF5ZS5FdmVudC5kZXRhY2gsIEZheWUuRXZlbnQpO1xuXG4vKlxuICAgIGpzb24yLmpzXG4gICAgMjAxMy0wNS0yNlxuXG4gICAgUHVibGljIERvbWFpbi5cblxuICAgIE5PIFdBUlJBTlRZIEVYUFJFU1NFRCBPUiBJTVBMSUVELiBVU0UgQVQgWU9VUiBPV04gUklTSy5cblxuICAgIFNlZSBodHRwOi8vd3d3LkpTT04ub3JnL2pzLmh0bWxcblxuXG4gICAgVGhpcyBjb2RlIHNob3VsZCBiZSBtaW5pZmllZCBiZWZvcmUgZGVwbG95bWVudC5cbiAgICBTZWUgaHR0cDovL2phdmFzY3JpcHQuY3JvY2tmb3JkLmNvbS9qc21pbi5odG1sXG5cbiAgICBVU0UgWU9VUiBPV04gQ09QWS4gSVQgSVMgRVhUUkVNRUxZIFVOV0lTRSBUTyBMT0FEIENPREUgRlJPTSBTRVJWRVJTIFlPVSBET1xuICAgIE5PVCBDT05UUk9MLlxuXG5cbiAgICBUaGlzIGZpbGUgY3JlYXRlcyBhIGdsb2JhbCBKU09OIG9iamVjdCBjb250YWluaW5nIHR3byBtZXRob2RzOiBzdHJpbmdpZnlcbiAgICBhbmQgcGFyc2UuXG5cbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodmFsdWUsIHJlcGxhY2VyLCBzcGFjZSlcbiAgICAgICAgICAgIHZhbHVlICAgICAgIGFueSBKYXZhU2NyaXB0IHZhbHVlLCB1c3VhbGx5IGFuIG9iamVjdCBvciBhcnJheS5cblxuICAgICAgICAgICAgcmVwbGFjZXIgICAgYW4gb3B0aW9uYWwgcGFyYW1ldGVyIHRoYXQgZGV0ZXJtaW5lcyBob3cgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZXMgYXJlIHN0cmluZ2lmaWVkIGZvciBvYmplY3RzLiBJdCBjYW4gYmUgYVxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncy5cblxuICAgICAgICAgICAgc3BhY2UgICAgICAgYW4gb3B0aW9uYWwgcGFyYW1ldGVyIHRoYXQgc3BlY2lmaWVzIHRoZSBpbmRlbnRhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgb2YgbmVzdGVkIHN0cnVjdHVyZXMuIElmIGl0IGlzIG9taXR0ZWQsIHRoZSB0ZXh0IHdpbGxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJlIHBhY2tlZCB3aXRob3V0IGV4dHJhIHdoaXRlc3BhY2UuIElmIGl0IGlzIGEgbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXQgd2lsbCBzcGVjaWZ5IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRvIGluZGVudCBhdCBlYWNoXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXZlbC4gSWYgaXQgaXMgYSBzdHJpbmcgKHN1Y2ggYXMgJ1xcdCcgb3IgJyZuYnNwOycpLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXQgY29udGFpbnMgdGhlIGNoYXJhY3RlcnMgdXNlZCB0byBpbmRlbnQgYXQgZWFjaCBsZXZlbC5cblxuICAgICAgICAgICAgVGhpcyBtZXRob2QgcHJvZHVjZXMgYSBKU09OIHRleHQgZnJvbSBhIEphdmFTY3JpcHQgdmFsdWUuXG5cbiAgICAgICAgICAgIFdoZW4gYW4gb2JqZWN0IHZhbHVlIGlzIGZvdW5kLCBpZiB0aGUgb2JqZWN0IGNvbnRhaW5zIGEgdG9KU09OXG4gICAgICAgICAgICBtZXRob2QsIGl0cyB0b0pTT04gbWV0aG9kIHdpbGwgYmUgY2FsbGVkIGFuZCB0aGUgcmVzdWx0IHdpbGwgYmVcbiAgICAgICAgICAgIHN0cmluZ2lmaWVkLiBBIHRvSlNPTiBtZXRob2QgZG9lcyBub3Qgc2VyaWFsaXplOiBpdCByZXR1cm5zIHRoZVxuICAgICAgICAgICAgdmFsdWUgcmVwcmVzZW50ZWQgYnkgdGhlIG5hbWUvdmFsdWUgcGFpciB0aGF0IHNob3VsZCBiZSBzZXJpYWxpemVkLFxuICAgICAgICAgICAgb3IgdW5kZWZpbmVkIGlmIG5vdGhpbmcgc2hvdWxkIGJlIHNlcmlhbGl6ZWQuIFRoZSB0b0pTT04gbWV0aG9kXG4gICAgICAgICAgICB3aWxsIGJlIHBhc3NlZCB0aGUga2V5IGFzc29jaWF0ZWQgd2l0aCB0aGUgdmFsdWUsIGFuZCB0aGlzIHdpbGwgYmVcbiAgICAgICAgICAgIGJvdW5kIHRvIHRoZSB2YWx1ZVxuXG4gICAgICAgICAgICBGb3IgZXhhbXBsZSwgdGhpcyB3b3VsZCBzZXJpYWxpemUgRGF0ZXMgYXMgSVNPIHN0cmluZ3MuXG5cbiAgICAgICAgICAgICAgICBEYXRlLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGYobikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9ybWF0IGludGVnZXJzIHRvIGhhdmUgYXQgbGVhc3QgdHdvIGRpZ2l0cy5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuIDogbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFVUQ0Z1bGxZZWFyKCkgICArICctJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ01vbnRoKCkgKyAxKSArICctJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ0RhdGUoKSkgICAgICArICdUJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ0hvdXJzKCkpICAgICArICc6JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ01pbnV0ZXMoKSkgICArICc6JyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ1NlY29uZHMoKSkgICArICdaJztcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBZb3UgY2FuIHByb3ZpZGUgYW4gb3B0aW9uYWwgcmVwbGFjZXIgbWV0aG9kLiBJdCB3aWxsIGJlIHBhc3NlZCB0aGVcbiAgICAgICAgICAgIGtleSBhbmQgdmFsdWUgb2YgZWFjaCBtZW1iZXIsIHdpdGggdGhpcyBib3VuZCB0byB0aGUgY29udGFpbmluZ1xuICAgICAgICAgICAgb2JqZWN0LiBUaGUgdmFsdWUgdGhhdCBpcyByZXR1cm5lZCBmcm9tIHlvdXIgbWV0aG9kIHdpbGwgYmVcbiAgICAgICAgICAgIHNlcmlhbGl6ZWQuIElmIHlvdXIgbWV0aG9kIHJldHVybnMgdW5kZWZpbmVkLCB0aGVuIHRoZSBtZW1iZXIgd2lsbFxuICAgICAgICAgICAgYmUgZXhjbHVkZWQgZnJvbSB0aGUgc2VyaWFsaXphdGlvbi5cblxuICAgICAgICAgICAgSWYgdGhlIHJlcGxhY2VyIHBhcmFtZXRlciBpcyBhbiBhcnJheSBvZiBzdHJpbmdzLCB0aGVuIGl0IHdpbGwgYmVcbiAgICAgICAgICAgIHVzZWQgdG8gc2VsZWN0IHRoZSBtZW1iZXJzIHRvIGJlIHNlcmlhbGl6ZWQuIEl0IGZpbHRlcnMgdGhlIHJlc3VsdHNcbiAgICAgICAgICAgIHN1Y2ggdGhhdCBvbmx5IG1lbWJlcnMgd2l0aCBrZXlzIGxpc3RlZCBpbiB0aGUgcmVwbGFjZXIgYXJyYXkgYXJlXG4gICAgICAgICAgICBzdHJpbmdpZmllZC5cblxuICAgICAgICAgICAgVmFsdWVzIHRoYXQgZG8gbm90IGhhdmUgSlNPTiByZXByZXNlbnRhdGlvbnMsIHN1Y2ggYXMgdW5kZWZpbmVkIG9yXG4gICAgICAgICAgICBmdW5jdGlvbnMsIHdpbGwgbm90IGJlIHNlcmlhbGl6ZWQuIFN1Y2ggdmFsdWVzIGluIG9iamVjdHMgd2lsbCBiZVxuICAgICAgICAgICAgZHJvcHBlZDsgaW4gYXJyYXlzIHRoZXkgd2lsbCBiZSByZXBsYWNlZCB3aXRoIG51bGwuIFlvdSBjYW4gdXNlXG4gICAgICAgICAgICBhIHJlcGxhY2VyIGZ1bmN0aW9uIHRvIHJlcGxhY2UgdGhvc2Ugd2l0aCBKU09OIHZhbHVlcy5cbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHVuZGVmaW5lZCkgcmV0dXJucyB1bmRlZmluZWQuXG5cbiAgICAgICAgICAgIFRoZSBvcHRpb25hbCBzcGFjZSBwYXJhbWV0ZXIgcHJvZHVjZXMgYSBzdHJpbmdpZmljYXRpb24gb2YgdGhlXG4gICAgICAgICAgICB2YWx1ZSB0aGF0IGlzIGZpbGxlZCB3aXRoIGxpbmUgYnJlYWtzIGFuZCBpbmRlbnRhdGlvbiB0byBtYWtlIGl0XG4gICAgICAgICAgICBlYXNpZXIgdG8gcmVhZC5cblxuICAgICAgICAgICAgSWYgdGhlIHNwYWNlIHBhcmFtZXRlciBpcyBhIG5vbi1lbXB0eSBzdHJpbmcsIHRoZW4gdGhhdCBzdHJpbmcgd2lsbFxuICAgICAgICAgICAgYmUgdXNlZCBmb3IgaW5kZW50YXRpb24uIElmIHRoZSBzcGFjZSBwYXJhbWV0ZXIgaXMgYSBudW1iZXIsIHRoZW5cbiAgICAgICAgICAgIHRoZSBpbmRlbnRhdGlvbiB3aWxsIGJlIHRoYXQgbWFueSBzcGFjZXMuXG5cbiAgICAgICAgICAgIEV4YW1wbGU6XG5cbiAgICAgICAgICAgIHRleHQgPSBKU09OLnN0cmluZ2lmeShbJ2UnLCB7cGx1cmlidXM6ICd1bnVtJ31dKTtcbiAgICAgICAgICAgIC8vIHRleHQgaXMgJ1tcImVcIix7XCJwbHVyaWJ1c1wiOlwidW51bVwifV0nXG5cblxuICAgICAgICAgICAgdGV4dCA9IEpTT04uc3RyaW5naWZ5KFsnZScsIHtwbHVyaWJ1czogJ3VudW0nfV0sIG51bGwsICdcXHQnKTtcbiAgICAgICAgICAgIC8vIHRleHQgaXMgJ1tcXG5cXHRcImVcIixcXG5cXHR7XFxuXFx0XFx0XCJwbHVyaWJ1c1wiOiBcInVudW1cIlxcblxcdH1cXG5dJ1xuXG4gICAgICAgICAgICB0ZXh0ID0gSlNPTi5zdHJpbmdpZnkoW25ldyBEYXRlKCldLCBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzW2tleV0gaW5zdGFuY2VvZiBEYXRlID9cbiAgICAgICAgICAgICAgICAgICAgJ0RhdGUoJyArIHRoaXNba2V5XSArICcpJyA6IHZhbHVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyB0ZXh0IGlzICdbXCJEYXRlKC0tLWN1cnJlbnQgdGltZS0tLSlcIl0nXG5cblxuICAgICAgICBKU09OLnBhcnNlKHRleHQsIHJldml2ZXIpXG4gICAgICAgICAgICBUaGlzIG1ldGhvZCBwYXJzZXMgYSBKU09OIHRleHQgdG8gcHJvZHVjZSBhbiBvYmplY3Qgb3IgYXJyYXkuXG4gICAgICAgICAgICBJdCBjYW4gdGhyb3cgYSBTeW50YXhFcnJvciBleGNlcHRpb24uXG5cbiAgICAgICAgICAgIFRoZSBvcHRpb25hbCByZXZpdmVyIHBhcmFtZXRlciBpcyBhIGZ1bmN0aW9uIHRoYXQgY2FuIGZpbHRlciBhbmRcbiAgICAgICAgICAgIHRyYW5zZm9ybSB0aGUgcmVzdWx0cy4gSXQgcmVjZWl2ZXMgZWFjaCBvZiB0aGUga2V5cyBhbmQgdmFsdWVzLFxuICAgICAgICAgICAgYW5kIGl0cyByZXR1cm4gdmFsdWUgaXMgdXNlZCBpbnN0ZWFkIG9mIHRoZSBvcmlnaW5hbCB2YWx1ZS5cbiAgICAgICAgICAgIElmIGl0IHJldHVybnMgd2hhdCBpdCByZWNlaXZlZCwgdGhlbiB0aGUgc3RydWN0dXJlIGlzIG5vdCBtb2RpZmllZC5cbiAgICAgICAgICAgIElmIGl0IHJldHVybnMgdW5kZWZpbmVkIHRoZW4gdGhlIG1lbWJlciBpcyBkZWxldGVkLlxuXG4gICAgICAgICAgICBFeGFtcGxlOlxuXG4gICAgICAgICAgICAvLyBQYXJzZSB0aGUgdGV4dC4gVmFsdWVzIHRoYXQgbG9vayBsaWtlIElTTyBkYXRlIHN0cmluZ3Mgd2lsbFxuICAgICAgICAgICAgLy8gYmUgY29udmVydGVkIHRvIERhdGUgb2JqZWN0cy5cblxuICAgICAgICAgICAgbXlEYXRhID0gSlNPTi5wYXJzZSh0ZXh0LCBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBhO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGEgPVxuL14oXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KVQoXFxkezJ9KTooXFxkezJ9KTooXFxkezJ9KD86XFwuXFxkKik/KVokLy5leGVjKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0ZShEYXRlLlVUQygrYVsxXSwgK2FbMl0gLSAxLCArYVszXSwgK2FbNF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgK2FbNV0sICthWzZdKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIG15RGF0YSA9IEpTT04ucGFyc2UoJ1tcIkRhdGUoMDkvMDkvMjAwMSlcIl0nLCBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBkO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZS5zbGljZSgwLCA1KSA9PT0gJ0RhdGUoJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUuc2xpY2UoLTEpID09PSAnKScpIHtcbiAgICAgICAgICAgICAgICAgICAgZCA9IG5ldyBEYXRlKHZhbHVlLnNsaWNlKDUsIC0xKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9KTtcblxuXG4gICAgVGhpcyBpcyBhIHJlZmVyZW5jZSBpbXBsZW1lbnRhdGlvbi4gWW91IGFyZSBmcmVlIHRvIGNvcHksIG1vZGlmeSwgb3JcbiAgICByZWRpc3RyaWJ1dGUuXG4qL1xuXG4vKmpzbGludCBldmlsOiB0cnVlLCByZWdleHA6IHRydWUgKi9cblxuLyptZW1iZXJzIFwiXCIsIFwiXFxiXCIsIFwiXFx0XCIsIFwiXFxuXCIsIFwiXFxmXCIsIFwiXFxyXCIsIFwiXFxcIlwiLCBKU09OLCBcIlxcXFxcIiwgYXBwbHksXG4gICAgY2FsbCwgY2hhckNvZGVBdCwgZ2V0VVRDRGF0ZSwgZ2V0VVRDRnVsbFllYXIsIGdldFVUQ0hvdXJzLFxuICAgIGdldFVUQ01pbnV0ZXMsIGdldFVUQ01vbnRoLCBnZXRVVENTZWNvbmRzLCBoYXNPd25Qcm9wZXJ0eSwgam9pbixcbiAgICBsYXN0SW5kZXgsIGxlbmd0aCwgcGFyc2UsIHByb3RvdHlwZSwgcHVzaCwgcmVwbGFjZSwgc2xpY2UsIHN0cmluZ2lmeSxcbiAgICB0ZXN0LCB0b0pTT04sIHRvU3RyaW5nLCB2YWx1ZU9mXG4qL1xuXG5cbi8vIENyZWF0ZSBhIEpTT04gb2JqZWN0IG9ubHkgaWYgb25lIGRvZXMgbm90IGFscmVhZHkgZXhpc3QuIFdlIGNyZWF0ZSB0aGVcbi8vIG1ldGhvZHMgaW4gYSBjbG9zdXJlIHRvIGF2b2lkIGNyZWF0aW5nIGdsb2JhbCB2YXJpYWJsZXMuXG5cbmlmICh0eXBlb2YgSlNPTiAhPT0gJ29iamVjdCcpIHtcbiAgICBKU09OID0ge307XG59XG5cbihmdW5jdGlvbiAoKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgZnVuY3Rpb24gZihuKSB7XG4gICAgICAgIC8vIEZvcm1hdCBpbnRlZ2VycyB0byBoYXZlIGF0IGxlYXN0IHR3byBkaWdpdHMuXG4gICAgICAgIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuIDogbjtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIERhdGUucHJvdG90eXBlLnRvSlNPTiAhPT0gJ2Z1bmN0aW9uJykge1xuXG4gICAgICAgIERhdGUucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgICAgcmV0dXJuIGlzRmluaXRlKHRoaXMudmFsdWVPZigpKVxuICAgICAgICAgICAgICAgID8gdGhpcy5nZXRVVENGdWxsWWVhcigpICAgICArICctJyArXG4gICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENNb250aCgpICsgMSkgKyAnLScgK1xuICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDRGF0ZSgpKSAgICAgICsgJ1QnICtcbiAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ0hvdXJzKCkpICAgICArICc6JyArXG4gICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENNaW51dGVzKCkpICAgKyAnOicgK1xuICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDU2Vjb25kcygpKSAgICsgJ1onXG4gICAgICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICB9O1xuXG4gICAgICAgIFN0cmluZy5wcm90b3R5cGUudG9KU09OICAgICAgPVxuICAgICAgICAgICAgTnVtYmVyLnByb3RvdHlwZS50b0pTT04gID1cbiAgICAgICAgICAgIEJvb2xlYW4ucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy52YWx1ZU9mKCk7XG4gICAgICAgICAgICB9O1xuICAgIH1cblxuICAgIHZhciBjeCA9IC9bXFx1MDAwMFxcdTAwYWRcXHUwNjAwLVxcdTA2MDRcXHUwNzBmXFx1MTdiNFxcdTE3YjVcXHUyMDBjLVxcdTIwMGZcXHUyMDI4LVxcdTIwMmZcXHUyMDYwLVxcdTIwNmZcXHVmZWZmXFx1ZmZmMC1cXHVmZmZmXS9nLFxuICAgICAgICBlc2NhcGFibGUgPSAvW1xcXFxcXFwiXFx4MDAtXFx4MWZcXHg3Zi1cXHg5ZlxcdTAwYWRcXHUwNjAwLVxcdTA2MDRcXHUwNzBmXFx1MTdiNFxcdTE3YjVcXHUyMDBjLVxcdTIwMGZcXHUyMDI4LVxcdTIwMmZcXHUyMDYwLVxcdTIwNmZcXHVmZWZmXFx1ZmZmMC1cXHVmZmZmXS9nLFxuICAgICAgICBnYXAsXG4gICAgICAgIGluZGVudCxcbiAgICAgICAgbWV0YSA9IHsgICAgLy8gdGFibGUgb2YgY2hhcmFjdGVyIHN1YnN0aXR1dGlvbnNcbiAgICAgICAgICAgICdcXGInOiAnXFxcXGInLFxuICAgICAgICAgICAgJ1xcdCc6ICdcXFxcdCcsXG4gICAgICAgICAgICAnXFxuJzogJ1xcXFxuJyxcbiAgICAgICAgICAgICdcXGYnOiAnXFxcXGYnLFxuICAgICAgICAgICAgJ1xccic6ICdcXFxccicsXG4gICAgICAgICAgICAnXCInIDogJ1xcXFxcIicsXG4gICAgICAgICAgICAnXFxcXCc6ICdcXFxcXFxcXCdcbiAgICAgICAgfSxcbiAgICAgICAgcmVwO1xuXG5cbiAgICBmdW5jdGlvbiBxdW90ZShzdHJpbmcpIHtcblxuLy8gSWYgdGhlIHN0cmluZyBjb250YWlucyBubyBjb250cm9sIGNoYXJhY3RlcnMsIG5vIHF1b3RlIGNoYXJhY3RlcnMsIGFuZCBub1xuLy8gYmFja3NsYXNoIGNoYXJhY3RlcnMsIHRoZW4gd2UgY2FuIHNhZmVseSBzbGFwIHNvbWUgcXVvdGVzIGFyb3VuZCBpdC5cbi8vIE90aGVyd2lzZSB3ZSBtdXN0IGFsc28gcmVwbGFjZSB0aGUgb2ZmZW5kaW5nIGNoYXJhY3RlcnMgd2l0aCBzYWZlIGVzY2FwZVxuLy8gc2VxdWVuY2VzLlxuXG4gICAgICAgIGVzY2FwYWJsZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICByZXR1cm4gZXNjYXBhYmxlLnRlc3Qoc3RyaW5nKSA/ICdcIicgKyBzdHJpbmcucmVwbGFjZShlc2NhcGFibGUsIGZ1bmN0aW9uIChhKSB7XG4gICAgICAgICAgICB2YXIgYyA9IG1ldGFbYV07XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIGMgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICAgICAgPyBjXG4gICAgICAgICAgICAgICAgOiAnXFxcXHUnICsgKCcwMDAwJyArIGEuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikpLnNsaWNlKC00KTtcbiAgICAgICAgfSkgKyAnXCInIDogJ1wiJyArIHN0cmluZyArICdcIic7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBzdHIoa2V5LCBob2xkZXIpIHtcblxuLy8gUHJvZHVjZSBhIHN0cmluZyBmcm9tIGhvbGRlcltrZXldLlxuXG4gICAgICAgIHZhciBpLCAgICAgICAgICAvLyBUaGUgbG9vcCBjb3VudGVyLlxuICAgICAgICAgICAgaywgICAgICAgICAgLy8gVGhlIG1lbWJlciBrZXkuXG4gICAgICAgICAgICB2LCAgICAgICAgICAvLyBUaGUgbWVtYmVyIHZhbHVlLlxuICAgICAgICAgICAgbGVuZ3RoLFxuICAgICAgICAgICAgbWluZCA9IGdhcCxcbiAgICAgICAgICAgIHBhcnRpYWwsXG4gICAgICAgICAgICB2YWx1ZSA9IGhvbGRlcltrZXldO1xuXG4vLyBJZiB0aGUgdmFsdWUgaGFzIGEgdG9KU09OIG1ldGhvZCwgY2FsbCBpdCB0byBvYnRhaW4gYSByZXBsYWNlbWVudCB2YWx1ZS5cblxuICAgICAgICBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZS50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUudG9KU09OKGtleSk7XG4gICAgICAgIH1cblxuLy8gSWYgd2Ugd2VyZSBjYWxsZWQgd2l0aCBhIHJlcGxhY2VyIGZ1bmN0aW9uLCB0aGVuIGNhbGwgdGhlIHJlcGxhY2VyIHRvXG4vLyBvYnRhaW4gYSByZXBsYWNlbWVudCB2YWx1ZS5cblxuICAgICAgICBpZiAodHlwZW9mIHJlcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdmFsdWUgPSByZXAuY2FsbChob2xkZXIsIGtleSwgdmFsdWUpO1xuICAgICAgICB9XG5cbi8vIFdoYXQgaGFwcGVucyBuZXh0IGRlcGVuZHMgb24gdGhlIHZhbHVlJ3MgdHlwZS5cblxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKHZhbHVlKTtcblxuICAgICAgICBjYXNlICdudW1iZXInOlxuXG4vLyBKU09OIG51bWJlcnMgbXVzdCBiZSBmaW5pdGUuIEVuY29kZSBub24tZmluaXRlIG51bWJlcnMgYXMgbnVsbC5cblxuICAgICAgICAgICAgcmV0dXJuIGlzRmluaXRlKHZhbHVlKSA/IFN0cmluZyh2YWx1ZSkgOiAnbnVsbCc7XG5cbiAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgIGNhc2UgJ251bGwnOlxuXG4vLyBJZiB0aGUgdmFsdWUgaXMgYSBib29sZWFuIG9yIG51bGwsIGNvbnZlcnQgaXQgdG8gYSBzdHJpbmcuIE5vdGU6XG4vLyB0eXBlb2YgbnVsbCBkb2VzIG5vdCBwcm9kdWNlICdudWxsJy4gVGhlIGNhc2UgaXMgaW5jbHVkZWQgaGVyZSBpblxuLy8gdGhlIHJlbW90ZSBjaGFuY2UgdGhhdCB0aGlzIGdldHMgZml4ZWQgc29tZWRheS5cblxuICAgICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG5cbi8vIElmIHRoZSB0eXBlIGlzICdvYmplY3QnLCB3ZSBtaWdodCBiZSBkZWFsaW5nIHdpdGggYW4gb2JqZWN0IG9yIGFuIGFycmF5IG9yXG4vLyBudWxsLlxuXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG5cbi8vIER1ZSB0byBhIHNwZWNpZmljYXRpb24gYmx1bmRlciBpbiBFQ01BU2NyaXB0LCB0eXBlb2YgbnVsbCBpcyAnb2JqZWN0Jyxcbi8vIHNvIHdhdGNoIG91dCBmb3IgdGhhdCBjYXNlLlxuXG4gICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdudWxsJztcbiAgICAgICAgICAgIH1cblxuLy8gTWFrZSBhbiBhcnJheSB0byBob2xkIHRoZSBwYXJ0aWFsIHJlc3VsdHMgb2Ygc3RyaW5naWZ5aW5nIHRoaXMgb2JqZWN0IHZhbHVlLlxuXG4gICAgICAgICAgICBnYXAgKz0gaW5kZW50O1xuICAgICAgICAgICAgcGFydGlhbCA9IFtdO1xuXG4vLyBJcyB0aGUgdmFsdWUgYW4gYXJyYXk/XG5cbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KHZhbHVlKSA9PT0gJ1tvYmplY3QgQXJyYXldJykge1xuXG4vLyBUaGUgdmFsdWUgaXMgYW4gYXJyYXkuIFN0cmluZ2lmeSBldmVyeSBlbGVtZW50LiBVc2UgbnVsbCBhcyBhIHBsYWNlaG9sZGVyXG4vLyBmb3Igbm9uLUpTT04gdmFsdWVzLlxuXG4gICAgICAgICAgICAgICAgbGVuZ3RoID0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0aWFsW2ldID0gc3RyKGksIHZhbHVlKSB8fCAnbnVsbCc7XG4gICAgICAgICAgICAgICAgfVxuXG4vLyBKb2luIGFsbCBvZiB0aGUgZWxlbWVudHMgdG9nZXRoZXIsIHNlcGFyYXRlZCB3aXRoIGNvbW1hcywgYW5kIHdyYXAgdGhlbSBpblxuLy8gYnJhY2tldHMuXG5cbiAgICAgICAgICAgICAgICB2ID0gcGFydGlhbC5sZW5ndGggPT09IDBcbiAgICAgICAgICAgICAgICAgICAgPyAnW10nXG4gICAgICAgICAgICAgICAgICAgIDogZ2FwXG4gICAgICAgICAgICAgICAgICAgID8gJ1tcXG4nICsgZ2FwICsgcGFydGlhbC5qb2luKCcsXFxuJyArIGdhcCkgKyAnXFxuJyArIG1pbmQgKyAnXSdcbiAgICAgICAgICAgICAgICAgICAgOiAnWycgKyBwYXJ0aWFsLmpvaW4oJywnKSArICddJztcbiAgICAgICAgICAgICAgICBnYXAgPSBtaW5kO1xuICAgICAgICAgICAgICAgIHJldHVybiB2O1xuICAgICAgICAgICAgfVxuXG4vLyBJZiB0aGUgcmVwbGFjZXIgaXMgYW4gYXJyYXksIHVzZSBpdCB0byBzZWxlY3QgdGhlIG1lbWJlcnMgdG8gYmUgc3RyaW5naWZpZWQuXG5cbiAgICAgICAgICAgIGlmIChyZXAgJiYgdHlwZW9mIHJlcCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBsZW5ndGggPSByZXAubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHJlcFtpXSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGsgPSByZXBbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICB2ID0gc3RyKGssIHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFydGlhbC5wdXNoKHF1b3RlKGspICsgKGdhcCA/ICc6ICcgOiAnOicpICsgdik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuXG4vLyBPdGhlcndpc2UsIGl0ZXJhdGUgdGhyb3VnaCBhbGwgb2YgdGhlIGtleXMgaW4gdGhlIG9iamVjdC5cblxuICAgICAgICAgICAgICAgIGZvciAoayBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBrKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdiA9IHN0cihrLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRpYWwucHVzaChxdW90ZShrKSArIChnYXAgPyAnOiAnIDogJzonKSArIHYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4vLyBKb2luIGFsbCBvZiB0aGUgbWVtYmVyIHRleHRzIHRvZ2V0aGVyLCBzZXBhcmF0ZWQgd2l0aCBjb21tYXMsXG4vLyBhbmQgd3JhcCB0aGVtIGluIGJyYWNlcy5cblxuICAgICAgICAgICAgdiA9IHBhcnRpYWwubGVuZ3RoID09PSAwXG4gICAgICAgICAgICAgICAgPyAne30nXG4gICAgICAgICAgICAgICAgOiBnYXBcbiAgICAgICAgICAgICAgICA/ICd7XFxuJyArIGdhcCArIHBhcnRpYWwuam9pbignLFxcbicgKyBnYXApICsgJ1xcbicgKyBtaW5kICsgJ30nXG4gICAgICAgICAgICAgICAgOiAneycgKyBwYXJ0aWFsLmpvaW4oJywnKSArICd9JztcbiAgICAgICAgICAgIGdhcCA9IG1pbmQ7XG4gICAgICAgICAgICByZXR1cm4gdjtcbiAgICAgICAgfVxuICAgIH1cblxuLy8gSWYgdGhlIEpTT04gb2JqZWN0IGRvZXMgbm90IHlldCBoYXZlIGEgc3RyaW5naWZ5IG1ldGhvZCwgZ2l2ZSBpdCBvbmUuXG5cbiAgICBGYXllLnN0cmluZ2lmeSA9IGZ1bmN0aW9uICh2YWx1ZSwgcmVwbGFjZXIsIHNwYWNlKSB7XG5cbi8vIFRoZSBzdHJpbmdpZnkgbWV0aG9kIHRha2VzIGEgdmFsdWUgYW5kIGFuIG9wdGlvbmFsIHJlcGxhY2VyLCBhbmQgYW4gb3B0aW9uYWxcbi8vIHNwYWNlIHBhcmFtZXRlciwgYW5kIHJldHVybnMgYSBKU09OIHRleHQuIFRoZSByZXBsYWNlciBjYW4gYmUgYSBmdW5jdGlvblxuLy8gdGhhdCBjYW4gcmVwbGFjZSB2YWx1ZXMsIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MgdGhhdCB3aWxsIHNlbGVjdCB0aGUga2V5cy5cbi8vIEEgZGVmYXVsdCByZXBsYWNlciBtZXRob2QgY2FuIGJlIHByb3ZpZGVkLiBVc2Ugb2YgdGhlIHNwYWNlIHBhcmFtZXRlciBjYW5cbi8vIHByb2R1Y2UgdGV4dCB0aGF0IGlzIG1vcmUgZWFzaWx5IHJlYWRhYmxlLlxuXG4gICAgICAgIHZhciBpO1xuICAgICAgICBnYXAgPSAnJztcbiAgICAgICAgaW5kZW50ID0gJyc7XG5cbi8vIElmIHRoZSBzcGFjZSBwYXJhbWV0ZXIgaXMgYSBudW1iZXIsIG1ha2UgYW4gaW5kZW50IHN0cmluZyBjb250YWluaW5nIHRoYXRcbi8vIG1hbnkgc3BhY2VzLlxuXG4gICAgICAgIGlmICh0eXBlb2Ygc3BhY2UgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgc3BhY2U7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgIGluZGVudCArPSAnICc7XG4gICAgICAgICAgICB9XG5cbi8vIElmIHRoZSBzcGFjZSBwYXJhbWV0ZXIgaXMgYSBzdHJpbmcsIGl0IHdpbGwgYmUgdXNlZCBhcyB0aGUgaW5kZW50IHN0cmluZy5cblxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzcGFjZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGluZGVudCA9IHNwYWNlO1xuICAgICAgICB9XG5cbi8vIElmIHRoZXJlIGlzIGEgcmVwbGFjZXIsIGl0IG11c3QgYmUgYSBmdW5jdGlvbiBvciBhbiBhcnJheS5cbi8vIE90aGVyd2lzZSwgdGhyb3cgYW4gZXJyb3IuXG5cbiAgICAgICAgcmVwID0gcmVwbGFjZXI7XG4gICAgICAgIGlmIChyZXBsYWNlciAmJiB0eXBlb2YgcmVwbGFjZXIgIT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICAgICAodHlwZW9mIHJlcGxhY2VyICE9PSAnb2JqZWN0JyB8fFxuICAgICAgICAgICAgICAgIHR5cGVvZiByZXBsYWNlci5sZW5ndGggIT09ICdudW1iZXInKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdKU09OLnN0cmluZ2lmeScpO1xuICAgICAgICB9XG5cbi8vIE1ha2UgYSBmYWtlIHJvb3Qgb2JqZWN0IGNvbnRhaW5pbmcgb3VyIHZhbHVlIHVuZGVyIHRoZSBrZXkgb2YgJycuXG4vLyBSZXR1cm4gdGhlIHJlc3VsdCBvZiBzdHJpbmdpZnlpbmcgdGhlIHZhbHVlLlxuXG4gICAgICAgIHJldHVybiBzdHIoJycsIHsnJzogdmFsdWV9KTtcbiAgICB9O1xuXG4gICAgaWYgKHR5cGVvZiBKU09OLnN0cmluZ2lmeSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBKU09OLnN0cmluZ2lmeSA9IEZheWUuc3RyaW5naWZ5O1xuICAgIH1cblxuLy8gSWYgdGhlIEpTT04gb2JqZWN0IGRvZXMgbm90IHlldCBoYXZlIGEgcGFyc2UgbWV0aG9kLCBnaXZlIGl0IG9uZS5cblxuICAgIGlmICh0eXBlb2YgSlNPTi5wYXJzZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBKU09OLnBhcnNlID0gZnVuY3Rpb24gKHRleHQsIHJldml2ZXIpIHtcblxuLy8gVGhlIHBhcnNlIG1ldGhvZCB0YWtlcyBhIHRleHQgYW5kIGFuIG9wdGlvbmFsIHJldml2ZXIgZnVuY3Rpb24sIGFuZCByZXR1cm5zXG4vLyBhIEphdmFTY3JpcHQgdmFsdWUgaWYgdGhlIHRleHQgaXMgYSB2YWxpZCBKU09OIHRleHQuXG5cbiAgICAgICAgICAgIHZhciBqO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiB3YWxrKGhvbGRlciwga2V5KSB7XG5cbi8vIFRoZSB3YWxrIG1ldGhvZCBpcyB1c2VkIHRvIHJlY3Vyc2l2ZWx5IHdhbGsgdGhlIHJlc3VsdGluZyBzdHJ1Y3R1cmUgc29cbi8vIHRoYXQgbW9kaWZpY2F0aW9ucyBjYW4gYmUgbWFkZS5cblxuICAgICAgICAgICAgICAgIHZhciBrLCB2LCB2YWx1ZSA9IGhvbGRlcltrZXldO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoayBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ID0gd2Fsayh2YWx1ZSwgayk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZVtrXSA9IHY7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHZhbHVlW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmV2aXZlci5jYWxsKGhvbGRlciwga2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG5cblxuLy8gUGFyc2luZyBoYXBwZW5zIGluIGZvdXIgc3RhZ2VzLiBJbiB0aGUgZmlyc3Qgc3RhZ2UsIHdlIHJlcGxhY2UgY2VydGFpblxuLy8gVW5pY29kZSBjaGFyYWN0ZXJzIHdpdGggZXNjYXBlIHNlcXVlbmNlcy4gSmF2YVNjcmlwdCBoYW5kbGVzIG1hbnkgY2hhcmFjdGVyc1xuLy8gaW5jb3JyZWN0bHksIGVpdGhlciBzaWxlbnRseSBkZWxldGluZyB0aGVtLCBvciB0cmVhdGluZyB0aGVtIGFzIGxpbmUgZW5kaW5ncy5cblxuICAgICAgICAgICAgdGV4dCA9IFN0cmluZyh0ZXh0KTtcbiAgICAgICAgICAgIGN4Lmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICBpZiAoY3gudGVzdCh0ZXh0KSkge1xuICAgICAgICAgICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoY3gsIGZ1bmN0aW9uIChhKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnXFxcXHUnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgnMDAwMCcgKyBhLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpKS5zbGljZSgtNCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbi8vIEluIHRoZSBzZWNvbmQgc3RhZ2UsIHdlIHJ1biB0aGUgdGV4dCBhZ2FpbnN0IHJlZ3VsYXIgZXhwcmVzc2lvbnMgdGhhdCBsb29rXG4vLyBmb3Igbm9uLUpTT04gcGF0dGVybnMuIFdlIGFyZSBlc3BlY2lhbGx5IGNvbmNlcm5lZCB3aXRoICcoKScgYW5kICduZXcnXG4vLyBiZWNhdXNlIHRoZXkgY2FuIGNhdXNlIGludm9jYXRpb24sIGFuZCAnPScgYmVjYXVzZSBpdCBjYW4gY2F1c2UgbXV0YXRpb24uXG4vLyBCdXQganVzdCB0byBiZSBzYWZlLCB3ZSB3YW50IHRvIHJlamVjdCBhbGwgdW5leHBlY3RlZCBmb3Jtcy5cblxuLy8gV2Ugc3BsaXQgdGhlIHNlY29uZCBzdGFnZSBpbnRvIDQgcmVnZXhwIG9wZXJhdGlvbnMgaW4gb3JkZXIgdG8gd29yayBhcm91bmRcbi8vIGNyaXBwbGluZyBpbmVmZmljaWVuY2llcyBpbiBJRSdzIGFuZCBTYWZhcmkncyByZWdleHAgZW5naW5lcy4gRmlyc3Qgd2Vcbi8vIHJlcGxhY2UgdGhlIEpTT04gYmFja3NsYXNoIHBhaXJzIHdpdGggJ0AnIChhIG5vbi1KU09OIGNoYXJhY3RlcikuIFNlY29uZCwgd2Vcbi8vIHJlcGxhY2UgYWxsIHNpbXBsZSB2YWx1ZSB0b2tlbnMgd2l0aCAnXScgY2hhcmFjdGVycy4gVGhpcmQsIHdlIGRlbGV0ZSBhbGxcbi8vIG9wZW4gYnJhY2tldHMgdGhhdCBmb2xsb3cgYSBjb2xvbiBvciBjb21tYSBvciB0aGF0IGJlZ2luIHRoZSB0ZXh0LiBGaW5hbGx5LFxuLy8gd2UgbG9vayB0byBzZWUgdGhhdCB0aGUgcmVtYWluaW5nIGNoYXJhY3RlcnMgYXJlIG9ubHkgd2hpdGVzcGFjZSBvciAnXScgb3Jcbi8vICcsJyBvciAnOicgb3IgJ3snIG9yICd9Jy4gSWYgdGhhdCBpcyBzbywgdGhlbiB0aGUgdGV4dCBpcyBzYWZlIGZvciBldmFsLlxuXG4gICAgICAgICAgICBpZiAoL15bXFxdLDp7fVxcc10qJC9cbiAgICAgICAgICAgICAgICAgICAgLnRlc3QodGV4dC5yZXBsYWNlKC9cXFxcKD86W1wiXFxcXFxcL2JmbnJ0XXx1WzAtOWEtZkEtRl17NH0pL2csICdAJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cIlteXCJcXFxcXFxuXFxyXSpcInx0cnVlfGZhbHNlfG51bGx8LT9cXGQrKD86XFwuXFxkKik/KD86W2VFXVsrXFwtXT9cXGQrKT8vZywgJ10nKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyg/Ol58OnwsKSg/OlxccypcXFspKy9nLCAnJykpKSB7XG5cbi8vIEluIHRoZSB0aGlyZCBzdGFnZSB3ZSB1c2UgdGhlIGV2YWwgZnVuY3Rpb24gdG8gY29tcGlsZSB0aGUgdGV4dCBpbnRvIGFcbi8vIEphdmFTY3JpcHQgc3RydWN0dXJlLiBUaGUgJ3snIG9wZXJhdG9yIGlzIHN1YmplY3QgdG8gYSBzeW50YWN0aWMgYW1iaWd1aXR5XG4vLyBpbiBKYXZhU2NyaXB0OiBpdCBjYW4gYmVnaW4gYSBibG9jayBvciBhbiBvYmplY3QgbGl0ZXJhbC4gV2Ugd3JhcCB0aGUgdGV4dFxuLy8gaW4gcGFyZW5zIHRvIGVsaW1pbmF0ZSB0aGUgYW1iaWd1aXR5LlxuXG4gICAgICAgICAgICAgICAgaiA9IGV2YWwoJygnICsgdGV4dCArICcpJyk7XG5cbi8vIEluIHRoZSBvcHRpb25hbCBmb3VydGggc3RhZ2UsIHdlIHJlY3Vyc2l2ZWx5IHdhbGsgdGhlIG5ldyBzdHJ1Y3R1cmUsIHBhc3Npbmdcbi8vIGVhY2ggbmFtZS92YWx1ZSBwYWlyIHRvIGEgcmV2aXZlciBmdW5jdGlvbiBmb3IgcG9zc2libGUgdHJhbnNmb3JtYXRpb24uXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdHlwZW9mIHJldml2ZXIgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICAgICAgPyB3YWxrKHsnJzogan0sICcnKVxuICAgICAgICAgICAgICAgICAgICA6IGo7XG4gICAgICAgICAgICB9XG5cbi8vIElmIHRoZSB0ZXh0IGlzIG5vdCBKU09OIHBhcnNlYWJsZSwgdGhlbiBhIFN5bnRheEVycm9yIGlzIHRocm93bi5cblxuICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKCdKU09OLnBhcnNlJyk7XG4gICAgICAgIH07XG4gICAgfVxufSgpKTtcblxuRmF5ZS5UcmFuc3BvcnQuV2ViU29ja2V0ID0gRmF5ZS5leHRlbmQoRmF5ZS5DbGFzcyhGYXllLlRyYW5zcG9ydCwge1xuICBVTkNPTk5FQ1RFRDogIDEsXG4gIENPTk5FQ1RJTkc6ICAgMixcbiAgQ09OTkVDVEVEOiAgICAzLFxuXG4gIGJhdGNoaW5nOiAgICAgZmFsc2UsXG5cbiAgaXNVc2FibGU6IGZ1bmN0aW9uKGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdGhpcy5jYWxsYmFjayhmdW5jdGlvbigpIHsgY2FsbGJhY2suY2FsbChjb250ZXh0LCB0cnVlKSB9KTtcbiAgICB0aGlzLmVycmJhY2soZnVuY3Rpb24oKSB7IGNhbGxiYWNrLmNhbGwoY29udGV4dCwgZmFsc2UpIH0pO1xuICAgIHRoaXMuY29ubmVjdCgpO1xuICB9LFxuXG4gIHJlcXVlc3Q6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgdGhpcy5fcGVuZGluZyA9IHRoaXMuX3BlbmRpbmcgfHwgbmV3IEZheWUuU2V0KCk7XG4gICAgZm9yICh2YXIgaSA9IDAsIG4gPSBtZXNzYWdlcy5sZW5ndGg7IGkgPCBuOyBpKyspIHRoaXMuX3BlbmRpbmcuYWRkKG1lc3NhZ2VzW2ldKTtcblxuICAgIHZhciBwcm9taXNlID0gbmV3IEZheWUuUHJvbWlzZSgpO1xuXG4gICAgdGhpcy5jYWxsYmFjayhmdW5jdGlvbihzb2NrZXQpIHtcbiAgICAgIGlmICghc29ja2V0IHx8IHNvY2tldC5yZWFkeVN0YXRlICE9PSAxKSByZXR1cm47XG4gICAgICBzb2NrZXQuc2VuZChGYXllLnRvSlNPTihtZXNzYWdlcykpO1xuICAgICAgRmF5ZS5Qcm9taXNlLmZ1bGZpbGwocHJvbWlzZSwgc29ja2V0KTtcbiAgICB9LCB0aGlzKTtcblxuICAgIHRoaXMuY29ubmVjdCgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGFib3J0OiBmdW5jdGlvbigpIHsgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHdzKSB7IHdzLmNsb3NlKCkgfSkgfVxuICAgIH07XG4gIH0sXG5cbiAgY29ubmVjdDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKEZheWUuVHJhbnNwb3J0LldlYlNvY2tldC5fdW5sb2FkZWQpIHJldHVybjtcblxuICAgIHRoaXMuX3N0YXRlID0gdGhpcy5fc3RhdGUgfHwgdGhpcy5VTkNPTk5FQ1RFRDtcbiAgICBpZiAodGhpcy5fc3RhdGUgIT09IHRoaXMuVU5DT05ORUNURUQpIHJldHVybjtcbiAgICB0aGlzLl9zdGF0ZSA9IHRoaXMuQ09OTkVDVElORztcblxuICAgIHZhciBzb2NrZXQgPSB0aGlzLl9jcmVhdGVTb2NrZXQoKTtcbiAgICBpZiAoIXNvY2tldCkgcmV0dXJuIHRoaXMuc2V0RGVmZXJyZWRTdGF0dXMoJ2ZhaWxlZCcpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgc29ja2V0Lm9ub3BlbiA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHNvY2tldC5oZWFkZXJzKSBzZWxmLl9zdG9yZUNvb2tpZXMoc29ja2V0LmhlYWRlcnNbJ3NldC1jb29raWUnXSk7XG4gICAgICBzZWxmLl9zb2NrZXQgPSBzb2NrZXQ7XG4gICAgICBzZWxmLl9zdGF0ZSA9IHNlbGYuQ09OTkVDVEVEO1xuICAgICAgc2VsZi5fZXZlckNvbm5lY3RlZCA9IHRydWU7XG4gICAgICBzZWxmLl9waW5nKCk7XG4gICAgICBzZWxmLnNldERlZmVycmVkU3RhdHVzKCdzdWNjZWVkZWQnLCBzb2NrZXQpO1xuICAgIH07XG5cbiAgICB2YXIgY2xvc2VkID0gZmFsc2U7XG4gICAgc29ja2V0Lm9uY2xvc2UgPSBzb2NrZXQub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGNsb3NlZCkgcmV0dXJuO1xuICAgICAgY2xvc2VkID0gdHJ1ZTtcblxuICAgICAgdmFyIHdhc0Nvbm5lY3RlZCA9IChzZWxmLl9zdGF0ZSA9PT0gc2VsZi5DT05ORUNURUQpO1xuICAgICAgc29ja2V0Lm9ub3BlbiA9IHNvY2tldC5vbmNsb3NlID0gc29ja2V0Lm9uZXJyb3IgPSBzb2NrZXQub25tZXNzYWdlID0gbnVsbDtcblxuICAgICAgZGVsZXRlIHNlbGYuX3NvY2tldDtcbiAgICAgIHNlbGYuX3N0YXRlID0gc2VsZi5VTkNPTk5FQ1RFRDtcbiAgICAgIHNlbGYucmVtb3ZlVGltZW91dCgncGluZycpO1xuICAgICAgc2VsZi5zZXREZWZlcnJlZFN0YXR1cygndW5rbm93bicpO1xuXG4gICAgICB2YXIgcGVuZGluZyA9IHNlbGYuX3BlbmRpbmcgPyBzZWxmLl9wZW5kaW5nLnRvQXJyYXkoKSA6IFtdO1xuICAgICAgZGVsZXRlIHNlbGYuX3BlbmRpbmc7XG5cbiAgICAgIGlmICh3YXNDb25uZWN0ZWQpIHtcbiAgICAgICAgc2VsZi5faGFuZGxlRXJyb3IocGVuZGluZywgdHJ1ZSk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGYuX2V2ZXJDb25uZWN0ZWQpIHtcbiAgICAgICAgc2VsZi5faGFuZGxlRXJyb3IocGVuZGluZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnNldERlZmVycmVkU3RhdHVzKCdmYWlsZWQnKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgc29ja2V0Lm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICB2YXIgcmVwbGllcyA9IEpTT04ucGFyc2UoZXZlbnQuZGF0YSk7XG4gICAgICBpZiAoIXJlcGxpZXMpIHJldHVybjtcblxuICAgICAgcmVwbGllcyA9IFtdLmNvbmNhdChyZXBsaWVzKTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSByZXBsaWVzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICBpZiAocmVwbGllc1tpXS5zdWNjZXNzZnVsID09PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgICAgICBzZWxmLl9wZW5kaW5nLnJlbW92ZShyZXBsaWVzW2ldKTtcbiAgICAgIH1cbiAgICAgIHNlbGYuX3JlY2VpdmUocmVwbGllcyk7XG4gICAgfTtcbiAgfSxcblxuICBjbG9zZTogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLl9zb2NrZXQpIHJldHVybjtcbiAgICB0aGlzLl9zb2NrZXQuY2xvc2UoKTtcbiAgfSxcblxuICBfY3JlYXRlU29ja2V0OiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdXJsICAgICAgICA9IEZheWUuVHJhbnNwb3J0LldlYlNvY2tldC5nZXRTb2NrZXRVcmwodGhpcy5lbmRwb2ludCksXG4gICAgICAgIGhlYWRlcnMgICAgPSB0aGlzLl9kaXNwYXRjaGVyLmhlYWRlcnMsXG4gICAgICAgIGV4dGVuc2lvbnMgPSB0aGlzLl9kaXNwYXRjaGVyLndzRXh0ZW5zaW9ucyxcbiAgICAgICAgY29va2llICAgICA9IHRoaXMuX2dldENvb2tpZXMoKSxcbiAgICAgICAgdGxzICAgICAgICA9IHRoaXMuX2Rpc3BhdGNoZXIudGxzLFxuICAgICAgICBvcHRpb25zICAgID0ge2V4dGVuc2lvbnM6IGV4dGVuc2lvbnMsIGhlYWRlcnM6IGhlYWRlcnMsIHByb3h5OiB0aGlzLl9wcm94eSwgdGxzOiB0bHN9O1xuXG4gICAgaWYgKGNvb2tpZSAhPT0gJycpIG9wdGlvbnMuaGVhZGVyc1snQ29va2llJ10gPSBjb29raWU7XG5cbiAgICBpZiAoRmF5ZS5XZWJTb2NrZXQpICAgICAgICByZXR1cm4gbmV3IEZheWUuV2ViU29ja2V0LkNsaWVudCh1cmwsIFtdLCBvcHRpb25zKTtcbiAgICBpZiAoRmF5ZS5FTlYuTW96V2ViU29ja2V0KSByZXR1cm4gbmV3IE1veldlYlNvY2tldCh1cmwpO1xuICAgIGlmIChGYXllLkVOVi5XZWJTb2NrZXQpICAgIHJldHVybiBuZXcgV2ViU29ja2V0KHVybCk7XG4gIH0sXG5cbiAgX3Bpbmc6IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5fc29ja2V0KSByZXR1cm47XG4gICAgdGhpcy5fc29ja2V0LnNlbmQoJ1tdJyk7XG4gICAgdGhpcy5hZGRUaW1lb3V0KCdwaW5nJywgdGhpcy5fZGlzcGF0Y2hlci50aW1lb3V0IC8gMiwgdGhpcy5fcGluZywgdGhpcyk7XG4gIH1cblxufSksIHtcbiAgUFJPVE9DT0xTOiB7XG4gICAgJ2h0dHA6JzogICd3czonLFxuICAgICdodHRwczonOiAnd3NzOidcbiAgfSxcblxuICBjcmVhdGU6IGZ1bmN0aW9uKGRpc3BhdGNoZXIsIGVuZHBvaW50KSB7XG4gICAgdmFyIHNvY2tldHMgPSBkaXNwYXRjaGVyLnRyYW5zcG9ydHMud2Vic29ja2V0ID0gZGlzcGF0Y2hlci50cmFuc3BvcnRzLndlYnNvY2tldCB8fCB7fTtcbiAgICBzb2NrZXRzW2VuZHBvaW50LmhyZWZdID0gc29ja2V0c1tlbmRwb2ludC5ocmVmXSB8fCBuZXcgdGhpcyhkaXNwYXRjaGVyLCBlbmRwb2ludCk7XG4gICAgcmV0dXJuIHNvY2tldHNbZW5kcG9pbnQuaHJlZl07XG4gIH0sXG5cbiAgZ2V0U29ja2V0VXJsOiBmdW5jdGlvbihlbmRwb2ludCkge1xuICAgIGVuZHBvaW50ID0gRmF5ZS5jb3B5T2JqZWN0KGVuZHBvaW50KTtcbiAgICBlbmRwb2ludC5wcm90b2NvbCA9IHRoaXMuUFJPVE9DT0xTW2VuZHBvaW50LnByb3RvY29sXTtcbiAgICByZXR1cm4gRmF5ZS5VUkkuc3RyaW5naWZ5KGVuZHBvaW50KTtcbiAgfSxcblxuICBpc1VzYWJsZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdGhpcy5jcmVhdGUoZGlzcGF0Y2hlciwgZW5kcG9pbnQpLmlzVXNhYmxlKGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgfVxufSk7XG5cbkZheWUuZXh0ZW5kKEZheWUuVHJhbnNwb3J0LldlYlNvY2tldC5wcm90b3R5cGUsIEZheWUuRGVmZXJyYWJsZSk7XG5GYXllLlRyYW5zcG9ydC5yZWdpc3Rlcignd2Vic29ja2V0JywgRmF5ZS5UcmFuc3BvcnQuV2ViU29ja2V0KTtcblxuaWYgKEZheWUuRXZlbnQgJiYgRmF5ZS5FTlYub25iZWZvcmV1bmxvYWQgIT09IHVuZGVmaW5lZClcbiAgRmF5ZS5FdmVudC5vbihGYXllLkVOViwgJ2JlZm9yZXVubG9hZCcsIGZ1bmN0aW9uKCkge1xuICAgIEZheWUuVHJhbnNwb3J0LldlYlNvY2tldC5fdW5sb2FkZWQgPSB0cnVlO1xuICB9KTtcblxuRmF5ZS5UcmFuc3BvcnQuRXZlbnRTb3VyY2UgPSBGYXllLmV4dGVuZChGYXllLkNsYXNzKEZheWUuVHJhbnNwb3J0LCB7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKGRpc3BhdGNoZXIsIGVuZHBvaW50KSB7XG4gICAgRmF5ZS5UcmFuc3BvcnQucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBkaXNwYXRjaGVyLCBlbmRwb2ludCk7XG4gICAgaWYgKCFGYXllLkVOVi5FdmVudFNvdXJjZSkgcmV0dXJuIHRoaXMuc2V0RGVmZXJyZWRTdGF0dXMoJ2ZhaWxlZCcpO1xuXG4gICAgdGhpcy5feGhyID0gbmV3IEZheWUuVHJhbnNwb3J0LlhIUihkaXNwYXRjaGVyLCBlbmRwb2ludCk7XG5cbiAgICBlbmRwb2ludCA9IEZheWUuY29weU9iamVjdChlbmRwb2ludCk7XG4gICAgZW5kcG9pbnQucGF0aG5hbWUgKz0gJy8nICsgZGlzcGF0Y2hlci5jbGllbnRJZDtcblxuICAgIHZhciBzb2NrZXQgPSBuZXcgRXZlbnRTb3VyY2UoRmF5ZS5VUkkuc3RyaW5naWZ5KGVuZHBvaW50KSksXG4gICAgICAgIHNlbGYgICA9IHRoaXM7XG5cbiAgICBzb2NrZXQub25vcGVuID0gZnVuY3Rpb24oKSB7XG4gICAgICBzZWxmLl9ldmVyQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgIHNlbGYuc2V0RGVmZXJyZWRTdGF0dXMoJ3N1Y2NlZWRlZCcpO1xuICAgIH07XG5cbiAgICBzb2NrZXQub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHNlbGYuX2V2ZXJDb25uZWN0ZWQpIHtcbiAgICAgICAgc2VsZi5faGFuZGxlRXJyb3IoW10pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5zZXREZWZlcnJlZFN0YXR1cygnZmFpbGVkJyk7XG4gICAgICAgIHNvY2tldC5jbG9zZSgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBzb2NrZXQub25tZXNzYWdlID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIHNlbGYuX3JlY2VpdmUoSlNPTi5wYXJzZShldmVudC5kYXRhKSk7XG4gICAgfTtcblxuICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcbiAgfSxcblxuICBjbG9zZTogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLl9zb2NrZXQpIHJldHVybjtcbiAgICB0aGlzLl9zb2NrZXQub25vcGVuID0gdGhpcy5fc29ja2V0Lm9uZXJyb3IgPSB0aGlzLl9zb2NrZXQub25tZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLl9zb2NrZXQuY2xvc2UoKTtcbiAgICBkZWxldGUgdGhpcy5fc29ja2V0O1xuICB9LFxuXG4gIGlzVXNhYmxlOiBmdW5jdGlvbihjYWxsYmFjaywgY29udGV4dCkge1xuICAgIHRoaXMuY2FsbGJhY2soZnVuY3Rpb24oKSB7IGNhbGxiYWNrLmNhbGwoY29udGV4dCwgdHJ1ZSkgfSk7XG4gICAgdGhpcy5lcnJiYWNrKGZ1bmN0aW9uKCkgeyBjYWxsYmFjay5jYWxsKGNvbnRleHQsIGZhbHNlKSB9KTtcbiAgfSxcblxuICBlbmNvZGU6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgcmV0dXJuIHRoaXMuX3hoci5lbmNvZGUobWVzc2FnZXMpO1xuICB9LFxuXG4gIHJlcXVlc3Q6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgcmV0dXJuIHRoaXMuX3hoci5yZXF1ZXN0KG1lc3NhZ2VzKTtcbiAgfVxuXG59KSwge1xuICBpc1VzYWJsZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdmFyIGlkID0gZGlzcGF0Y2hlci5jbGllbnRJZDtcbiAgICBpZiAoIWlkKSByZXR1cm4gY2FsbGJhY2suY2FsbChjb250ZXh0LCBmYWxzZSk7XG5cbiAgICBGYXllLlRyYW5zcG9ydC5YSFIuaXNVc2FibGUoZGlzcGF0Y2hlciwgZW5kcG9pbnQsIGZ1bmN0aW9uKHVzYWJsZSkge1xuICAgICAgaWYgKCF1c2FibGUpIHJldHVybiBjYWxsYmFjay5jYWxsKGNvbnRleHQsIGZhbHNlKTtcbiAgICAgIHRoaXMuY3JlYXRlKGRpc3BhdGNoZXIsIGVuZHBvaW50KS5pc1VzYWJsZShjYWxsYmFjaywgY29udGV4dCk7XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgY3JlYXRlOiBmdW5jdGlvbihkaXNwYXRjaGVyLCBlbmRwb2ludCkge1xuICAgIHZhciBzb2NrZXRzID0gZGlzcGF0Y2hlci50cmFuc3BvcnRzLmV2ZW50c291cmNlID0gZGlzcGF0Y2hlci50cmFuc3BvcnRzLmV2ZW50c291cmNlIHx8IHt9LFxuICAgICAgICBpZCAgICAgID0gZGlzcGF0Y2hlci5jbGllbnRJZDtcblxuICAgIHZhciB1cmwgPSBGYXllLmNvcHlPYmplY3QoZW5kcG9pbnQpO1xuICAgIHVybC5wYXRobmFtZSArPSAnLycgKyAoaWQgfHwgJycpO1xuICAgIHVybCA9IEZheWUuVVJJLnN0cmluZ2lmeSh1cmwpO1xuXG4gICAgc29ja2V0c1t1cmxdID0gc29ja2V0c1t1cmxdIHx8IG5ldyB0aGlzKGRpc3BhdGNoZXIsIGVuZHBvaW50KTtcbiAgICByZXR1cm4gc29ja2V0c1t1cmxdO1xuICB9XG59KTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5UcmFuc3BvcnQuRXZlbnRTb3VyY2UucHJvdG90eXBlLCBGYXllLkRlZmVycmFibGUpO1xuRmF5ZS5UcmFuc3BvcnQucmVnaXN0ZXIoJ2V2ZW50c291cmNlJywgRmF5ZS5UcmFuc3BvcnQuRXZlbnRTb3VyY2UpO1xuXG5GYXllLlRyYW5zcG9ydC5YSFIgPSBGYXllLmV4dGVuZChGYXllLkNsYXNzKEZheWUuVHJhbnNwb3J0LCB7XG4gIGVuY29kZTogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICByZXR1cm4gRmF5ZS50b0pTT04obWVzc2FnZXMpO1xuICB9LFxuXG4gIHJlcXVlc3Q6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgdmFyIGhyZWYgPSB0aGlzLmVuZHBvaW50LmhyZWYsXG4gICAgICAgIHhociAgPSBGYXllLkVOVi5BY3RpdmVYT2JqZWN0ID8gbmV3IEFjdGl2ZVhPYmplY3QoJ01pY3Jvc29mdC5YTUxIVFRQJykgOiBuZXcgWE1MSHR0cFJlcXVlc3QoKSxcbiAgICAgICAgc2VsZiA9IHRoaXM7XG5cbiAgICB4aHIub3BlbignUE9TVCcsIGhyZWYsIHRydWUpO1xuICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdQcmFnbWEnLCAnbm8tY2FjaGUnKTtcbiAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignWC1SZXF1ZXN0ZWQtV2l0aCcsICdYTUxIdHRwUmVxdWVzdCcpO1xuXG4gICAgdmFyIGhlYWRlcnMgPSB0aGlzLl9kaXNwYXRjaGVyLmhlYWRlcnM7XG4gICAgZm9yICh2YXIga2V5IGluIGhlYWRlcnMpIHtcbiAgICAgIGlmICghaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKSBjb250aW51ZTtcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgaGVhZGVyc1trZXldKTtcbiAgICB9XG5cbiAgICB2YXIgYWJvcnQgPSBmdW5jdGlvbigpIHsgeGhyLmFib3J0KCkgfTtcbiAgICBpZiAoRmF5ZS5FTlYub25iZWZvcmV1bmxvYWQgIT09IHVuZGVmaW5lZCkgRmF5ZS5FdmVudC5vbihGYXllLkVOViwgJ2JlZm9yZXVubG9hZCcsIGFib3J0KTtcblxuICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgheGhyIHx8IHhoci5yZWFkeVN0YXRlICE9PSA0KSByZXR1cm47XG5cbiAgICAgIHZhciByZXBsaWVzICAgID0gbnVsbCxcbiAgICAgICAgICBzdGF0dXMgICAgID0geGhyLnN0YXR1cyxcbiAgICAgICAgICB0ZXh0ICAgICAgID0geGhyLnJlc3BvbnNlVGV4dCxcbiAgICAgICAgICBzdWNjZXNzZnVsID0gKHN0YXR1cyA+PSAyMDAgJiYgc3RhdHVzIDwgMzAwKSB8fCBzdGF0dXMgPT09IDMwNCB8fCBzdGF0dXMgPT09IDEyMjM7XG5cbiAgICAgIGlmIChGYXllLkVOVi5vbmJlZm9yZXVubG9hZCAhPT0gdW5kZWZpbmVkKSBGYXllLkV2ZW50LmRldGFjaChGYXllLkVOViwgJ2JlZm9yZXVubG9hZCcsIGFib3J0KTtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHt9O1xuICAgICAgeGhyID0gbnVsbDtcblxuICAgICAgaWYgKCFzdWNjZXNzZnVsKSByZXR1cm4gc2VsZi5faGFuZGxlRXJyb3IobWVzc2FnZXMpO1xuXG4gICAgICB0cnkge1xuICAgICAgICByZXBsaWVzID0gSlNPTi5wYXJzZSh0ZXh0KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHt9XG5cbiAgICAgIGlmIChyZXBsaWVzKVxuICAgICAgICBzZWxmLl9yZWNlaXZlKHJlcGxpZXMpO1xuICAgICAgZWxzZVxuICAgICAgICBzZWxmLl9oYW5kbGVFcnJvcihtZXNzYWdlcyk7XG4gICAgfTtcblxuICAgIHhoci5zZW5kKHRoaXMuZW5jb2RlKG1lc3NhZ2VzKSk7XG4gICAgcmV0dXJuIHhocjtcbiAgfVxufSksIHtcbiAgaXNVc2FibGU6IGZ1bmN0aW9uKGRpc3BhdGNoZXIsIGVuZHBvaW50LCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgRmF5ZS5VUkkuaXNTYW1lT3JpZ2luKGVuZHBvaW50KSk7XG4gIH1cbn0pO1xuXG5GYXllLlRyYW5zcG9ydC5yZWdpc3RlcignbG9uZy1wb2xsaW5nJywgRmF5ZS5UcmFuc3BvcnQuWEhSKTtcblxuRmF5ZS5UcmFuc3BvcnQuQ09SUyA9IEZheWUuZXh0ZW5kKEZheWUuQ2xhc3MoRmF5ZS5UcmFuc3BvcnQsIHtcbiAgZW5jb2RlOiBmdW5jdGlvbihtZXNzYWdlcykge1xuICAgIHJldHVybiAnbWVzc2FnZT0nICsgZW5jb2RlVVJJQ29tcG9uZW50KEZheWUudG9KU09OKG1lc3NhZ2VzKSk7XG4gIH0sXG5cbiAgcmVxdWVzdDogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICB2YXIgeGhyQ2xhc3MgPSBGYXllLkVOVi5YRG9tYWluUmVxdWVzdCA/IFhEb21haW5SZXF1ZXN0IDogWE1MSHR0cFJlcXVlc3QsXG4gICAgICAgIHhociAgICAgID0gbmV3IHhockNsYXNzKCksXG4gICAgICAgIGlkICAgICAgID0gKytGYXllLlRyYW5zcG9ydC5DT1JTLl9pZCxcbiAgICAgICAgaGVhZGVycyAgPSB0aGlzLl9kaXNwYXRjaGVyLmhlYWRlcnMsXG4gICAgICAgIHNlbGYgICAgID0gdGhpcyxcbiAgICAgICAga2V5O1xuXG4gICAgeGhyLm9wZW4oJ1BPU1QnLCBGYXllLlVSSS5zdHJpbmdpZnkodGhpcy5lbmRwb2ludCksIHRydWUpO1xuXG4gICAgaWYgKHhoci5zZXRSZXF1ZXN0SGVhZGVyKSB7XG4gICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignUHJhZ21hJywgJ25vLWNhY2hlJyk7XG4gICAgICBmb3IgKGtleSBpbiBoZWFkZXJzKSB7XG4gICAgICAgIGlmICghaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKSBjb250aW51ZTtcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBoZWFkZXJzW2tleV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBjbGVhblVwID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoIXhocikgcmV0dXJuIGZhbHNlO1xuICAgICAgRmF5ZS5UcmFuc3BvcnQuQ09SUy5fcGVuZGluZy5yZW1vdmUoaWQpO1xuICAgICAgeGhyLm9ubG9hZCA9IHhoci5vbmVycm9yID0geGhyLm9udGltZW91dCA9IHhoci5vbnByb2dyZXNzID0gbnVsbDtcbiAgICAgIHhociA9IG51bGw7XG4gICAgfTtcblxuICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXBsaWVzID0gbnVsbDtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcGxpZXMgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xuICAgICAgfSBjYXRjaCAoZSkge31cblxuICAgICAgY2xlYW5VcCgpO1xuXG4gICAgICBpZiAocmVwbGllcylcbiAgICAgICAgc2VsZi5fcmVjZWl2ZShyZXBsaWVzKTtcbiAgICAgIGVsc2VcbiAgICAgICAgc2VsZi5faGFuZGxlRXJyb3IobWVzc2FnZXMpO1xuICAgIH07XG5cbiAgICB4aHIub25lcnJvciA9IHhoci5vbnRpbWVvdXQgPSBmdW5jdGlvbigpIHtcbiAgICAgIGNsZWFuVXAoKTtcbiAgICAgIHNlbGYuX2hhbmRsZUVycm9yKG1lc3NhZ2VzKTtcbiAgICB9O1xuXG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbigpIHt9O1xuXG4gICAgaWYgKHhockNsYXNzID09PSBGYXllLkVOVi5YRG9tYWluUmVxdWVzdClcbiAgICAgIEZheWUuVHJhbnNwb3J0LkNPUlMuX3BlbmRpbmcuYWRkKHtpZDogaWQsIHhocjogeGhyfSk7XG5cbiAgICB4aHIuc2VuZCh0aGlzLmVuY29kZShtZXNzYWdlcykpO1xuICAgIHJldHVybiB4aHI7XG4gIH1cbn0pLCB7XG4gIF9pZDogICAgICAwLFxuICBfcGVuZGluZzogbmV3IEZheWUuU2V0KCksXG5cbiAgaXNVc2FibGU6IGZ1bmN0aW9uKGRpc3BhdGNoZXIsIGVuZHBvaW50LCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGlmIChGYXllLlVSSS5pc1NhbWVPcmlnaW4oZW5kcG9pbnQpKVxuICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgZmFsc2UpO1xuXG4gICAgaWYgKEZheWUuRU5WLlhEb21haW5SZXF1ZXN0KVxuICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgZW5kcG9pbnQucHJvdG9jb2wgPT09IEZheWUuRU5WLmxvY2F0aW9uLnByb3RvY29sKTtcblxuICAgIGlmIChGYXllLkVOVi5YTUxIdHRwUmVxdWVzdCkge1xuICAgICAgdmFyIHhociA9IG5ldyBGYXllLkVOVi5YTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgeGhyLndpdGhDcmVkZW50aWFscyAhPT0gdW5kZWZpbmVkKTtcbiAgICB9XG4gICAgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgZmFsc2UpO1xuICB9XG59KTtcblxuRmF5ZS5UcmFuc3BvcnQucmVnaXN0ZXIoJ2Nyb3NzLW9yaWdpbi1sb25nLXBvbGxpbmcnLCBGYXllLlRyYW5zcG9ydC5DT1JTKTtcblxuRmF5ZS5UcmFuc3BvcnQuSlNPTlAgPSBGYXllLmV4dGVuZChGYXllLkNsYXNzKEZheWUuVHJhbnNwb3J0LCB7XG4gZW5jb2RlOiBmdW5jdGlvbihtZXNzYWdlcykge1xuICAgIHZhciB1cmwgPSBGYXllLmNvcHlPYmplY3QodGhpcy5lbmRwb2ludCk7XG4gICAgdXJsLnF1ZXJ5Lm1lc3NhZ2UgPSBGYXllLnRvSlNPTihtZXNzYWdlcyk7XG4gICAgdXJsLnF1ZXJ5Lmpzb25wICAgPSAnX19qc29ucCcgKyBGYXllLlRyYW5zcG9ydC5KU09OUC5fY2JDb3VudCArICdfXyc7XG4gICAgcmV0dXJuIEZheWUuVVJJLnN0cmluZ2lmeSh1cmwpO1xuICB9LFxuXG4gIHJlcXVlc3Q6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgdmFyIGhlYWQgICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF0sXG4gICAgICAgIHNjcmlwdCAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpLFxuICAgICAgICBjYWxsYmFja05hbWUgPSBGYXllLlRyYW5zcG9ydC5KU09OUC5nZXRDYWxsYmFja05hbWUoKSxcbiAgICAgICAgZW5kcG9pbnQgICAgID0gRmF5ZS5jb3B5T2JqZWN0KHRoaXMuZW5kcG9pbnQpLFxuICAgICAgICBzZWxmICAgICAgICAgPSB0aGlzO1xuXG4gICAgZW5kcG9pbnQucXVlcnkubWVzc2FnZSA9IEZheWUudG9KU09OKG1lc3NhZ2VzKTtcbiAgICBlbmRwb2ludC5xdWVyeS5qc29ucCAgID0gY2FsbGJhY2tOYW1lO1xuXG4gICAgdmFyIGNsZWFudXAgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmICghRmF5ZS5FTlZbY2FsbGJhY2tOYW1lXSkgcmV0dXJuIGZhbHNlO1xuICAgICAgRmF5ZS5FTlZbY2FsbGJhY2tOYW1lXSA9IHVuZGVmaW5lZDtcbiAgICAgIHRyeSB7IGRlbGV0ZSBGYXllLkVOVltjYWxsYmFja05hbWVdIH0gY2F0Y2ggKGUpIHt9XG4gICAgICBzY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChzY3JpcHQpO1xuICAgIH07XG5cbiAgICBGYXllLkVOVltjYWxsYmFja05hbWVdID0gZnVuY3Rpb24ocmVwbGllcykge1xuICAgICAgY2xlYW51cCgpO1xuICAgICAgc2VsZi5fcmVjZWl2ZShyZXBsaWVzKTtcbiAgICB9O1xuXG4gICAgc2NyaXB0LnR5cGUgPSAndGV4dC9qYXZhc2NyaXB0JztcbiAgICBzY3JpcHQuc3JjICA9IEZheWUuVVJJLnN0cmluZ2lmeShlbmRwb2ludCk7XG4gICAgaGVhZC5hcHBlbmRDaGlsZChzY3JpcHQpO1xuXG4gICAgc2NyaXB0Lm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgIGNsZWFudXAoKTtcbiAgICAgIHNlbGYuX2hhbmRsZUVycm9yKG1lc3NhZ2VzKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHthYm9ydDogY2xlYW51cH07XG4gIH1cbn0pLCB7XG4gIF9jYkNvdW50OiAwLFxuXG4gIGdldENhbGxiYWNrTmFtZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fY2JDb3VudCArPSAxO1xuICAgIHJldHVybiAnX19qc29ucCcgKyB0aGlzLl9jYkNvdW50ICsgJ19fJztcbiAgfSxcblxuICBpc1VzYWJsZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgY2FsbGJhY2suY2FsbChjb250ZXh0LCB0cnVlKTtcbiAgfVxufSk7XG5cbkZheWUuVHJhbnNwb3J0LnJlZ2lzdGVyKCdjYWxsYmFjay1wb2xsaW5nJywgRmF5ZS5UcmFuc3BvcnQuSlNPTlApO1xuXG59KSgpOyIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhbiBgQXJyYXlgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDAuMS4wXG4gKiBAdHlwZSB7RnVuY3Rpb259XG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNBcnJheShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcnJheShkb2N1bWVudC5ib2R5LmNoaWxkcmVuKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc0FycmF5KCdhYmMnKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc0FycmF5KF8ubm9vcCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheTtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbihmdW5jdGlvbiAoKSB7XG4gIHRyeSB7XG4gICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGlzIG5vdCBkZWZpbmVkJyk7XG4gICAgfVxuICB9XG4gIHRyeSB7XG4gICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaXMgbm90IGRlZmluZWQnKTtcbiAgICB9XG4gIH1cbn0gKCkpXG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBjYWNoZWRTZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjYWNoZWRDbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIl19
