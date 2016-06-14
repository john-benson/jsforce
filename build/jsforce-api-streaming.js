(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Streaming = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Streaming APIs
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var events = window.jsforce.require('events'),
    inherits = window.jsforce.require('inherits'),
    _ = window.jsforce.require('lodash/core'),
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
  var isArray = _.isArray(events);
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

},{"faye":2}],2:[function(require,module,exports){
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

},{"_process":3}],3:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL3N0cmVhbWluZy5qcyIsIm5vZGVfbW9kdWxlcy9mYXllL2Jyb3dzZXIvZmF5ZS1icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDck1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNydEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcclxuICogQGZpbGUgTWFuYWdlcyBTdHJlYW1pbmcgQVBJc1xyXG4gKiBAYXV0aG9yIFNoaW5pY2hpIFRvbWl0YSA8c2hpbmljaGkudG9taXRhQGdtYWlsLmNvbT5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgZXZlbnRzID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnZXZlbnRzJyksXHJcbiAgICBpbmhlcml0cyA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJ2luaGVyaXRzJyksXHJcbiAgICBfID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnbG9kYXNoL2NvcmUnKSxcclxuICAgIEZheWUgICA9IHJlcXVpcmUoJ2ZheWUnKSxcclxuICAgIGpzZm9yY2UgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCcuL2NvcmUnKTtcclxuXHJcbi8qKlxyXG4gKiBTdHJlYW1pbmcgQVBJIHRvcGljIGNsYXNzXHJcbiAqXHJcbiAqIEBjbGFzcyBTdHJlYW1pbmd+VG9waWNcclxuICogQHBhcmFtIHtTdHJlYW1pbmd9IHN0ZWFtaW5nIC0gU3RyZWFtaW5nIEFQSSBvYmplY3RcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBUb3BpYyBuYW1lXHJcbiAqL1xyXG52YXIgVG9waWMgPSBmdW5jdGlvbihzdHJlYW1pbmcsIG5hbWUpIHtcclxuICB0aGlzLl9zdHJlYW1pbmcgPSBzdHJlYW1pbmc7XHJcbiAgdGhpcy5uYW1lID0gbmFtZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBTdHJlYW1pbmd+U3RyZWFtaW5nTWVzc2FnZVxyXG4gKiBAcHJvcCB7T2JqZWN0fSBldmVudFxyXG4gKiBAcHJvcCB7T2JqZWN0fSBldmVudC50eXBlIC0gRXZlbnQgdHlwZVxyXG4gKiBAcHJvcCB7UmVjb3JkfSBzb2JqZWN0IC0gUmVjb3JkIGluZm9ybWF0aW9uXHJcbiAqL1xyXG4vKipcclxuICogU3Vic2NyaWJlIGxpc3RlbmVyIHRvIHRvcGljXHJcbiAqXHJcbiAqIEBtZXRob2QgU3RyZWFtaW5nflRvcGljI3N1YnNjcmliZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxTdHJlYW1pbmd+U3RyZWFtaW5nTWVzYXNnZT59IGxpc3RlbmVyIC0gU3RyZWFtaW5nIG1lc3NhZ2UgbGlzdGVuZXJcclxuICogQHJldHVybnMge1N1YnNjcmlwdGlvbn0gLSBGYXllIHN1YnNjcmlwdGlvbiBvYmplY3RcclxuICovXHJcblRvcGljLnByb3RvdHlwZS5zdWJzY3JpYmUgPSBmdW5jdGlvbihsaXN0ZW5lcikge1xyXG4gIHJldHVybiB0aGlzLl9zdHJlYW1pbmcuc3Vic2NyaWJlKHRoaXMubmFtZSwgbGlzdGVuZXIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFVuc3Vic2NyaWJlIGxpc3RlbmVyIGZyb20gdG9waWNcclxuICpcclxuICogQG1ldGhvZCBTdHJlYW1pbmd+VG9waWMjdW5zdWJzY3JpYmVcclxuICogQHBhcmFtIHtDYWxsYmFjay48U3RyZWFtaW5nflN0cmVhbWluZ01lc2FzZ2U+fSBsaXN0ZW5lciAtIFN0cmVhbWluZyBtZXNzYWdlIGxpc3RlbmVyXHJcbiAqIEByZXR1cm5zIHtTdHJlYW1pbmd+VG9waWN9XHJcbiAqL1xyXG5Ub3BpYy5wcm90b3R5cGUudW5zdWJzY3JpYmUgPSBmdW5jdGlvbihsaXN0ZW5lcikge1xyXG4gIHRoaXMuX3N0cmVhbWluZy51bnN1YnNjcmliZSh0aGlzLm5hbWUsIGxpc3RlbmVyKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG5cclxuLyoqXHJcbiAqIFN0cmVhbWluZyBBUEkgR2VuZXJpYyBTdHJlYW1pbmcgQ2hhbm5lbFxyXG4gKlxyXG4gKiBAY2xhc3MgU3RyZWFtaW5nfkNoYW5uZWxcclxuICogQHBhcmFtIHtTdHJlYW1pbmd9IHN0ZWFtaW5nIC0gU3RyZWFtaW5nIEFQSSBvYmplY3RcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBDaGFubmVsIG5hbWUgKHN0YXJ0cyB3aXRoIFwiL3UvXCIpXHJcbiAqL1xyXG52YXIgQ2hhbm5lbCA9IGZ1bmN0aW9uKHN0cmVhbWluZywgbmFtZSkge1xyXG4gIHRoaXMuX3N0cmVhbWluZyA9IHN0cmVhbWluZztcclxuICB0aGlzLl9uYW1lID0gbmFtZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTdWJzY3JpYmUgdG8gaGFubmVsXHJcbiAqXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFN0cmVhbWluZ35TdHJlYW1pbmdNZXNzYWdlPn0gbGlzdGVuZXIgLSBTdHJlYW1pbmcgbWVzc2FnZSBsaXN0ZW5lclxyXG4gKiBAcmV0dXJucyB7U3Vic2NyaXB0aW9ufSAtIEZheWUgc3Vic2NyaXB0aW9uIG9iamVjdFxyXG4gKi9cclxuQ2hhbm5lbC5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24obGlzdGVuZXIpIHtcclxuICByZXR1cm4gdGhpcy5fc3RyZWFtaW5nLnN1YnNjcmliZSh0aGlzLl9uYW1lLCBsaXN0ZW5lcik7XHJcbn07XHJcblxyXG5DaGFubmVsLnByb3RvdHlwZS51bnN1YnNjcmliZSA9IGZ1bmN0aW9uKGxpc3RlbmVyKSB7XHJcbiAgdGhpcy5fc3RyZWFtaW5nLnVuc3Vic2NyaWJlKHRoaXMuX25hbWUsIGxpc3RlbmVyKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbkNoYW5uZWwucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbihldmVudHMsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIGlzQXJyYXkgPSBfLmlzQXJyYXkoZXZlbnRzKTtcclxuICBldmVudHMgPSBpc0FycmF5ID8gZXZlbnRzIDogWyBldmVudHMgXTtcclxuICB2YXIgY29ubiA9IHRoaXMuX3N0cmVhbWluZy5fY29ubjtcclxuICBpZiAoIXRoaXMuX2lkKSB7XHJcbiAgICB0aGlzLl9pZCA9IGNvbm4uc29iamVjdCgnU3RyZWFtaW5nQ2hhbm5lbCcpLmZpbmRPbmUoeyBOYW1lOiB0aGlzLl9uYW1lIH0sICdJZCcpXHJcbiAgICAgIC50aGVuKGZ1bmN0aW9uKHJlYykgeyByZXR1cm4gcmVjLklkIH0pO1xyXG4gIH1cclxuICByZXR1cm4gdGhpcy5faWQudGhlbihmdW5jdGlvbihpZCkge1xyXG4gICAgdmFyIGNoYW5uZWxVcmwgPSAnL3NvYmplY3RzL1N0cmVhbWluZ0NoYW5uZWwvJyArIGlkICsgJy9wdXNoJztcclxuICAgIHJldHVybiBjb25uLnJlcXVlc3RQb3N0KGNoYW5uZWxVcmwsIHsgcHVzaEV2ZW50czogZXZlbnRzIH0pO1xyXG4gIH0pLnRoZW4oZnVuY3Rpb24ocmV0cykge1xyXG4gICAgcmV0dXJuIGlzQXJyYXkgPyByZXRzIDogcmV0c1swXTtcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbi8qKlxyXG4gKiBTdHJlYW1pbmcgQVBJIGNsYXNzXHJcbiAqXHJcbiAqIEBjbGFzc1xyXG4gKiBAZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyXHJcbiAqIEBwYXJhbSB7Q29ubmVjdGlvbn0gY29ubiAtIENvbm5lY3Rpb24gb2JqZWN0XHJcbiAqL1xyXG52YXIgU3RyZWFtaW5nID0gZnVuY3Rpb24oY29ubikge1xyXG4gIHRoaXMuX2Nvbm4gPSBjb25uO1xyXG59O1xyXG5cclxuaW5oZXJpdHMoU3RyZWFtaW5nLCBldmVudHMuRXZlbnRFbWl0dGVyKTtcclxuXHJcbi8qKiBAcHJpdmF0ZSAqKi9cclxuU3RyZWFtaW5nLnByb3RvdHlwZS5fY3JlYXRlQ2xpZW50ID0gZnVuY3Rpb24ocmVwbGF5KSB7XHJcbiAgdmFyIGVuZHBvaW50VXJsID0gWyB0aGlzLl9jb25uLmluc3RhbmNlVXJsLCBcImNvbWV0ZFwiICsgKHJlcGxheSA/IFwiL3JlcGxheVwiIDogXCJcIiksIHRoaXMuX2Nvbm4udmVyc2lvbiBdLmpvaW4oJy8nKTtcclxuICB2YXIgZmF5ZUNsaWVudCA9IG5ldyBGYXllLkNsaWVudChlbmRwb2ludFVybCwge30pO1xyXG4gIGZheWVDbGllbnQuc2V0SGVhZGVyKCdBdXRob3JpemF0aW9uJywgJ09BdXRoICcrdGhpcy5fY29ubi5hY2Nlc3NUb2tlbik7XHJcbiAgcmV0dXJuIGZheWVDbGllbnQ7XHJcbn07XHJcblxyXG4vKiogQHByaXZhdGUgKiovXHJcblN0cmVhbWluZy5wcm90b3R5cGUuX2dldEZheWVDbGllbnQgPSBmdW5jdGlvbihjaGFubmVsTmFtZSkge1xyXG4gIHZhciBpc0dlbmVyaWMgPSBjaGFubmVsTmFtZS5pbmRleE9mKCcvdS8nKSA9PT0gMDtcclxuICB2YXIgY2xpZW50VHlwZSA9IGlzR2VuZXJpYyA/ICdnZW5lcmljJyA6ICdwdXNoVG9waWMnO1xyXG4gIGlmICghdGhpcy5fZmF5ZUNsaWVudHMgfHwgIXRoaXMuX2ZheWVDbGllbnRzW2NsaWVudFR5cGVdKSB7XHJcbiAgICB0aGlzLl9mYXllQ2xpZW50cyA9IHRoaXMuX2ZheWVDbGllbnRzIHx8IHt9O1xyXG4gICAgdGhpcy5fZmF5ZUNsaWVudHNbY2xpZW50VHlwZV0gPSB0aGlzLl9jcmVhdGVDbGllbnQoaXNHZW5lcmljKTtcclxuICAgIGlmIChGYXllLlRyYW5zcG9ydC5Ob2RlSHR0cCkge1xyXG4gICAgICBGYXllLlRyYW5zcG9ydC5Ob2RlSHR0cC5wcm90b3R5cGUuYmF0Y2hpbmcgPSBmYWxzZTsgLy8gcHJldmVudCBzdHJlYW1pbmcgQVBJIHNlcnZlciBlcnJvclxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gdGhpcy5fZmF5ZUNsaWVudHNbY2xpZW50VHlwZV07XHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIEdldCBuYW1lZCB0b3BpY1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAtIFRvcGljIG5hbWVcclxuICogQHJldHVybnMge1N0cmVhbWluZ35Ub3BpY31cclxuICovXHJcblN0cmVhbWluZy5wcm90b3R5cGUudG9waWMgPSBmdW5jdGlvbihuYW1lKSB7XHJcbiAgdGhpcy5fdG9waWNzID0gdGhpcy5fdG9waWNzIHx8IHt9O1xyXG4gIHZhciB0b3BpYyA9IHRoaXMuX3RvcGljc1tuYW1lXSA9XHJcbiAgICB0aGlzLl90b3BpY3NbbmFtZV0gfHwgbmV3IFRvcGljKHRoaXMsIG5hbWUpO1xyXG4gIHJldHVybiB0b3BpYztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXQgQ2hhbm5lbCBmb3IgSWRcclxuICogQHBhcmFtIHtTdHJpbmd9IGNoYW5uZWxJZCAtIElkIG9mIFN0cmVhbWluZ0NoYW5uZWwgb2JqZWN0XHJcbiAqIEByZXR1cm5zIHtTdHJlYW1pbmd+Q2hhbm5lbH1cclxuICovXHJcblN0cmVhbWluZy5wcm90b3R5cGUuY2hhbm5lbCA9IGZ1bmN0aW9uKGNoYW5uZWxJZCkge1xyXG4gIHJldHVybiBuZXcgQ2hhbm5lbCh0aGlzLCBjaGFubmVsSWQpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFN1YnNjcmliZSB0b3BpYy9jaGFubmVsXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gVG9waWMgbmFtZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxTdHJlYW1pbmd+U3RyZWFtaW5nTWVzc2FnZT59IGxpc3RlbmVyIC0gU3RyZWFtaW5nIG1lc3NhZ2UgbGlzdGVuZXJcclxuICogQHJldHVybnMge1N1YnNjcmlwdGlvbn0gLSBGYXllIHN1YnNjcmlwdGlvbiBvYmplY3RcclxuICovXHJcblN0cmVhbWluZy5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24obmFtZSwgbGlzdGVuZXIpIHtcclxuICB2YXIgY2hhbm5lbE5hbWUgPSBuYW1lLmluZGV4T2YoJy8nKSA9PT0gMCA/IG5hbWUgOiAnL3RvcGljLycgKyBuYW1lO1xyXG4gIHZhciBmYXllQ2xpZW50ID0gdGhpcy5fZ2V0RmF5ZUNsaWVudChjaGFubmVsTmFtZSk7XHJcbiAgcmV0dXJuIGZheWVDbGllbnQuc3Vic2NyaWJlKGNoYW5uZWxOYW1lLCBsaXN0ZW5lcik7XHJcbn07XHJcblxyXG4vKipcclxuICogVW5zdWJzY3JpYmUgdG9waWNcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBUb3BpYyBuYW1lXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFN0cmVhbWluZ35TdHJlYW1pbmdNZXNzYWdlPn0gbGlzdGVuZXIgLSBTdHJlYW1pbmcgbWVzc2FnZSBsaXN0ZW5lclxyXG4gKiBAcmV0dXJucyB7U3RyZWFtaW5nfVxyXG4gKi9cclxuU3RyZWFtaW5nLnByb3RvdHlwZS51bnN1YnNjcmliZSA9IGZ1bmN0aW9uKG5hbWUsIGxpc3RlbmVyKSB7XHJcbiAgdmFyIGNoYW5uZWxOYW1lID0gbmFtZS5pbmRleE9mKCcvJykgPT09IDAgPyBuYW1lIDogJy90b3BpYy8nICsgbmFtZTtcclxuICB2YXIgZmF5ZUNsaWVudCA9IHRoaXMuX2dldEZheWVDbGllbnQoY2hhbm5lbE5hbWUpO1xyXG4gIGZheWVDbGllbnQudW5zdWJzY3JpYmUoY2hhbm5lbE5hbWUsIGxpc3RlbmVyKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLypcclxuICogUmVnaXN0ZXIgaG9vayBpbiBjb25uZWN0aW9uIGluc3RhbnRpYXRpb24gZm9yIGR5bmFtaWNhbGx5IGFkZGluZyB0aGlzIEFQSSBtb2R1bGUgZmVhdHVyZXNcclxuICovXHJcbmpzZm9yY2Uub24oJ2Nvbm5lY3Rpb246bmV3JywgZnVuY3Rpb24oY29ubikge1xyXG4gIGNvbm4uc3RyZWFtaW5nID0gbmV3IFN0cmVhbWluZyhjb25uKTtcclxufSk7XHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTdHJlYW1pbmc7XHJcbiIsIihmdW5jdGlvbigpIHtcbid1c2Ugc3RyaWN0JztcblxudmFyIEZheWUgPSB7XG4gIFZFUlNJT046ICAgICAgICAgICcxLjEuMicsXG5cbiAgQkFZRVVYX1ZFUlNJT046ICAgJzEuMCcsXG4gIElEX0xFTkdUSDogICAgICAgIDE2MCxcbiAgSlNPTlBfQ0FMTEJBQ0s6ICAgJ2pzb25wY2FsbGJhY2snLFxuICBDT05ORUNUSU9OX1RZUEVTOiBbJ2xvbmctcG9sbGluZycsICdjcm9zcy1vcmlnaW4tbG9uZy1wb2xsaW5nJywgJ2NhbGxiYWNrLXBvbGxpbmcnLCAnd2Vic29ja2V0JywgJ2V2ZW50c291cmNlJywgJ2luLXByb2Nlc3MnXSxcblxuICBNQU5EQVRPUllfQ09OTkVDVElPTl9UWVBFUzogWydsb25nLXBvbGxpbmcnLCAnY2FsbGJhY2stcG9sbGluZycsICdpbi1wcm9jZXNzJ10sXG5cbiAgRU5WOiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93IDogZ2xvYmFsLFxuXG4gIGV4dGVuZDogZnVuY3Rpb24oZGVzdCwgc291cmNlLCBvdmVyd3JpdGUpIHtcbiAgICBpZiAoIXNvdXJjZSkgcmV0dXJuIGRlc3Q7XG4gICAgZm9yICh2YXIga2V5IGluIHNvdXJjZSkge1xuICAgICAgaWYgKCFzb3VyY2UuaGFzT3duUHJvcGVydHkoa2V5KSkgY29udGludWU7XG4gICAgICBpZiAoZGVzdC5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIG92ZXJ3cml0ZSA9PT0gZmFsc2UpIGNvbnRpbnVlO1xuICAgICAgaWYgKGRlc3Rba2V5XSAhPT0gc291cmNlW2tleV0pXG4gICAgICAgIGRlc3Rba2V5XSA9IHNvdXJjZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGVzdDtcbiAgfSxcblxuICByYW5kb206IGZ1bmN0aW9uKGJpdGxlbmd0aCkge1xuICAgIGJpdGxlbmd0aCA9IGJpdGxlbmd0aCB8fCB0aGlzLklEX0xFTkdUSDtcbiAgICB2YXIgbWF4TGVuZ3RoID0gTWF0aC5jZWlsKGJpdGxlbmd0aCAqIE1hdGgubG9nKDIpIC8gTWF0aC5sb2coMzYpKTtcbiAgICB2YXIgc3RyaW5nID0gY3Nwcm5nKGJpdGxlbmd0aCwgMzYpO1xuICAgIHdoaWxlIChzdHJpbmcubGVuZ3RoIDwgbWF4TGVuZ3RoKSBzdHJpbmcgPSAnMCcgKyBzdHJpbmc7XG4gICAgcmV0dXJuIHN0cmluZztcbiAgfSxcblxuICB2YWxpZGF0ZU9wdGlvbnM6IGZ1bmN0aW9uKG9wdGlvbnMsIHZhbGlkS2V5cykge1xuICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAodGhpcy5pbmRleE9mKHZhbGlkS2V5cywga2V5KSA8IDApXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5yZWNvZ25pemVkIG9wdGlvbjogJyArIGtleSk7XG4gICAgfVxuICB9LFxuXG4gIGNsaWVudElkRnJvbU1lc3NhZ2VzOiBmdW5jdGlvbihtZXNzYWdlcykge1xuICAgIHZhciBjb25uZWN0ID0gdGhpcy5maWx0ZXIoW10uY29uY2F0KG1lc3NhZ2VzKSwgZnVuY3Rpb24obWVzc2FnZSkge1xuICAgICAgcmV0dXJuIG1lc3NhZ2UuY2hhbm5lbCA9PT0gJy9tZXRhL2Nvbm5lY3QnO1xuICAgIH0pO1xuICAgIHJldHVybiBjb25uZWN0WzBdICYmIGNvbm5lY3RbMF0uY2xpZW50SWQ7XG4gIH0sXG5cbiAgY29weU9iamVjdDogZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgdmFyIGNsb25lLCBpLCBrZXk7XG4gICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBjbG9uZSA9IFtdO1xuICAgICAgaSA9IG9iamVjdC5sZW5ndGg7XG4gICAgICB3aGlsZSAoaS0tKSBjbG9uZVtpXSA9IEZheWUuY29weU9iamVjdChvYmplY3RbaV0pO1xuICAgICAgcmV0dXJuIGNsb25lO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNsb25lID0gKG9iamVjdCA9PT0gbnVsbCkgPyBudWxsIDoge307XG4gICAgICBmb3IgKGtleSBpbiBvYmplY3QpIGNsb25lW2tleV0gPSBGYXllLmNvcHlPYmplY3Qob2JqZWN0W2tleV0pO1xuICAgICAgcmV0dXJuIGNsb25lO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH1cbiAgfSxcblxuICBjb21tb25FbGVtZW50OiBmdW5jdGlvbihsaXN0YSwgbGlzdGIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IGxpc3RhLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgaWYgKHRoaXMuaW5kZXhPZihsaXN0YiwgbGlzdGFbaV0pICE9PSAtMSlcbiAgICAgICAgcmV0dXJuIGxpc3RhW2ldO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfSxcblxuICBpbmRleE9mOiBmdW5jdGlvbihsaXN0LCBuZWVkbGUpIHtcbiAgICBpZiAobGlzdC5pbmRleE9mKSByZXR1cm4gbGlzdC5pbmRleE9mKG5lZWRsZSk7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IGxpc3QubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbmVlZGxlKSByZXR1cm4gaTtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xuICB9LFxuXG4gIG1hcDogZnVuY3Rpb24ob2JqZWN0LCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGlmIChvYmplY3QubWFwKSByZXR1cm4gb2JqZWN0Lm1hcChjYWxsYmFjaywgY29udGV4dCk7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuXG4gICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbiA9IG9iamVjdC5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgcmVzdWx0LnB1c2goY2FsbGJhY2suY2FsbChjb250ZXh0IHx8IG51bGwsIG9iamVjdFtpXSwgaSkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmICghb2JqZWN0Lmhhc093blByb3BlcnR5KGtleSkpIGNvbnRpbnVlO1xuICAgICAgICByZXN1bHQucHVzaChjYWxsYmFjay5jYWxsKGNvbnRleHQgfHwgbnVsbCwga2V5LCBvYmplY3Rba2V5XSkpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuXG4gIGZpbHRlcjogZnVuY3Rpb24oYXJyYXksIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgaWYgKGFycmF5LmZpbHRlcikgcmV0dXJuIGFycmF5LmZpbHRlcihjYWxsYmFjaywgY29udGV4dCk7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBuID0gYXJyYXkubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICBpZiAoY2FsbGJhY2suY2FsbChjb250ZXh0IHx8IG51bGwsIGFycmF5W2ldLCBpKSlcbiAgICAgICAgcmVzdWx0LnB1c2goYXJyYXlbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuXG4gIGFzeW5jRWFjaDogZnVuY3Rpb24obGlzdCwgaXRlcmF0b3IsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdmFyIG4gICAgICAgPSBsaXN0Lmxlbmd0aCxcbiAgICAgICAgaSAgICAgICA9IC0xLFxuICAgICAgICBjYWxscyAgID0gMCxcbiAgICAgICAgbG9vcGluZyA9IGZhbHNlO1xuXG4gICAgdmFyIGl0ZXJhdGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIGNhbGxzIC09IDE7XG4gICAgICBpICs9IDE7XG4gICAgICBpZiAoaSA9PT0gbikgcmV0dXJuIGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoY29udGV4dCk7XG4gICAgICBpdGVyYXRvcihsaXN0W2ldLCByZXN1bWUpO1xuICAgIH07XG5cbiAgICB2YXIgbG9vcCA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGxvb3BpbmcpIHJldHVybjtcbiAgICAgIGxvb3BpbmcgPSB0cnVlO1xuICAgICAgd2hpbGUgKGNhbGxzID4gMCkgaXRlcmF0ZSgpO1xuICAgICAgbG9vcGluZyA9IGZhbHNlO1xuICAgIH07XG5cbiAgICB2YXIgcmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgICBjYWxscyArPSAxO1xuICAgICAgbG9vcCgpO1xuICAgIH07XG4gICAgcmVzdW1lKCk7XG4gIH0sXG5cbiAgLy8gaHR0cDovL2Fzc2Fua2EubmV0L2NvbnRlbnQvdGVjaC8yMDA5LzA5LzAyL2pzb24yLWpzLXZzLXByb3RvdHlwZS9cbiAgdG9KU09OOiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICBpZiAoIXRoaXMuc3RyaW5naWZ5KSByZXR1cm4gSlNPTi5zdHJpbmdpZnkob2JqZWN0KTtcblxuICAgIHJldHVybiB0aGlzLnN0cmluZ2lmeShvYmplY3QsIGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgIHJldHVybiAodGhpc1trZXldIGluc3RhbmNlb2YgQXJyYXkpID8gdGhpc1trZXldIDogdmFsdWU7XG4gICAgfSk7XG4gIH1cbn07XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJylcbiAgbW9kdWxlLmV4cG9ydHMgPSBGYXllO1xuZWxzZSBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpXG4gIHdpbmRvdy5GYXllID0gRmF5ZTtcblxuRmF5ZS5DbGFzcyA9IGZ1bmN0aW9uKHBhcmVudCwgbWV0aG9kcykge1xuICBpZiAodHlwZW9mIHBhcmVudCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIG1ldGhvZHMgPSBwYXJlbnQ7XG4gICAgcGFyZW50ICA9IE9iamVjdDtcbiAgfVxuXG4gIHZhciBrbGFzcyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5pbml0aWFsaXplKSByZXR1cm4gdGhpcztcbiAgICByZXR1cm4gdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfHwgdGhpcztcbiAgfTtcblxuICB2YXIgYnJpZGdlID0gZnVuY3Rpb24oKSB7fTtcbiAgYnJpZGdlLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7XG5cbiAga2xhc3MucHJvdG90eXBlID0gbmV3IGJyaWRnZSgpO1xuICBGYXllLmV4dGVuZChrbGFzcy5wcm90b3R5cGUsIG1ldGhvZHMpO1xuXG4gIHJldHVybiBrbGFzcztcbn07XG5cbihmdW5jdGlvbigpIHtcbnZhciBFdmVudEVtaXR0ZXIgPSBGYXllLkV2ZW50RW1pdHRlciA9IGZ1bmN0aW9uKCkge307XG5cbi8qXG5Db3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHkgb2ZcbnRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW5cbnRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG9cbnVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzXG5vZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG9cbnNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG5jb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG5TT0ZUV0FSRS5cbiovXG5cbnZhciBpc0FycmF5ID0gdHlwZW9mIEFycmF5LmlzQXJyYXkgPT09ICdmdW5jdGlvbidcbiAgICA/IEFycmF5LmlzQXJyYXlcbiAgICA6IGZ1bmN0aW9uICh4cykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICAgIH1cbjtcbmZ1bmN0aW9uIGluZGV4T2YgKHhzLCB4KSB7XG4gICAgaWYgKHhzLmluZGV4T2YpIHJldHVybiB4cy5pbmRleE9mKHgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHggPT09IHhzW2ldKSByZXR1cm4gaTtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xufVxuXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzQXJyYXkodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpXG4gICAge1xuICAgICAgaWYgKGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGFyZ3VtZW50c1sxXTsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0LCB1bnNwZWNpZmllZCAnZXJyb3InIGV2ZW50LlwiKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMuX2V2ZW50cykgcmV0dXJuIGZhbHNlO1xuICB2YXIgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgaWYgKCFoYW5kbGVyKSByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09ICdmdW5jdGlvbicpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2UgaWYgKGlzQXJyYXkoaGFuZGxlcikpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cbiAgICB2YXIgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxuLy8gRXZlbnRFbWl0dGVyIGlzIGRlZmluZWQgaW4gc3JjL25vZGVfZXZlbnRzLmNjXG4vLyBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQoKSBpcyBhbHNvIGRlZmluZWQgdGhlcmUuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCdmdW5jdGlvbicgIT09IHR5cGVvZiBsaXN0ZW5lcikge1xuICAgIHRocm93IG5ldyBFcnJvcignYWRkTGlzdGVuZXIgb25seSB0YWtlcyBpbnN0YW5jZXMgb2YgRnVuY3Rpb24nKTtcbiAgfVxuXG4gIGlmICghdGhpcy5fZXZlbnRzKSB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09IFwibmV3TGlzdGVuZXJzXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyc1wiLlxuICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB7XG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIH0gZWxzZSBpZiAoaXNBcnJheSh0aGlzLl9ldmVudHNbdHlwZV0pKSB7XG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcl07XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYub24odHlwZSwgZnVuY3Rpb24gZygpIHtcbiAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH0pO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICgnZnVuY3Rpb24nICE9PSB0eXBlb2YgbGlzdGVuZXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlbW92ZUxpc3RlbmVyIG9ubHkgdGFrZXMgaW5zdGFuY2VzIG9mIEZ1bmN0aW9uJyk7XG4gIH1cblxuICAvLyBkb2VzIG5vdCB1c2UgbGlzdGVuZXJzKCksIHNvIG5vIHNpZGUgZWZmZWN0IG9mIGNyZWF0aW5nIF9ldmVudHNbdHlwZV1cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSkgcmV0dXJuIHRoaXM7XG5cbiAgdmFyIGxpc3QgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzQXJyYXkobGlzdCkpIHtcbiAgICB2YXIgaSA9IGluZGV4T2YobGlzdCwgbGlzdGVuZXIpO1xuICAgIGlmIChpIDwgMCkgcmV0dXJuIHRoaXM7XG4gICAgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09IDApXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICB9IGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSA9PT0gbGlzdGVuZXIpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIGRvZXMgbm90IHVzZSBsaXN0ZW5lcnMoKSwgc28gbm8gc2lkZSBlZmZlY3Qgb2YgY3JlYXRpbmcgX2V2ZW50c1t0eXBlXVxuICBpZiAodHlwZSAmJiB0aGlzLl9ldmVudHMgJiYgdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBudWxsO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICBpZiAoIXRoaXMuX2V2ZW50cykgdGhpcy5fZXZlbnRzID0ge307XG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSB0aGlzLl9ldmVudHNbdHlwZV0gPSBbXTtcbiAgaWYgKCFpc0FycmF5KHRoaXMuX2V2ZW50c1t0eXBlXSkpIHtcbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgfVxuICByZXR1cm4gdGhpcy5fZXZlbnRzW3R5cGVdO1xufTtcblxufSkoKTtcblxuRmF5ZS5OYW1lc3BhY2UgPSBGYXllLkNsYXNzKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fdXNlZCA9IHt9O1xuICB9LFxuXG4gIGV4aXN0czogZnVuY3Rpb24oaWQpIHtcbiAgICByZXR1cm4gdGhpcy5fdXNlZC5oYXNPd25Qcm9wZXJ0eShpZCk7XG4gIH0sXG5cbiAgZ2VuZXJhdGU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBuYW1lID0gRmF5ZS5yYW5kb20oKTtcbiAgICB3aGlsZSAodGhpcy5fdXNlZC5oYXNPd25Qcm9wZXJ0eShuYW1lKSlcbiAgICAgIG5hbWUgPSBGYXllLnJhbmRvbSgpO1xuICAgIHJldHVybiB0aGlzLl91c2VkW25hbWVdID0gbmFtZTtcbiAgfSxcblxuICByZWxlYXNlOiBmdW5jdGlvbihpZCkge1xuICAgIGRlbGV0ZSB0aGlzLl91c2VkW2lkXTtcbiAgfVxufSk7XG5cbihmdW5jdGlvbigpIHtcbid1c2Ugc3RyaWN0JztcblxudmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0LCBkZWZlcjtcblxuaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicpXG4gIGRlZmVyID0gZnVuY3Rpb24oZm4pIHsgc2V0SW1tZWRpYXRlKGZuKSB9O1xuZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgPT09ICdvYmplY3QnICYmIHByb2Nlc3MubmV4dFRpY2spXG4gIGRlZmVyID0gZnVuY3Rpb24oZm4pIHsgcHJvY2Vzcy5uZXh0VGljayhmbikgfTtcbmVsc2VcbiAgZGVmZXIgPSBmdW5jdGlvbihmbikgeyB0aW1lb3V0KGZuLCAwKSB9O1xuXG52YXIgUEVORElORyAgID0gMCxcbiAgICBGVUxGSUxMRUQgPSAxLFxuICAgIFJFSkVDVEVEICA9IDI7XG5cbnZhciBSRVRVUk4gPSBmdW5jdGlvbih4KSB7IHJldHVybiB4IH0sXG4gICAgVEhST1cgID0gZnVuY3Rpb24oeCkgeyB0aHJvdyAgeCB9O1xuXG52YXIgUHJvbWlzZSA9IGZ1bmN0aW9uKHRhc2spIHtcbiAgdGhpcy5fc3RhdGUgICAgICAgPSBQRU5ESU5HO1xuICB0aGlzLl9vbkZ1bGZpbGxlZCA9IFtdO1xuICB0aGlzLl9vblJlamVjdGVkICA9IFtdO1xuXG4gIGlmICh0eXBlb2YgdGFzayAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuO1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdGFzayhmdW5jdGlvbih2YWx1ZSkgIHsgZnVsZmlsbChzZWxmLCB2YWx1ZSkgfSxcbiAgICAgICBmdW5jdGlvbihyZWFzb24pIHsgcmVqZWN0KHNlbGYsIHJlYXNvbikgfSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24ob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQpIHtcbiAgdmFyIG5leHQgPSBuZXcgUHJvbWlzZSgpO1xuICByZWdpc3Rlck9uRnVsZmlsbGVkKHRoaXMsIG9uRnVsZmlsbGVkLCBuZXh0KTtcbiAgcmVnaXN0ZXJPblJlamVjdGVkKHRoaXMsIG9uUmVqZWN0ZWQsIG5leHQpO1xuICByZXR1cm4gbmV4dDtcbn07XG5cbnZhciByZWdpc3Rlck9uRnVsZmlsbGVkID0gZnVuY3Rpb24ocHJvbWlzZSwgb25GdWxmaWxsZWQsIG5leHQpIHtcbiAgaWYgKHR5cGVvZiBvbkZ1bGZpbGxlZCAhPT0gJ2Z1bmN0aW9uJykgb25GdWxmaWxsZWQgPSBSRVRVUk47XG4gIHZhciBoYW5kbGVyID0gZnVuY3Rpb24odmFsdWUpIHsgaW52b2tlKG9uRnVsZmlsbGVkLCB2YWx1ZSwgbmV4dCkgfTtcblxuICBpZiAocHJvbWlzZS5fc3RhdGUgPT09IFBFTkRJTkcpIHtcbiAgICBwcm9taXNlLl9vbkZ1bGZpbGxlZC5wdXNoKGhhbmRsZXIpO1xuICB9IGVsc2UgaWYgKHByb21pc2UuX3N0YXRlID09PSBGVUxGSUxMRUQpIHtcbiAgICBoYW5kbGVyKHByb21pc2UuX3ZhbHVlKTtcbiAgfVxufTtcblxudmFyIHJlZ2lzdGVyT25SZWplY3RlZCA9IGZ1bmN0aW9uKHByb21pc2UsIG9uUmVqZWN0ZWQsIG5leHQpIHtcbiAgaWYgKHR5cGVvZiBvblJlamVjdGVkICE9PSAnZnVuY3Rpb24nKSBvblJlamVjdGVkID0gVEhST1c7XG4gIHZhciBoYW5kbGVyID0gZnVuY3Rpb24ocmVhc29uKSB7IGludm9rZShvblJlamVjdGVkLCByZWFzb24sIG5leHQpIH07XG5cbiAgaWYgKHByb21pc2UuX3N0YXRlID09PSBQRU5ESU5HKSB7XG4gICAgcHJvbWlzZS5fb25SZWplY3RlZC5wdXNoKGhhbmRsZXIpO1xuICB9IGVsc2UgaWYgKHByb21pc2UuX3N0YXRlID09PSBSRUpFQ1RFRCkge1xuICAgIGhhbmRsZXIocHJvbWlzZS5fcmVhc29uKTtcbiAgfVxufTtcblxudmFyIGludm9rZSA9IGZ1bmN0aW9uKGZuLCB2YWx1ZSwgbmV4dCkge1xuICBkZWZlcihmdW5jdGlvbigpIHsgX2ludm9rZShmbiwgdmFsdWUsIG5leHQpIH0pO1xufTtcblxudmFyIF9pbnZva2UgPSBmdW5jdGlvbihmbiwgdmFsdWUsIG5leHQpIHtcbiAgdmFyIG91dGNvbWU7XG5cbiAgdHJ5IHtcbiAgICBvdXRjb21lID0gZm4odmFsdWUpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJldHVybiByZWplY3QobmV4dCwgZXJyb3IpO1xuICB9XG5cbiAgaWYgKG91dGNvbWUgPT09IG5leHQpIHtcbiAgICByZWplY3QobmV4dCwgbmV3IFR5cGVFcnJvcignUmVjdXJzaXZlIHByb21pc2UgY2hhaW4gZGV0ZWN0ZWQnKSk7XG4gIH0gZWxzZSB7XG4gICAgZnVsZmlsbChuZXh0LCBvdXRjb21lKTtcbiAgfVxufTtcblxudmFyIGZ1bGZpbGwgPSBQcm9taXNlLmZ1bGZpbGwgPSBQcm9taXNlLnJlc29sdmUgPSBmdW5jdGlvbihwcm9taXNlLCB2YWx1ZSkge1xuICB2YXIgY2FsbGVkID0gZmFsc2UsIHR5cGUsIHRoZW47XG5cbiAgdHJ5IHtcbiAgICB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICAgIHRoZW4gPSB2YWx1ZSAhPT0gbnVsbCAmJiAodHlwZSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlID09PSAnb2JqZWN0JykgJiYgdmFsdWUudGhlbjtcblxuICAgIGlmICh0eXBlb2YgdGhlbiAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIF9mdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcblxuICAgIHRoZW4uY2FsbCh2YWx1ZSwgZnVuY3Rpb24odikge1xuICAgICAgaWYgKCEoY2FsbGVkIF4gKGNhbGxlZCA9IHRydWUpKSkgcmV0dXJuO1xuICAgICAgZnVsZmlsbChwcm9taXNlLCB2KTtcbiAgICB9LCBmdW5jdGlvbihyKSB7XG4gICAgICBpZiAoIShjYWxsZWQgXiAoY2FsbGVkID0gdHJ1ZSkpKSByZXR1cm47XG4gICAgICByZWplY3QocHJvbWlzZSwgcik7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKCEoY2FsbGVkIF4gKGNhbGxlZCA9IHRydWUpKSkgcmV0dXJuO1xuICAgIHJlamVjdChwcm9taXNlLCBlcnJvcik7XG4gIH1cbn07XG5cbnZhciBfZnVsZmlsbCA9IGZ1bmN0aW9uKHByb21pc2UsIHZhbHVlKSB7XG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykgcmV0dXJuO1xuXG4gIHByb21pc2UuX3N0YXRlICAgICAgPSBGVUxGSUxMRUQ7XG4gIHByb21pc2UuX3ZhbHVlICAgICAgPSB2YWx1ZTtcbiAgcHJvbWlzZS5fb25SZWplY3RlZCA9IFtdO1xuXG4gIHZhciBvbkZ1bGZpbGxlZCA9IHByb21pc2UuX29uRnVsZmlsbGVkLCBmbjtcbiAgd2hpbGUgKGZuID0gb25GdWxmaWxsZWQuc2hpZnQoKSkgZm4odmFsdWUpO1xufTtcblxudmFyIHJlamVjdCA9IFByb21pc2UucmVqZWN0ID0gZnVuY3Rpb24ocHJvbWlzZSwgcmVhc29uKSB7XG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykgcmV0dXJuO1xuXG4gIHByb21pc2UuX3N0YXRlICAgICAgID0gUkVKRUNURUQ7XG4gIHByb21pc2UuX3JlYXNvbiAgICAgID0gcmVhc29uO1xuICBwcm9taXNlLl9vbkZ1bGZpbGxlZCA9IFtdO1xuXG4gIHZhciBvblJlamVjdGVkID0gcHJvbWlzZS5fb25SZWplY3RlZCwgZm47XG4gIHdoaWxlIChmbiA9IG9uUmVqZWN0ZWQuc2hpZnQoKSkgZm4ocmVhc29uKTtcbn07XG5cblByb21pc2UuYWxsID0gZnVuY3Rpb24ocHJvbWlzZXMpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKGZ1bGZpbGwsIHJlamVjdCkge1xuICAgIHZhciBsaXN0ID0gW10sXG4gICAgICAgICBuICAgPSBwcm9taXNlcy5sZW5ndGgsXG4gICAgICAgICBpO1xuXG4gICAgaWYgKG4gPT09IDApIHJldHVybiBmdWxmaWxsKGxpc3QpO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykgKGZ1bmN0aW9uKHByb21pc2UsIGkpIHtcbiAgICAgIFByb21pc2UuZnVsZmlsbGVkKHByb21pc2UpLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgbGlzdFtpXSA9IHZhbHVlO1xuICAgICAgICBpZiAoLS1uID09PSAwKSBmdWxmaWxsKGxpc3QpO1xuICAgICAgfSwgcmVqZWN0KTtcbiAgICB9KShwcm9taXNlc1tpXSwgaSk7XG4gIH0pO1xufTtcblxuUHJvbWlzZS5kZWZlciA9IGRlZmVyO1xuXG5Qcm9taXNlLmRlZmVycmVkID0gUHJvbWlzZS5wZW5kaW5nID0gZnVuY3Rpb24oKSB7XG4gIHZhciB0dXBsZSA9IHt9O1xuXG4gIHR1cGxlLnByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihmdWxmaWxsLCByZWplY3QpIHtcbiAgICB0dXBsZS5mdWxmaWxsID0gdHVwbGUucmVzb2x2ZSA9IGZ1bGZpbGw7XG4gICAgdHVwbGUucmVqZWN0ICA9IHJlamVjdDtcbiAgfSk7XG4gIHJldHVybiB0dXBsZTtcbn07XG5cblByb21pc2UuZnVsZmlsbGVkID0gUHJvbWlzZS5yZXNvbHZlZCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihmdWxmaWxsLCByZWplY3QpIHsgZnVsZmlsbCh2YWx1ZSkgfSk7XG59O1xuXG5Qcm9taXNlLnJlamVjdGVkID0gZnVuY3Rpb24ocmVhc29uKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihmdWxmaWxsLCByZWplY3QpIHsgcmVqZWN0KHJlYXNvbikgfSk7XG59O1xuXG5pZiAodHlwZW9mIEZheWUgPT09ICd1bmRlZmluZWQnKVxuICBtb2R1bGUuZXhwb3J0cyA9IFByb21pc2U7XG5lbHNlXG4gIEZheWUuUHJvbWlzZSA9IFByb21pc2U7XG5cbn0pKCk7XG5cbkZheWUuU2V0ID0gRmF5ZS5DbGFzcyh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX2luZGV4ID0ge307XG4gIH0sXG5cbiAgYWRkOiBmdW5jdGlvbihpdGVtKSB7XG4gICAgdmFyIGtleSA9IChpdGVtLmlkICE9PSB1bmRlZmluZWQpID8gaXRlbS5pZCA6IGl0ZW07XG4gICAgaWYgKHRoaXMuX2luZGV4Lmhhc093blByb3BlcnR5KGtleSkpIHJldHVybiBmYWxzZTtcbiAgICB0aGlzLl9pbmRleFtrZXldID0gaXRlbTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcblxuICBmb3JFYWNoOiBmdW5jdGlvbihibG9jaywgY29udGV4dCkge1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLl9pbmRleCkge1xuICAgICAgaWYgKHRoaXMuX2luZGV4Lmhhc093blByb3BlcnR5KGtleSkpXG4gICAgICAgIGJsb2NrLmNhbGwoY29udGV4dCwgdGhpcy5faW5kZXhba2V5XSk7XG4gICAgfVxuICB9LFxuXG4gIGlzRW1wdHk6IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLl9pbmRleCkge1xuICAgICAgaWYgKHRoaXMuX2luZGV4Lmhhc093blByb3BlcnR5KGtleSkpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgbWVtYmVyOiBmdW5jdGlvbihpdGVtKSB7XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuX2luZGV4KSB7XG4gICAgICBpZiAodGhpcy5faW5kZXhba2V5XSA9PT0gaXRlbSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSxcblxuICByZW1vdmU6IGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICB2YXIga2V5ID0gKGl0ZW0uaWQgIT09IHVuZGVmaW5lZCkgPyBpdGVtLmlkIDogaXRlbTtcbiAgICB2YXIgcmVtb3ZlZCA9IHRoaXMuX2luZGV4W2tleV07XG4gICAgZGVsZXRlIHRoaXMuX2luZGV4W2tleV07XG4gICAgcmV0dXJuIHJlbW92ZWQ7XG4gIH0sXG5cbiAgdG9BcnJheTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFycmF5ID0gW107XG4gICAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pIHsgYXJyYXkucHVzaChpdGVtKSB9KTtcbiAgICByZXR1cm4gYXJyYXk7XG4gIH1cbn0pO1xuXG5GYXllLlVSSSA9IHtcbiAgaXNVUkk6IGZ1bmN0aW9uKHVyaSkge1xuICAgIHJldHVybiB1cmkgJiYgdXJpLnByb3RvY29sICYmIHVyaS5ob3N0ICYmIHVyaS5wYXRoO1xuICB9LFxuXG4gIGlzU2FtZU9yaWdpbjogZnVuY3Rpb24odXJpKSB7XG4gICAgdmFyIGxvY2F0aW9uID0gRmF5ZS5FTlYubG9jYXRpb247XG4gICAgcmV0dXJuIHVyaS5wcm90b2NvbCA9PT0gbG9jYXRpb24ucHJvdG9jb2wgJiZcbiAgICAgICAgICAgdXJpLmhvc3RuYW1lID09PSBsb2NhdGlvbi5ob3N0bmFtZSAmJlxuICAgICAgICAgICB1cmkucG9ydCAgICAgPT09IGxvY2F0aW9uLnBvcnQ7XG4gIH0sXG5cbiAgcGFyc2U6IGZ1bmN0aW9uKHVybCkge1xuICAgIGlmICh0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykgcmV0dXJuIHVybDtcbiAgICB2YXIgdXJpID0ge30sIHBhcnRzLCBxdWVyeSwgcGFpcnMsIGksIG4sIGRhdGE7XG5cbiAgICB2YXIgY29uc3VtZSA9IGZ1bmN0aW9uKG5hbWUsIHBhdHRlcm4pIHtcbiAgICAgIHVybCA9IHVybC5yZXBsYWNlKHBhdHRlcm4sIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHVyaVtuYW1lXSA9IG1hdGNoO1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgICB9KTtcbiAgICAgIHVyaVtuYW1lXSA9IHVyaVtuYW1lXSB8fCAnJztcbiAgICB9O1xuXG4gICAgY29uc3VtZSgncHJvdG9jb2wnLCAvXlthLXpdK1xcOi9pKTtcbiAgICBjb25zdW1lKCdob3N0JywgICAgIC9eXFwvXFwvW15cXC9cXD8jXSsvKTtcblxuICAgIGlmICghL15cXC8vLnRlc3QodXJsKSAmJiAhdXJpLmhvc3QpXG4gICAgICB1cmwgPSBGYXllLkVOVi5sb2NhdGlvbi5wYXRobmFtZS5yZXBsYWNlKC9bXlxcL10qJC8sICcnKSArIHVybDtcblxuICAgIGNvbnN1bWUoJ3BhdGhuYW1lJywgL15bXlxcPyNdKi8pO1xuICAgIGNvbnN1bWUoJ3NlYXJjaCcsICAgL15cXD9bXiNdKi8pO1xuICAgIGNvbnN1bWUoJ2hhc2gnLCAgICAgL14jLiovKTtcblxuICAgIHVyaS5wcm90b2NvbCA9IHVyaS5wcm90b2NvbCB8fCBGYXllLkVOVi5sb2NhdGlvbi5wcm90b2NvbDtcblxuICAgIGlmICh1cmkuaG9zdCkge1xuICAgICAgdXJpLmhvc3QgICAgID0gdXJpLmhvc3Quc3Vic3RyKDIpO1xuICAgICAgcGFydHMgICAgICAgID0gdXJpLmhvc3Quc3BsaXQoJzonKTtcbiAgICAgIHVyaS5ob3N0bmFtZSA9IHBhcnRzWzBdO1xuICAgICAgdXJpLnBvcnQgICAgID0gcGFydHNbMV0gfHwgJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVyaS5ob3N0ICAgICA9IEZheWUuRU5WLmxvY2F0aW9uLmhvc3Q7XG4gICAgICB1cmkuaG9zdG5hbWUgPSBGYXllLkVOVi5sb2NhdGlvbi5ob3N0bmFtZTtcbiAgICAgIHVyaS5wb3J0ICAgICA9IEZheWUuRU5WLmxvY2F0aW9uLnBvcnQ7XG4gICAgfVxuXG4gICAgdXJpLnBhdGhuYW1lID0gdXJpLnBhdGhuYW1lIHx8ICcvJztcbiAgICB1cmkucGF0aCA9IHVyaS5wYXRobmFtZSArIHVyaS5zZWFyY2g7XG5cbiAgICBxdWVyeSA9IHVyaS5zZWFyY2gucmVwbGFjZSgvXlxcPy8sICcnKTtcbiAgICBwYWlycyA9IHF1ZXJ5ID8gcXVlcnkuc3BsaXQoJyYnKSA6IFtdO1xuICAgIGRhdGEgID0ge307XG5cbiAgICBmb3IgKGkgPSAwLCBuID0gcGFpcnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICBwYXJ0cyA9IHBhaXJzW2ldLnNwbGl0KCc9Jyk7XG4gICAgICBkYXRhW2RlY29kZVVSSUNvbXBvbmVudChwYXJ0c1swXSB8fCAnJyldID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdIHx8ICcnKTtcbiAgICB9XG5cbiAgICB1cmkucXVlcnkgPSBkYXRhO1xuXG4gICAgdXJpLmhyZWYgPSB0aGlzLnN0cmluZ2lmeSh1cmkpO1xuICAgIHJldHVybiB1cmk7XG4gIH0sXG5cbiAgc3RyaW5naWZ5OiBmdW5jdGlvbih1cmkpIHtcbiAgICB2YXIgc3RyaW5nID0gdXJpLnByb3RvY29sICsgJy8vJyArIHVyaS5ob3N0bmFtZTtcbiAgICBpZiAodXJpLnBvcnQpIHN0cmluZyArPSAnOicgKyB1cmkucG9ydDtcbiAgICBzdHJpbmcgKz0gdXJpLnBhdGhuYW1lICsgdGhpcy5xdWVyeVN0cmluZyh1cmkucXVlcnkpICsgKHVyaS5oYXNoIHx8ICcnKTtcbiAgICByZXR1cm4gc3RyaW5nO1xuICB9LFxuXG4gIHF1ZXJ5U3RyaW5nOiBmdW5jdGlvbihxdWVyeSkge1xuICAgIHZhciBwYWlycyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBxdWVyeSkge1xuICAgICAgaWYgKCFxdWVyeS5oYXNPd25Qcm9wZXJ0eShrZXkpKSBjb250aW51ZTtcbiAgICAgIHBhaXJzLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KGtleSkgKyAnPScgKyBlbmNvZGVVUklDb21wb25lbnQocXVlcnlba2V5XSkpO1xuICAgIH1cbiAgICBpZiAocGFpcnMubGVuZ3RoID09PSAwKSByZXR1cm4gJyc7XG4gICAgcmV0dXJuICc/JyArIHBhaXJzLmpvaW4oJyYnKTtcbiAgfVxufTtcblxuRmF5ZS5FcnJvciA9IEZheWUuQ2xhc3Moe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbihjb2RlLCBwYXJhbXMsIG1lc3NhZ2UpIHtcbiAgICB0aGlzLmNvZGUgICAgPSBjb2RlO1xuICAgIHRoaXMucGFyYW1zICA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHBhcmFtcyk7XG4gICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgfSxcblxuICB0b1N0cmluZzogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuY29kZSArICc6JyArXG4gICAgICAgICAgIHRoaXMucGFyYW1zLmpvaW4oJywnKSArICc6JyArXG4gICAgICAgICAgIHRoaXMubWVzc2FnZTtcbiAgfVxufSk7XG5cbkZheWUuRXJyb3IucGFyc2UgPSBmdW5jdGlvbihtZXNzYWdlKSB7XG4gIG1lc3NhZ2UgPSBtZXNzYWdlIHx8ICcnO1xuICBpZiAoIUZheWUuR3JhbW1hci5FUlJPUi50ZXN0KG1lc3NhZ2UpKSByZXR1cm4gbmV3IHRoaXMobnVsbCwgW10sIG1lc3NhZ2UpO1xuXG4gIHZhciBwYXJ0cyAgID0gbWVzc2FnZS5zcGxpdCgnOicpLFxuICAgICAgY29kZSAgICA9IHBhcnNlSW50KHBhcnRzWzBdKSxcbiAgICAgIHBhcmFtcyAgPSBwYXJ0c1sxXS5zcGxpdCgnLCcpLFxuICAgICAgbWVzc2FnZSA9IHBhcnRzWzJdO1xuXG4gIHJldHVybiBuZXcgdGhpcyhjb2RlLCBwYXJhbXMsIG1lc3NhZ2UpO1xufTtcblxuXG5cblxuRmF5ZS5FcnJvci52ZXJzaW9uTWlzbWF0Y2ggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDMwMCwgYXJndW1lbnRzLCAnVmVyc2lvbiBtaXNtYXRjaCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmNvbm50eXBlTWlzbWF0Y2ggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDMwMSwgYXJndW1lbnRzLCAnQ29ubmVjdGlvbiB0eXBlcyBub3Qgc3VwcG9ydGVkJykudG9TdHJpbmcoKTtcbn07XG5cbkZheWUuRXJyb3IuZXh0TWlzbWF0Y2ggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDMwMiwgYXJndW1lbnRzLCAnRXh0ZW5zaW9uIG1pc21hdGNoJykudG9TdHJpbmcoKTtcbn07XG5cbkZheWUuRXJyb3IuYmFkUmVxdWVzdCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IHRoaXMoNDAwLCBhcmd1bWVudHMsICdCYWQgcmVxdWVzdCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmNsaWVudFVua25vd24gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDQwMSwgYXJndW1lbnRzLCAnVW5rbm93biBjbGllbnQnKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5wYXJhbWV0ZXJNaXNzaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg0MDIsIGFyZ3VtZW50cywgJ01pc3NpbmcgcmVxdWlyZWQgcGFyYW1ldGVyJykudG9TdHJpbmcoKTtcbn07XG5cbkZheWUuRXJyb3IuY2hhbm5lbEZvcmJpZGRlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gbmV3IHRoaXMoNDAzLCBhcmd1bWVudHMsICdGb3JiaWRkZW4gY2hhbm5lbCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmNoYW5uZWxVbmtub3duID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg0MDQsIGFyZ3VtZW50cywgJ1Vua25vd24gY2hhbm5lbCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmNoYW5uZWxJbnZhbGlkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg0MDUsIGFyZ3VtZW50cywgJ0ludmFsaWQgY2hhbm5lbCcpLnRvU3RyaW5nKCk7XG59O1xuXG5GYXllLkVycm9yLmV4dFVua25vd24gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDQwNiwgYXJndW1lbnRzLCAnVW5rbm93biBleHRlbnNpb24nKS50b1N0cmluZygpO1xufTtcblxuRmF5ZS5FcnJvci5wdWJsaXNoRmFpbGVkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBuZXcgdGhpcyg0MDcsIGFyZ3VtZW50cywgJ0ZhaWxlZCB0byBwdWJsaXNoJykudG9TdHJpbmcoKTtcbn07XG5cbkZheWUuRXJyb3Iuc2VydmVyRXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIG5ldyB0aGlzKDUwMCwgYXJndW1lbnRzLCAnSW50ZXJuYWwgc2VydmVyIGVycm9yJykudG9TdHJpbmcoKTtcbn07XG5cblxuRmF5ZS5EZWZlcnJhYmxlID0ge1xuICB0aGVuOiBmdW5jdGlvbihjYWxsYmFjaywgZXJyYmFjaykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXRoaXMuX3Byb21pc2UpXG4gICAgICB0aGlzLl9wcm9taXNlID0gbmV3IEZheWUuUHJvbWlzZShmdW5jdGlvbihmdWxmaWxsLCByZWplY3QpIHtcbiAgICAgICAgc2VsZi5fZnVsZmlsbCA9IGZ1bGZpbGw7XG4gICAgICAgIHNlbGYuX3JlamVjdCAgPSByZWplY3Q7XG4gICAgICB9KTtcblxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgcmV0dXJuIHRoaXMuX3Byb21pc2U7XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHRoaXMuX3Byb21pc2UudGhlbihjYWxsYmFjaywgZXJyYmFjayk7XG4gIH0sXG5cbiAgY2FsbGJhY2s6IGZ1bmN0aW9uKGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbih2YWx1ZSkgeyBjYWxsYmFjay5jYWxsKGNvbnRleHQsIHZhbHVlKSB9KTtcbiAgfSxcblxuICBlcnJiYWNrOiBmdW5jdGlvbihjYWxsYmFjaywgY29udGV4dCkge1xuICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgZnVuY3Rpb24ocmVhc29uKSB7IGNhbGxiYWNrLmNhbGwoY29udGV4dCwgcmVhc29uKSB9KTtcbiAgfSxcblxuICB0aW1lb3V0OiBmdW5jdGlvbihzZWNvbmRzLCBtZXNzYWdlKSB7XG4gICAgdGhpcy50aGVuKCk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuX3RpbWVyID0gRmF5ZS5FTlYuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYuX3JlamVjdChtZXNzYWdlKTtcbiAgICB9LCBzZWNvbmRzICogMTAwMCk7XG4gIH0sXG5cbiAgc2V0RGVmZXJyZWRTdGF0dXM6IGZ1bmN0aW9uKHN0YXR1cywgdmFsdWUpIHtcbiAgICBpZiAodGhpcy5fdGltZXIpIEZheWUuRU5WLmNsZWFyVGltZW91dCh0aGlzLl90aW1lcik7XG5cbiAgICB0aGlzLnRoZW4oKTtcblxuICAgIGlmIChzdGF0dXMgPT09ICdzdWNjZWVkZWQnKVxuICAgICAgdGhpcy5fZnVsZmlsbCh2YWx1ZSk7XG4gICAgZWxzZSBpZiAoc3RhdHVzID09PSAnZmFpbGVkJylcbiAgICAgIHRoaXMuX3JlamVjdCh2YWx1ZSk7XG4gICAgZWxzZVxuICAgICAgZGVsZXRlIHRoaXMuX3Byb21pc2U7XG4gIH1cbn07XG5cbkZheWUuUHVibGlzaGVyID0ge1xuICBjb3VudExpc3RlbmVyczogZnVuY3Rpb24oZXZlbnRUeXBlKSB7XG4gICAgcmV0dXJuIHRoaXMubGlzdGVuZXJzKGV2ZW50VHlwZSkubGVuZ3RoO1xuICB9LFxuXG4gIGJpbmQ6IGZ1bmN0aW9uKGV2ZW50VHlwZSwgbGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICB2YXIgc2xpY2UgICA9IEFycmF5LnByb3RvdHlwZS5zbGljZSxcbiAgICAgICAgaGFuZGxlciA9IGZ1bmN0aW9uKCkgeyBsaXN0ZW5lci5hcHBseShjb250ZXh0LCBzbGljZS5jYWxsKGFyZ3VtZW50cykpIH07XG5cbiAgICB0aGlzLl9saXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMgfHwgW107XG4gICAgdGhpcy5fbGlzdGVuZXJzLnB1c2goW2V2ZW50VHlwZSwgbGlzdGVuZXIsIGNvbnRleHQsIGhhbmRsZXJdKTtcbiAgICByZXR1cm4gdGhpcy5vbihldmVudFR5cGUsIGhhbmRsZXIpO1xuICB9LFxuXG4gIHVuYmluZDogZnVuY3Rpb24oZXZlbnRUeXBlLCBsaXN0ZW5lciwgY29udGV4dCkge1xuICAgIHRoaXMuX2xpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycyB8fCBbXTtcbiAgICB2YXIgbiA9IHRoaXMuX2xpc3RlbmVycy5sZW5ndGgsIHR1cGxlO1xuXG4gICAgd2hpbGUgKG4tLSkge1xuICAgICAgdHVwbGUgPSB0aGlzLl9saXN0ZW5lcnNbbl07XG4gICAgICBpZiAodHVwbGVbMF0gIT09IGV2ZW50VHlwZSkgY29udGludWU7XG4gICAgICBpZiAobGlzdGVuZXIgJiYgKHR1cGxlWzFdICE9PSBsaXN0ZW5lciB8fCB0dXBsZVsyXSAhPT0gY29udGV4dCkpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5fbGlzdGVuZXJzLnNwbGljZShuLCAxKTtcbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIoZXZlbnRUeXBlLCB0dXBsZVszXSk7XG4gICAgfVxuICB9XG59O1xuXG5GYXllLmV4dGVuZChGYXllLlB1Ymxpc2hlciwgRmF5ZS5FdmVudEVtaXR0ZXIucHJvdG90eXBlKTtcbkZheWUuUHVibGlzaGVyLnRyaWdnZXIgPSBGYXllLlB1Ymxpc2hlci5lbWl0O1xuXG5GYXllLlRpbWVvdXRzID0ge1xuICBhZGRUaW1lb3V0OiBmdW5jdGlvbihuYW1lLCBkZWxheSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB0aGlzLl90aW1lb3V0cyA9IHRoaXMuX3RpbWVvdXRzIHx8IHt9O1xuICAgIGlmICh0aGlzLl90aW1lb3V0cy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkgcmV0dXJuO1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLl90aW1lb3V0c1tuYW1lXSA9IEZheWUuRU5WLnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBkZWxldGUgc2VsZi5fdGltZW91dHNbbmFtZV07XG4gICAgICBjYWxsYmFjay5jYWxsKGNvbnRleHQpO1xuICAgIH0sIDEwMDAgKiBkZWxheSk7XG4gIH0sXG5cbiAgcmVtb3ZlVGltZW91dDogZnVuY3Rpb24obmFtZSkge1xuICAgIHRoaXMuX3RpbWVvdXRzID0gdGhpcy5fdGltZW91dHMgfHwge307XG4gICAgdmFyIHRpbWVvdXQgPSB0aGlzLl90aW1lb3V0c1tuYW1lXTtcbiAgICBpZiAoIXRpbWVvdXQpIHJldHVybjtcbiAgICBGYXllLkVOVi5jbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgZGVsZXRlIHRoaXMuX3RpbWVvdXRzW25hbWVdO1xuICB9LFxuXG4gIHJlbW92ZUFsbFRpbWVvdXRzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl90aW1lb3V0cyA9IHRoaXMuX3RpbWVvdXRzIHx8IHt9O1xuICAgIGZvciAodmFyIG5hbWUgaW4gdGhpcy5fdGltZW91dHMpIHRoaXMucmVtb3ZlVGltZW91dChuYW1lKTtcbiAgfVxufTtcblxuRmF5ZS5Mb2dnaW5nID0ge1xuICBMT0dfTEVWRUxTOiB7XG4gICAgZmF0YWw6ICA0LFxuICAgIGVycm9yOiAgMyxcbiAgICB3YXJuOiAgIDIsXG4gICAgaW5mbzogICAxLFxuICAgIGRlYnVnOiAgMFxuICB9LFxuXG4gIHdyaXRlTG9nOiBmdW5jdGlvbihtZXNzYWdlQXJncywgbGV2ZWwpIHtcbiAgICBpZiAoIUZheWUubG9nZ2VyKSByZXR1cm47XG5cbiAgICB2YXIgYXJncyAgID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KG1lc3NhZ2VBcmdzKSxcbiAgICAgICAgYmFubmVyID0gJ1tGYXllJyxcbiAgICAgICAga2xhc3MgID0gdGhpcy5jbGFzc05hbWUsXG5cbiAgICAgICAgbWVzc2FnZSA9IGFyZ3Muc2hpZnQoKS5yZXBsYWNlKC9cXD8vZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBGYXllLnRvSlNPTihhcmdzLnNoaWZ0KCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiAnW09iamVjdF0nO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gRmF5ZSkge1xuICAgICAgaWYgKGtsYXNzKSBjb250aW51ZTtcbiAgICAgIGlmICh0eXBlb2YgRmF5ZVtrZXldICE9PSAnZnVuY3Rpb24nKSBjb250aW51ZTtcbiAgICAgIGlmICh0aGlzIGluc3RhbmNlb2YgRmF5ZVtrZXldKSBrbGFzcyA9IGtleTtcbiAgICB9XG4gICAgaWYgKGtsYXNzKSBiYW5uZXIgKz0gJy4nICsga2xhc3M7XG4gICAgYmFubmVyICs9ICddICc7XG5cbiAgICBpZiAodHlwZW9mIEZheWUubG9nZ2VyW2xldmVsXSA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgIEZheWUubG9nZ2VyW2xldmVsXShiYW5uZXIgKyBtZXNzYWdlKTtcbiAgICBlbHNlIGlmICh0eXBlb2YgRmF5ZS5sb2dnZXIgPT09ICdmdW5jdGlvbicpXG4gICAgICBGYXllLmxvZ2dlcihiYW5uZXIgKyBtZXNzYWdlKTtcbiAgfVxufTtcblxuKGZ1bmN0aW9uKCkge1xuICBmb3IgKHZhciBrZXkgaW4gRmF5ZS5Mb2dnaW5nLkxPR19MRVZFTFMpXG4gICAgKGZ1bmN0aW9uKGxldmVsKSB7XG4gICAgICBGYXllLkxvZ2dpbmdbbGV2ZWxdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMud3JpdGVMb2coYXJndW1lbnRzLCBsZXZlbCk7XG4gICAgICB9O1xuICAgIH0pKGtleSk7XG59KSgpO1xuXG5GYXllLkdyYW1tYXIgPSB7XG4gIENIQU5ORUxfTkFNRTogICAgIC9eXFwvKCgoKFthLXpdfFtBLVpdKXxbMC05XSl8KFxcLXxcXF98XFwhfFxcfnxcXCh8XFwpfFxcJHxcXEApKSkrKFxcLygoKChbYS16XXxbQS1aXSl8WzAtOV0pfChcXC18XFxffFxcIXxcXH58XFwofFxcKXxcXCR8XFxAKSkpKykqJC8sXG4gIENIQU5ORUxfUEFUVEVSTjogIC9eKFxcLygoKChbYS16XXxbQS1aXSl8WzAtOV0pfChcXC18XFxffFxcIXxcXH58XFwofFxcKXxcXCR8XFxAKSkpKykqXFwvXFwqezEsMn0kLyxcbiAgRVJST1I6ICAgICAgICAgICAgL14oWzAtOV1bMC05XVswLTldOigoKChbYS16XXxbQS1aXSl8WzAtOV0pfChcXC18XFxffFxcIXxcXH58XFwofFxcKXxcXCR8XFxAKXwgfFxcL3xcXCp8XFwuKSkqKCwoKCgoW2Etel18W0EtWl0pfFswLTldKXwoXFwtfFxcX3xcXCF8XFx+fFxcKHxcXCl8XFwkfFxcQCl8IHxcXC98XFwqfFxcLikpKikqOigoKChbYS16XXxbQS1aXSl8WzAtOV0pfChcXC18XFxffFxcIXxcXH58XFwofFxcKXxcXCR8XFxAKXwgfFxcL3xcXCp8XFwuKSkqfFswLTldWzAtOV1bMC05XTo6KCgoKFthLXpdfFtBLVpdKXxbMC05XSl8KFxcLXxcXF98XFwhfFxcfnxcXCh8XFwpfFxcJHxcXEApfCB8XFwvfFxcKnxcXC4pKSopJC8sXG4gIFZFUlNJT046ICAgICAgICAgIC9eKFswLTldKSsoXFwuKChbYS16XXxbQS1aXSl8WzAtOV0pKCgoKFthLXpdfFtBLVpdKXxbMC05XSl8XFwtfFxcXykpKikqJC9cbn07XG5cbkZheWUuRXh0ZW5zaWJsZSA9IHtcbiAgYWRkRXh0ZW5zaW9uOiBmdW5jdGlvbihleHRlbnNpb24pIHtcbiAgICB0aGlzLl9leHRlbnNpb25zID0gdGhpcy5fZXh0ZW5zaW9ucyB8fCBbXTtcbiAgICB0aGlzLl9leHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcbiAgICBpZiAoZXh0ZW5zaW9uLmFkZGVkKSBleHRlbnNpb24uYWRkZWQodGhpcyk7XG4gIH0sXG5cbiAgcmVtb3ZlRXh0ZW5zaW9uOiBmdW5jdGlvbihleHRlbnNpb24pIHtcbiAgICBpZiAoIXRoaXMuX2V4dGVuc2lvbnMpIHJldHVybjtcbiAgICB2YXIgaSA9IHRoaXMuX2V4dGVuc2lvbnMubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIGlmICh0aGlzLl9leHRlbnNpb25zW2ldICE9PSBleHRlbnNpb24pIGNvbnRpbnVlO1xuICAgICAgdGhpcy5fZXh0ZW5zaW9ucy5zcGxpY2UoaSwxKTtcbiAgICAgIGlmIChleHRlbnNpb24ucmVtb3ZlZCkgZXh0ZW5zaW9uLnJlbW92ZWQodGhpcyk7XG4gICAgfVxuICB9LFxuXG4gIHBpcGVUaHJvdWdoRXh0ZW5zaW9uczogZnVuY3Rpb24oc3RhZ2UsIG1lc3NhZ2UsIHJlcXVlc3QsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdGhpcy5kZWJ1ZygnUGFzc2luZyB0aHJvdWdoID8gZXh0ZW5zaW9uczogPycsIHN0YWdlLCBtZXNzYWdlKTtcblxuICAgIGlmICghdGhpcy5fZXh0ZW5zaW9ucykgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgbWVzc2FnZSk7XG4gICAgdmFyIGV4dGVuc2lvbnMgPSB0aGlzLl9leHRlbnNpb25zLnNsaWNlKCk7XG5cbiAgICB2YXIgcGlwZSA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgIGlmICghbWVzc2FnZSkgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgbWVzc2FnZSk7XG5cbiAgICAgIHZhciBleHRlbnNpb24gPSBleHRlbnNpb25zLnNoaWZ0KCk7XG4gICAgICBpZiAoIWV4dGVuc2lvbikgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgbWVzc2FnZSk7XG5cbiAgICAgIHZhciBmbiA9IGV4dGVuc2lvbltzdGFnZV07XG4gICAgICBpZiAoIWZuKSByZXR1cm4gcGlwZShtZXNzYWdlKTtcblxuICAgICAgaWYgKGZuLmxlbmd0aCA+PSAzKSBleHRlbnNpb25bc3RhZ2VdKG1lc3NhZ2UsIHJlcXVlc3QsIHBpcGUpO1xuICAgICAgZWxzZSAgICAgICAgICAgICAgICBleHRlbnNpb25bc3RhZ2VdKG1lc3NhZ2UsIHBpcGUpO1xuICAgIH07XG4gICAgcGlwZShtZXNzYWdlKTtcbiAgfVxufTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5FeHRlbnNpYmxlLCBGYXllLkxvZ2dpbmcpO1xuXG5GYXllLkNoYW5uZWwgPSBGYXllLkNsYXNzKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24obmFtZSkge1xuICAgIHRoaXMuaWQgPSB0aGlzLm5hbWUgPSBuYW1lO1xuICB9LFxuXG4gIHB1c2g6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICB0aGlzLnRyaWdnZXIoJ21lc3NhZ2UnLCBtZXNzYWdlKTtcbiAgfSxcblxuICBpc1VudXNlZDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuY291bnRMaXN0ZW5lcnMoJ21lc3NhZ2UnKSA9PT0gMDtcbiAgfVxufSk7XG5cbkZheWUuZXh0ZW5kKEZheWUuQ2hhbm5lbC5wcm90b3R5cGUsIEZheWUuUHVibGlzaGVyKTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5DaGFubmVsLCB7XG4gIEhBTkRTSEFLRTogICAgJy9tZXRhL2hhbmRzaGFrZScsXG4gIENPTk5FQ1Q6ICAgICAgJy9tZXRhL2Nvbm5lY3QnLFxuICBTVUJTQ1JJQkU6ICAgICcvbWV0YS9zdWJzY3JpYmUnLFxuICBVTlNVQlNDUklCRTogICcvbWV0YS91bnN1YnNjcmliZScsXG4gIERJU0NPTk5FQ1Q6ICAgJy9tZXRhL2Rpc2Nvbm5lY3QnLFxuXG4gIE1FVEE6ICAgICAgICAgJ21ldGEnLFxuICBTRVJWSUNFOiAgICAgICdzZXJ2aWNlJyxcblxuICBleHBhbmQ6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgc2VnbWVudHMgPSB0aGlzLnBhcnNlKG5hbWUpLFxuICAgICAgICBjaGFubmVscyA9IFsnLyoqJywgbmFtZV07XG5cbiAgICB2YXIgY29weSA9IHNlZ21lbnRzLnNsaWNlKCk7XG4gICAgY29weVtjb3B5Lmxlbmd0aCAtIDFdID0gJyonO1xuICAgIGNoYW5uZWxzLnB1c2godGhpcy51bnBhcnNlKGNvcHkpKTtcblxuICAgIGZvciAodmFyIGkgPSAxLCBuID0gc2VnbWVudHMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICBjb3B5ID0gc2VnbWVudHMuc2xpY2UoMCwgaSk7XG4gICAgICBjb3B5LnB1c2goJyoqJyk7XG4gICAgICBjaGFubmVscy5wdXNoKHRoaXMudW5wYXJzZShjb3B5KSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNoYW5uZWxzO1xuICB9LFxuXG4gIGlzVmFsaWQ6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICByZXR1cm4gRmF5ZS5HcmFtbWFyLkNIQU5ORUxfTkFNRS50ZXN0KG5hbWUpIHx8XG4gICAgICAgICAgIEZheWUuR3JhbW1hci5DSEFOTkVMX1BBVFRFUk4udGVzdChuYW1lKTtcbiAgfSxcblxuICBwYXJzZTogZnVuY3Rpb24obmFtZSkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKG5hbWUpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gbmFtZS5zcGxpdCgnLycpLnNsaWNlKDEpO1xuICB9LFxuXG4gIHVucGFyc2U6IGZ1bmN0aW9uKHNlZ21lbnRzKSB7XG4gICAgcmV0dXJuICcvJyArIHNlZ21lbnRzLmpvaW4oJy8nKTtcbiAgfSxcblxuICBpc01ldGE6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgc2VnbWVudHMgPSB0aGlzLnBhcnNlKG5hbWUpO1xuICAgIHJldHVybiBzZWdtZW50cyA/IChzZWdtZW50c1swXSA9PT0gdGhpcy5NRVRBKSA6IG51bGw7XG4gIH0sXG5cbiAgaXNTZXJ2aWNlOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIHNlZ21lbnRzID0gdGhpcy5wYXJzZShuYW1lKTtcbiAgICByZXR1cm4gc2VnbWVudHMgPyAoc2VnbWVudHNbMF0gPT09IHRoaXMuU0VSVklDRSkgOiBudWxsO1xuICB9LFxuXG4gIGlzU3Vic2NyaWJhYmxlOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQobmFtZSkpIHJldHVybiBudWxsO1xuICAgIHJldHVybiAhdGhpcy5pc01ldGEobmFtZSkgJiYgIXRoaXMuaXNTZXJ2aWNlKG5hbWUpO1xuICB9LFxuXG4gIFNldDogRmF5ZS5DbGFzcyh7XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLl9jaGFubmVscyA9IHt9O1xuICAgIH0sXG5cbiAgICBnZXRLZXlzOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBrZXlzID0gW107XG4gICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5fY2hhbm5lbHMpIGtleXMucHVzaChrZXkpO1xuICAgICAgcmV0dXJuIGtleXM7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24obmFtZSkge1xuICAgICAgZGVsZXRlIHRoaXMuX2NoYW5uZWxzW25hbWVdO1xuICAgIH0sXG5cbiAgICBoYXNTdWJzY3JpcHRpb246IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLl9jaGFubmVscy5oYXNPd25Qcm9wZXJ0eShuYW1lKTtcbiAgICB9LFxuXG4gICAgc3Vic2NyaWJlOiBmdW5jdGlvbihuYW1lcywgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICAgIHZhciBuYW1lO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBuYW1lcy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgbmFtZSA9IG5hbWVzW2ldO1xuICAgICAgICB2YXIgY2hhbm5lbCA9IHRoaXMuX2NoYW5uZWxzW25hbWVdID0gdGhpcy5fY2hhbm5lbHNbbmFtZV0gfHwgbmV3IEZheWUuQ2hhbm5lbChuYW1lKTtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSBjaGFubmVsLmJpbmQoJ21lc3NhZ2UnLCBjYWxsYmFjaywgY29udGV4dCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIHVuc3Vic2NyaWJlOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgICAgdmFyIGNoYW5uZWwgPSB0aGlzLl9jaGFubmVsc1tuYW1lXTtcbiAgICAgIGlmICghY2hhbm5lbCkgcmV0dXJuIGZhbHNlO1xuICAgICAgY2hhbm5lbC51bmJpbmQoJ21lc3NhZ2UnLCBjYWxsYmFjaywgY29udGV4dCk7XG5cbiAgICAgIGlmIChjaGFubmVsLmlzVW51c2VkKCkpIHtcbiAgICAgICAgdGhpcy5yZW1vdmUobmFtZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBkaXN0cmlidXRlTWVzc2FnZTogZnVuY3Rpb24obWVzc2FnZSkge1xuICAgICAgdmFyIGNoYW5uZWxzID0gRmF5ZS5DaGFubmVsLmV4cGFuZChtZXNzYWdlLmNoYW5uZWwpO1xuXG4gICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGNoYW5uZWxzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICB2YXIgY2hhbm5lbCA9IHRoaXMuX2NoYW5uZWxzW2NoYW5uZWxzW2ldXTtcbiAgICAgICAgaWYgKGNoYW5uZWwpIGNoYW5uZWwudHJpZ2dlcignbWVzc2FnZScsIG1lc3NhZ2UuZGF0YSk7XG4gICAgICB9XG4gICAgfVxuICB9KVxufSk7XG5cbkZheWUuUHVibGljYXRpb24gPSBGYXllLkNsYXNzKEZheWUuRGVmZXJyYWJsZSk7XG5cbkZheWUuU3Vic2NyaXB0aW9uID0gRmF5ZS5DbGFzcyh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKGNsaWVudCwgY2hhbm5lbHMsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdGhpcy5fY2xpZW50ICAgID0gY2xpZW50O1xuICAgIHRoaXMuX2NoYW5uZWxzICA9IGNoYW5uZWxzO1xuICAgIHRoaXMuX2NhbGxiYWNrICA9IGNhbGxiYWNrO1xuICAgIHRoaXMuX2NvbnRleHQgICAgID0gY29udGV4dDtcbiAgICB0aGlzLl9jYW5jZWxsZWQgPSBmYWxzZTtcbiAgfSxcblxuICBjYW5jZWw6IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLl9jYW5jZWxsZWQpIHJldHVybjtcbiAgICB0aGlzLl9jbGllbnQudW5zdWJzY3JpYmUodGhpcy5fY2hhbm5lbHMsIHRoaXMuX2NhbGxiYWNrLCB0aGlzLl9jb250ZXh0KTtcbiAgICB0aGlzLl9jYW5jZWxsZWQgPSB0cnVlO1xuICB9LFxuXG4gIHVuc3Vic2NyaWJlOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNhbmNlbCgpO1xuICB9XG59KTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5TdWJzY3JpcHRpb24ucHJvdG90eXBlLCBGYXllLkRlZmVycmFibGUpO1xuXG5GYXllLkNsaWVudCA9IEZheWUuQ2xhc3Moe1xuICBVTkNPTk5FQ1RFRDogICAgICAgIDEsXG4gIENPTk5FQ1RJTkc6ICAgICAgICAgMixcbiAgQ09OTkVDVEVEOiAgICAgICAgICAzLFxuICBESVNDT05ORUNURUQ6ICAgICAgIDQsXG5cbiAgSEFORFNIQUtFOiAgICAgICAgICAnaGFuZHNoYWtlJyxcbiAgUkVUUlk6ICAgICAgICAgICAgICAncmV0cnknLFxuICBOT05FOiAgICAgICAgICAgICAgICdub25lJyxcblxuICBDT05ORUNUSU9OX1RJTUVPVVQ6IDYwLFxuXG4gIERFRkFVTFRfRU5EUE9JTlQ6ICAgJy9iYXlldXgnLFxuICBJTlRFUlZBTDogICAgICAgICAgIDAsXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oZW5kcG9pbnQsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmluZm8oJ05ldyBjbGllbnQgY3JlYXRlZCBmb3IgPycsIGVuZHBvaW50KTtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIEZheWUudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMsIFsnaW50ZXJ2YWwnLCAndGltZW91dCcsICdlbmRwb2ludHMnLCAncHJveHknLCAncmV0cnknLCAnc2NoZWR1bGVyJywgJ3dlYnNvY2tldEV4dGVuc2lvbnMnLCAndGxzJywgJ2NhJ10pO1xuXG4gICAgdGhpcy5fZW5kcG9pbnQgICA9IGVuZHBvaW50IHx8IHRoaXMuREVGQVVMVF9FTkRQT0lOVDtcbiAgICB0aGlzLl9jaGFubmVscyAgID0gbmV3IEZheWUuQ2hhbm5lbC5TZXQoKTtcbiAgICB0aGlzLl9kaXNwYXRjaGVyID0gbmV3IEZheWUuRGlzcGF0Y2hlcih0aGlzLCB0aGlzLl9lbmRwb2ludCwgb3B0aW9ucyk7XG5cbiAgICB0aGlzLl9tZXNzYWdlSWQgPSAwO1xuICAgIHRoaXMuX3N0YXRlICAgICA9IHRoaXMuVU5DT05ORUNURUQ7XG5cbiAgICB0aGlzLl9yZXNwb25zZUNhbGxiYWNrcyA9IHt9O1xuXG4gICAgdGhpcy5fYWR2aWNlID0ge1xuICAgICAgcmVjb25uZWN0OiB0aGlzLlJFVFJZLFxuICAgICAgaW50ZXJ2YWw6ICAxMDAwICogKG9wdGlvbnMuaW50ZXJ2YWwgfHwgdGhpcy5JTlRFUlZBTCksXG4gICAgICB0aW1lb3V0OiAgIDEwMDAgKiAob3B0aW9ucy50aW1lb3V0ICB8fCB0aGlzLkNPTk5FQ1RJT05fVElNRU9VVClcbiAgICB9O1xuICAgIHRoaXMuX2Rpc3BhdGNoZXIudGltZW91dCA9IHRoaXMuX2FkdmljZS50aW1lb3V0IC8gMTAwMDtcblxuICAgIHRoaXMuX2Rpc3BhdGNoZXIuYmluZCgnbWVzc2FnZScsIHRoaXMuX3JlY2VpdmVNZXNzYWdlLCB0aGlzKTtcblxuICAgIGlmIChGYXllLkV2ZW50ICYmIEZheWUuRU5WLm9uYmVmb3JldW5sb2FkICE9PSB1bmRlZmluZWQpXG4gICAgICBGYXllLkV2ZW50Lm9uKEZheWUuRU5WLCAnYmVmb3JldW5sb2FkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChGYXllLmluZGV4T2YodGhpcy5fZGlzcGF0Y2hlci5fZGlzYWJsZWQsICdhdXRvZGlzY29ubmVjdCcpIDwgMClcbiAgICAgICAgICB0aGlzLmRpc2Nvbm5lY3QoKTtcbiAgICAgIH0sIHRoaXMpO1xuICB9LFxuXG4gIGFkZFdlYnNvY2tldEV4dGVuc2lvbjogZnVuY3Rpb24oZXh0ZW5zaW9uKSB7XG4gICAgcmV0dXJuIHRoaXMuX2Rpc3BhdGNoZXIuYWRkV2Vic29ja2V0RXh0ZW5zaW9uKGV4dGVuc2lvbik7XG4gIH0sXG5cbiAgZGlzYWJsZTogZnVuY3Rpb24oZmVhdHVyZSkge1xuICAgIHJldHVybiB0aGlzLl9kaXNwYXRjaGVyLmRpc2FibGUoZmVhdHVyZSk7XG4gIH0sXG5cbiAgc2V0SGVhZGVyOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuICAgIHJldHVybiB0aGlzLl9kaXNwYXRjaGVyLnNldEhlYWRlcihuYW1lLCB2YWx1ZSk7XG4gIH0sXG5cbiAgLy8gUmVxdWVzdFxuICAvLyBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWxcbiAgLy8gICAgICAgICAgICAgICAgKiB2ZXJzaW9uXG4gIC8vICAgICAgICAgICAgICAgICogc3VwcG9ydGVkQ29ubmVjdGlvblR5cGVzXG4gIC8vIE1BWSBpbmNsdWRlOiAgICogbWluaW11bVZlcnNpb25cbiAgLy8gICAgICAgICAgICAgICAgKiBleHRcbiAgLy8gICAgICAgICAgICAgICAgKiBpZFxuICAvL1xuICAvLyBTdWNjZXNzIFJlc3BvbnNlICAgICAgICAgICAgICAgICAgICAgICAgICAgICBGYWlsZWQgUmVzcG9uc2VcbiAgLy8gTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsICAgICAgICAgICAgICAgICAgICAgTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsXG4gIC8vICAgICAgICAgICAgICAgICogdmVyc2lvbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bFxuICAvLyAgICAgICAgICAgICAgICAqIHN1cHBvcnRlZENvbm5lY3Rpb25UeXBlcyAgICAgICAgICAgICAgICAgICAqIGVycm9yXG4gIC8vICAgICAgICAgICAgICAgICogY2xpZW50SWQgICAgICAgICAgICAgICAgICAgIE1BWSBpbmNsdWRlOiAgICogc3VwcG9ydGVkQ29ubmVjdGlvblR5cGVzXG4gIC8vICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogYWR2aWNlXG4gIC8vIE1BWSBpbmNsdWRlOiAgICogbWluaW11bVZlcnNpb24gICAgICAgICAgICAgICAgICAgICAgICAgICAgICogdmVyc2lvblxuICAvLyAgICAgICAgICAgICAgICAqIGFkdmljZSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIG1pbmltdW1WZXJzaW9uXG4gIC8vICAgICAgICAgICAgICAgICogZXh0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogZXh0XG4gIC8vICAgICAgICAgICAgICAgICogaWQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogaWRcbiAgLy8gICAgICAgICAgICAgICAgKiBhdXRoU3VjY2Vzc2Z1bFxuICBoYW5kc2hha2U6IGZ1bmN0aW9uKGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgaWYgKHRoaXMuX2FkdmljZS5yZWNvbm5lY3QgPT09IHRoaXMuTk9ORSkgcmV0dXJuO1xuICAgIGlmICh0aGlzLl9zdGF0ZSAhPT0gdGhpcy5VTkNPTk5FQ1RFRCkgcmV0dXJuO1xuXG4gICAgdGhpcy5fc3RhdGUgPSB0aGlzLkNPTk5FQ1RJTkc7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5pbmZvKCdJbml0aWF0aW5nIGhhbmRzaGFrZSB3aXRoID8nLCBGYXllLlVSSS5zdHJpbmdpZnkodGhpcy5fZW5kcG9pbnQpKTtcbiAgICB0aGlzLl9kaXNwYXRjaGVyLnNlbGVjdFRyYW5zcG9ydChGYXllLk1BTkRBVE9SWV9DT05ORUNUSU9OX1RZUEVTKTtcblxuICAgIHRoaXMuX3NlbmRNZXNzYWdlKHtcbiAgICAgIGNoYW5uZWw6ICAgICAgICAgICAgICAgICAgRmF5ZS5DaGFubmVsLkhBTkRTSEFLRSxcbiAgICAgIHZlcnNpb246ICAgICAgICAgICAgICAgICAgRmF5ZS5CQVlFVVhfVkVSU0lPTixcbiAgICAgIHN1cHBvcnRlZENvbm5lY3Rpb25UeXBlczogdGhpcy5fZGlzcGF0Y2hlci5nZXRDb25uZWN0aW9uVHlwZXMoKVxuXG4gICAgfSwge30sIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG5cbiAgICAgIGlmIChyZXNwb25zZS5zdWNjZXNzZnVsKSB7XG4gICAgICAgIHRoaXMuX3N0YXRlID0gdGhpcy5DT05ORUNURUQ7XG4gICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQgID0gcmVzcG9uc2UuY2xpZW50SWQ7XG5cbiAgICAgICAgdGhpcy5fZGlzcGF0Y2hlci5zZWxlY3RUcmFuc3BvcnQocmVzcG9uc2Uuc3VwcG9ydGVkQ29ubmVjdGlvblR5cGVzKTtcblxuICAgICAgICB0aGlzLmluZm8oJ0hhbmRzaGFrZSBzdWNjZXNzZnVsOiA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCk7XG5cbiAgICAgICAgdGhpcy5zdWJzY3JpYmUodGhpcy5fY2hhbm5lbHMuZ2V0S2V5cygpLCB0cnVlKTtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSBGYXllLlByb21pc2UuZGVmZXIoZnVuY3Rpb24oKSB7IGNhbGxiYWNrLmNhbGwoY29udGV4dCkgfSk7XG5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuaW5mbygnSGFuZHNoYWtlIHVuc3VjY2Vzc2Z1bCcpO1xuICAgICAgICBGYXllLkVOVi5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBzZWxmLmhhbmRzaGFrZShjYWxsYmFjaywgY29udGV4dCkgfSwgdGhpcy5fZGlzcGF0Y2hlci5yZXRyeSAqIDEwMDApO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IHRoaXMuVU5DT05ORUNURUQ7XG4gICAgICB9XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgLy8gUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlc3BvbnNlXG4gIC8vIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbCAgICAgICAgICAgICBNVVNUIGluY2x1ZGU6ICAqIGNoYW5uZWxcbiAgLy8gICAgICAgICAgICAgICAgKiBjbGllbnRJZCAgICAgICAgICAgICAgICAgICAgICAgICAgICogc3VjY2Vzc2Z1bFxuICAvLyAgICAgICAgICAgICAgICAqIGNvbm5lY3Rpb25UeXBlICAgICAgICAgICAgICAgICAgICAgKiBjbGllbnRJZFxuICAvLyBNQVkgaW5jbHVkZTogICAqIGV4dCAgICAgICAgICAgICAgICAgTUFZIGluY2x1ZGU6ICAgKiBlcnJvclxuICAvLyAgICAgICAgICAgICAgICAqIGlkICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBhZHZpY2VcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogZXh0XG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGlkXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHRpbWVzdGFtcFxuICBjb25uZWN0OiBmdW5jdGlvbihjYWxsYmFjaywgY29udGV4dCkge1xuICAgIGlmICh0aGlzLl9hZHZpY2UucmVjb25uZWN0ID09PSB0aGlzLk5PTkUpIHJldHVybjtcbiAgICBpZiAodGhpcy5fc3RhdGUgPT09IHRoaXMuRElTQ09OTkVDVEVEKSByZXR1cm47XG5cbiAgICBpZiAodGhpcy5fc3RhdGUgPT09IHRoaXMuVU5DT05ORUNURUQpXG4gICAgICByZXR1cm4gdGhpcy5oYW5kc2hha2UoZnVuY3Rpb24oKSB7IHRoaXMuY29ubmVjdChjYWxsYmFjaywgY29udGV4dCkgfSwgdGhpcyk7XG5cbiAgICB0aGlzLmNhbGxiYWNrKGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICBpZiAodGhpcy5fc3RhdGUgIT09IHRoaXMuQ09OTkVDVEVEKSByZXR1cm47XG5cbiAgICB0aGlzLmluZm8oJ0NhbGxpbmcgZGVmZXJyZWQgYWN0aW9ucyBmb3IgPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQpO1xuICAgIHRoaXMuc2V0RGVmZXJyZWRTdGF0dXMoJ3N1Y2NlZWRlZCcpO1xuICAgIHRoaXMuc2V0RGVmZXJyZWRTdGF0dXMoJ3Vua25vd24nKTtcblxuICAgIGlmICh0aGlzLl9jb25uZWN0UmVxdWVzdCkgcmV0dXJuO1xuICAgIHRoaXMuX2Nvbm5lY3RSZXF1ZXN0ID0gdHJ1ZTtcblxuICAgIHRoaXMuaW5mbygnSW5pdGlhdGluZyBjb25uZWN0aW9uIGZvciA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCk7XG5cbiAgICB0aGlzLl9zZW5kTWVzc2FnZSh7XG4gICAgICBjaGFubmVsOiAgICAgICAgRmF5ZS5DaGFubmVsLkNPTk5FQ1QsXG4gICAgICBjbGllbnRJZDogICAgICAgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCxcbiAgICAgIGNvbm5lY3Rpb25UeXBlOiB0aGlzLl9kaXNwYXRjaGVyLmNvbm5lY3Rpb25UeXBlXG5cbiAgICB9LCB7fSwgdGhpcy5fY3ljbGVDb25uZWN0aW9uLCB0aGlzKTtcbiAgfSxcblxuICAvLyBSZXF1ZXN0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUmVzcG9uc2VcbiAgLy8gTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsICAgICAgICAgICAgIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbFxuICAvLyAgICAgICAgICAgICAgICAqIGNsaWVudElkICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBzdWNjZXNzZnVsXG4gIC8vIE1BWSBpbmNsdWRlOiAgICogZXh0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGNsaWVudElkXG4gIC8vICAgICAgICAgICAgICAgICogaWQgICAgICAgICAgICAgICAgICBNQVkgaW5jbHVkZTogICAqIGVycm9yXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4dFxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBpZFxuICBkaXNjb25uZWN0OiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5fc3RhdGUgIT09IHRoaXMuQ09OTkVDVEVEKSByZXR1cm47XG4gICAgdGhpcy5fc3RhdGUgPSB0aGlzLkRJU0NPTk5FQ1RFRDtcblxuICAgIHRoaXMuaW5mbygnRGlzY29ubmVjdGluZyA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCk7XG4gICAgdmFyIHByb21pc2UgPSBuZXcgRmF5ZS5QdWJsaWNhdGlvbigpO1xuXG4gICAgdGhpcy5fc2VuZE1lc3NhZ2Uoe1xuICAgICAgY2hhbm5lbDogIEZheWUuQ2hhbm5lbC5ESVNDT05ORUNULFxuICAgICAgY2xpZW50SWQ6IHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWRcblxuICAgIH0sIHt9LCBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgaWYgKHJlc3BvbnNlLnN1Y2Nlc3NmdWwpIHtcbiAgICAgICAgdGhpcy5fZGlzcGF0Y2hlci5jbG9zZSgpO1xuICAgICAgICBwcm9taXNlLnNldERlZmVycmVkU3RhdHVzKCdzdWNjZWVkZWQnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHByb21pc2Uuc2V0RGVmZXJyZWRTdGF0dXMoJ2ZhaWxlZCcsIEZheWUuRXJyb3IucGFyc2UocmVzcG9uc2UuZXJyb3IpKTtcbiAgICAgIH1cbiAgICB9LCB0aGlzKTtcblxuICAgIHRoaXMuaW5mbygnQ2xlYXJpbmcgY2hhbm5lbCBsaXN0ZW5lcnMgZm9yID8nLCB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkKTtcbiAgICB0aGlzLl9jaGFubmVscyA9IG5ldyBGYXllLkNoYW5uZWwuU2V0KCk7XG5cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfSxcblxuICAvLyBSZXF1ZXN0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUmVzcG9uc2VcbiAgLy8gTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsICAgICAgICAgICAgIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbFxuICAvLyAgICAgICAgICAgICAgICAqIGNsaWVudElkICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBzdWNjZXNzZnVsXG4gIC8vICAgICAgICAgICAgICAgICogc3Vic2NyaXB0aW9uICAgICAgICAgICAgICAgICAgICAgICAqIGNsaWVudElkXG4gIC8vIE1BWSBpbmNsdWRlOiAgICogZXh0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHN1YnNjcmlwdGlvblxuICAvLyAgICAgICAgICAgICAgICAqIGlkICAgICAgICAgICAgICAgICAgTUFZIGluY2x1ZGU6ICAgKiBlcnJvclxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBhZHZpY2VcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogZXh0XG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGlkXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHRpbWVzdGFtcFxuICBzdWJzY3JpYmU6IGZ1bmN0aW9uKGNoYW5uZWwsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgaWYgKGNoYW5uZWwgaW5zdGFuY2VvZiBBcnJheSlcbiAgICAgIHJldHVybiBGYXllLm1hcChjaGFubmVsLCBmdW5jdGlvbihjKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN1YnNjcmliZShjLCBjYWxsYmFjaywgY29udGV4dCk7XG4gICAgICB9LCB0aGlzKTtcblxuICAgIHZhciBzdWJzY3JpcHRpb24gPSBuZXcgRmF5ZS5TdWJzY3JpcHRpb24odGhpcywgY2hhbm5lbCwgY2FsbGJhY2ssIGNvbnRleHQpLFxuICAgICAgICBmb3JjZSAgICAgICAgPSAoY2FsbGJhY2sgPT09IHRydWUpLFxuICAgICAgICBoYXNTdWJzY3JpYmUgPSB0aGlzLl9jaGFubmVscy5oYXNTdWJzY3JpcHRpb24oY2hhbm5lbCk7XG5cbiAgICBpZiAoaGFzU3Vic2NyaWJlICYmICFmb3JjZSkge1xuICAgICAgdGhpcy5fY2hhbm5lbHMuc3Vic2NyaWJlKFtjaGFubmVsXSwgY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgICAgc3Vic2NyaXB0aW9uLnNldERlZmVycmVkU3RhdHVzKCdzdWNjZWVkZWQnKTtcbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb247XG4gICAgfVxuXG4gICAgdGhpcy5jb25uZWN0KGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5pbmZvKCdDbGllbnQgPyBhdHRlbXB0aW5nIHRvIHN1YnNjcmliZSB0byA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgY2hhbm5lbCk7XG4gICAgICBpZiAoIWZvcmNlKSB0aGlzLl9jaGFubmVscy5zdWJzY3JpYmUoW2NoYW5uZWxdLCBjYWxsYmFjaywgY29udGV4dCk7XG5cbiAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKHtcbiAgICAgICAgY2hhbm5lbDogICAgICBGYXllLkNoYW5uZWwuU1VCU0NSSUJFLFxuICAgICAgICBjbGllbnRJZDogICAgIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQsXG4gICAgICAgIHN1YnNjcmlwdGlvbjogY2hhbm5lbFxuXG4gICAgICB9LCB7fSwgZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5zdWNjZXNzZnVsKSB7XG4gICAgICAgICAgc3Vic2NyaXB0aW9uLnNldERlZmVycmVkU3RhdHVzKCdmYWlsZWQnLCBGYXllLkVycm9yLnBhcnNlKHJlc3BvbnNlLmVycm9yKSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX2NoYW5uZWxzLnVuc3Vic2NyaWJlKGNoYW5uZWwsIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjaGFubmVscyA9IFtdLmNvbmNhdChyZXNwb25zZS5zdWJzY3JpcHRpb24pO1xuICAgICAgICB0aGlzLmluZm8oJ1N1YnNjcmlwdGlvbiBhY2tub3dsZWRnZWQgZm9yID8gdG8gPycsIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQsIGNoYW5uZWxzKTtcbiAgICAgICAgc3Vic2NyaXB0aW9uLnNldERlZmVycmVkU3RhdHVzKCdzdWNjZWVkZWQnKTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH0sIHRoaXMpO1xuXG4gICAgcmV0dXJuIHN1YnNjcmlwdGlvbjtcbiAgfSxcblxuICAvLyBSZXF1ZXN0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUmVzcG9uc2VcbiAgLy8gTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsICAgICAgICAgICAgIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbFxuICAvLyAgICAgICAgICAgICAgICAqIGNsaWVudElkICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBzdWNjZXNzZnVsXG4gIC8vICAgICAgICAgICAgICAgICogc3Vic2NyaXB0aW9uICAgICAgICAgICAgICAgICAgICAgICAqIGNsaWVudElkXG4gIC8vIE1BWSBpbmNsdWRlOiAgICogZXh0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHN1YnNjcmlwdGlvblxuICAvLyAgICAgICAgICAgICAgICAqIGlkICAgICAgICAgICAgICAgICAgTUFZIGluY2x1ZGU6ICAgKiBlcnJvclxuICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBhZHZpY2VcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogZXh0XG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGlkXG4gIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIHRpbWVzdGFtcFxuICB1bnN1YnNjcmliZTogZnVuY3Rpb24oY2hhbm5lbCwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICBpZiAoY2hhbm5lbCBpbnN0YW5jZW9mIEFycmF5KVxuICAgICAgcmV0dXJuIEZheWUubWFwKGNoYW5uZWwsIGZ1bmN0aW9uKGMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudW5zdWJzY3JpYmUoYywgY2FsbGJhY2ssIGNvbnRleHQpO1xuICAgICAgfSwgdGhpcyk7XG5cbiAgICB2YXIgZGVhZCA9IHRoaXMuX2NoYW5uZWxzLnVuc3Vic2NyaWJlKGNoYW5uZWwsIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICBpZiAoIWRlYWQpIHJldHVybjtcblxuICAgIHRoaXMuY29ubmVjdChmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMuaW5mbygnQ2xpZW50ID8gYXR0ZW1wdGluZyB0byB1bnN1YnNjcmliZSBmcm9tID8nLCB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBjaGFubmVsKTtcblxuICAgICAgdGhpcy5fc2VuZE1lc3NhZ2Uoe1xuICAgICAgICBjaGFubmVsOiAgICAgIEZheWUuQ2hhbm5lbC5VTlNVQlNDUklCRSxcbiAgICAgICAgY2xpZW50SWQ6ICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLFxuICAgICAgICBzdWJzY3JpcHRpb246IGNoYW5uZWxcblxuICAgICAgfSwge30sIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2Uuc3VjY2Vzc2Z1bCkgcmV0dXJuO1xuXG4gICAgICAgIHZhciBjaGFubmVscyA9IFtdLmNvbmNhdChyZXNwb25zZS5zdWJzY3JpcHRpb24pO1xuICAgICAgICB0aGlzLmluZm8oJ1Vuc3Vic2NyaXB0aW9uIGFja25vd2xlZGdlZCBmb3IgPyBmcm9tID8nLCB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBjaGFubmVscyk7XG4gICAgICB9LCB0aGlzKTtcbiAgICB9LCB0aGlzKTtcbiAgfSxcblxuICAvLyBSZXF1ZXN0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUmVzcG9uc2VcbiAgLy8gTVVTVCBpbmNsdWRlOiAgKiBjaGFubmVsICAgICAgICAgICAgIE1VU1QgaW5jbHVkZTogICogY2hhbm5lbFxuICAvLyAgICAgICAgICAgICAgICAqIGRhdGEgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBzdWNjZXNzZnVsXG4gIC8vIE1BWSBpbmNsdWRlOiAgICogY2xpZW50SWQgICAgICAgICAgICBNQVkgaW5jbHVkZTogICAqIGlkXG4gIC8vICAgICAgICAgICAgICAgICogaWQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGVycm9yXG4gIC8vICAgICAgICAgICAgICAgICogZXh0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4dFxuICBwdWJsaXNoOiBmdW5jdGlvbihjaGFubmVsLCBkYXRhLCBvcHRpb25zKSB7XG4gICAgRmF5ZS52YWxpZGF0ZU9wdGlvbnMob3B0aW9ucyB8fCB7fSwgWydhdHRlbXB0cycsICdkZWFkbGluZSddKTtcbiAgICB2YXIgcHVibGljYXRpb24gPSBuZXcgRmF5ZS5QdWJsaWNhdGlvbigpO1xuXG4gICAgdGhpcy5jb25uZWN0KGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5pbmZvKCdDbGllbnQgPyBxdWV1ZWluZyBwdWJsaXNoZWQgbWVzc2FnZSB0byA/OiA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCwgY2hhbm5lbCwgZGF0YSk7XG5cbiAgICAgIHRoaXMuX3NlbmRNZXNzYWdlKHtcbiAgICAgICAgY2hhbm5lbDogIGNoYW5uZWwsXG4gICAgICAgIGRhdGE6ICAgICBkYXRhLFxuICAgICAgICBjbGllbnRJZDogdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZFxuXG4gICAgICB9LCBvcHRpb25zLCBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICBpZiAocmVzcG9uc2Uuc3VjY2Vzc2Z1bClcbiAgICAgICAgICBwdWJsaWNhdGlvbi5zZXREZWZlcnJlZFN0YXR1cygnc3VjY2VlZGVkJyk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBwdWJsaWNhdGlvbi5zZXREZWZlcnJlZFN0YXR1cygnZmFpbGVkJywgRmF5ZS5FcnJvci5wYXJzZShyZXNwb25zZS5lcnJvcikpO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfSwgdGhpcyk7XG5cbiAgICByZXR1cm4gcHVibGljYXRpb247XG4gIH0sXG5cbiAgX3NlbmRNZXNzYWdlOiBmdW5jdGlvbihtZXNzYWdlLCBvcHRpb25zLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgIG1lc3NhZ2UuaWQgPSB0aGlzLl9nZW5lcmF0ZU1lc3NhZ2VJZCgpO1xuXG4gICAgdmFyIHRpbWVvdXQgPSB0aGlzLl9hZHZpY2UudGltZW91dFxuICAgICAgICAgICAgICAgID8gMS4yICogdGhpcy5fYWR2aWNlLnRpbWVvdXQgLyAxMDAwXG4gICAgICAgICAgICAgICAgOiAxLjIgKiB0aGlzLl9kaXNwYXRjaGVyLnJldHJ5O1xuXG4gICAgdGhpcy5waXBlVGhyb3VnaEV4dGVuc2lvbnMoJ291dGdvaW5nJywgbWVzc2FnZSwgbnVsbCwgZnVuY3Rpb24obWVzc2FnZSkge1xuICAgICAgaWYgKCFtZXNzYWdlKSByZXR1cm47XG4gICAgICBpZiAoY2FsbGJhY2spIHRoaXMuX3Jlc3BvbnNlQ2FsbGJhY2tzW21lc3NhZ2UuaWRdID0gW2NhbGxiYWNrLCBjb250ZXh0XTtcbiAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuc2VuZE1lc3NhZ2UobWVzc2FnZSwgdGltZW91dCwgb3B0aW9ucyB8fCB7fSk7XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgX2dlbmVyYXRlTWVzc2FnZUlkOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9tZXNzYWdlSWQgKz0gMTtcbiAgICBpZiAodGhpcy5fbWVzc2FnZUlkID49IE1hdGgucG93KDIsMzIpKSB0aGlzLl9tZXNzYWdlSWQgPSAwO1xuICAgIHJldHVybiB0aGlzLl9tZXNzYWdlSWQudG9TdHJpbmcoMzYpO1xuICB9LFxuXG4gIF9yZWNlaXZlTWVzc2FnZTogZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIHZhciBpZCA9IG1lc3NhZ2UuaWQsIGNhbGxiYWNrO1xuXG4gICAgaWYgKG1lc3NhZ2Uuc3VjY2Vzc2Z1bCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjYWxsYmFjayA9IHRoaXMuX3Jlc3BvbnNlQ2FsbGJhY2tzW2lkXTtcbiAgICAgIGRlbGV0ZSB0aGlzLl9yZXNwb25zZUNhbGxiYWNrc1tpZF07XG4gICAgfVxuXG4gICAgdGhpcy5waXBlVGhyb3VnaEV4dGVuc2lvbnMoJ2luY29taW5nJywgbWVzc2FnZSwgbnVsbCwgZnVuY3Rpb24obWVzc2FnZSkge1xuICAgICAgaWYgKCFtZXNzYWdlKSByZXR1cm47XG4gICAgICBpZiAobWVzc2FnZS5hZHZpY2UpIHRoaXMuX2hhbmRsZUFkdmljZShtZXNzYWdlLmFkdmljZSk7XG4gICAgICB0aGlzLl9kZWxpdmVyTWVzc2FnZShtZXNzYWdlKTtcbiAgICAgIGlmIChjYWxsYmFjaykgY2FsbGJhY2tbMF0uY2FsbChjYWxsYmFja1sxXSwgbWVzc2FnZSk7XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgX2hhbmRsZUFkdmljZTogZnVuY3Rpb24oYWR2aWNlKSB7XG4gICAgRmF5ZS5leHRlbmQodGhpcy5fYWR2aWNlLCBhZHZpY2UpO1xuICAgIHRoaXMuX2Rpc3BhdGNoZXIudGltZW91dCA9IHRoaXMuX2FkdmljZS50aW1lb3V0IC8gMTAwMDtcblxuICAgIGlmICh0aGlzLl9hZHZpY2UucmVjb25uZWN0ID09PSB0aGlzLkhBTkRTSEFLRSAmJiB0aGlzLl9zdGF0ZSAhPT0gdGhpcy5ESVNDT05ORUNURUQpIHtcbiAgICAgIHRoaXMuX3N0YXRlID0gdGhpcy5VTkNPTk5FQ1RFRDtcbiAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQgPSBudWxsO1xuICAgICAgdGhpcy5fY3ljbGVDb25uZWN0aW9uKCk7XG4gICAgfVxuICB9LFxuXG4gIF9kZWxpdmVyTWVzc2FnZTogZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIGlmICghbWVzc2FnZS5jaGFubmVsIHx8IG1lc3NhZ2UuZGF0YSA9PT0gdW5kZWZpbmVkKSByZXR1cm47XG4gICAgdGhpcy5pbmZvKCdDbGllbnQgPyBjYWxsaW5nIGxpc3RlbmVycyBmb3IgPyB3aXRoID8nLCB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBtZXNzYWdlLmNoYW5uZWwsIG1lc3NhZ2UuZGF0YSk7XG4gICAgdGhpcy5fY2hhbm5lbHMuZGlzdHJpYnV0ZU1lc3NhZ2UobWVzc2FnZSk7XG4gIH0sXG5cbiAgX2N5Y2xlQ29ubmVjdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuX2Nvbm5lY3RSZXF1ZXN0KSB7XG4gICAgICB0aGlzLl9jb25uZWN0UmVxdWVzdCA9IG51bGw7XG4gICAgICB0aGlzLmluZm8oJ0Nsb3NlZCBjb25uZWN0aW9uIGZvciA/JywgdGhpcy5fZGlzcGF0Y2hlci5jbGllbnRJZCk7XG4gICAgfVxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBGYXllLkVOVi5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBzZWxmLmNvbm5lY3QoKSB9LCB0aGlzLl9hZHZpY2UuaW50ZXJ2YWwpO1xuICB9XG59KTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5DbGllbnQucHJvdG90eXBlLCBGYXllLkRlZmVycmFibGUpO1xuRmF5ZS5leHRlbmQoRmF5ZS5DbGllbnQucHJvdG90eXBlLCBGYXllLlB1Ymxpc2hlcik7XG5GYXllLmV4dGVuZChGYXllLkNsaWVudC5wcm90b3R5cGUsIEZheWUuTG9nZ2luZyk7XG5GYXllLmV4dGVuZChGYXllLkNsaWVudC5wcm90b3R5cGUsIEZheWUuRXh0ZW5zaWJsZSk7XG5cbkZheWUuRGlzcGF0Y2hlciA9IEZheWUuQ2xhc3Moe1xuICBNQVhfUkVRVUVTVF9TSVpFOiAyMDQ4LFxuICBERUZBVUxUX1JFVFJZOiAgICA1LFxuXG4gIFVQOiAgIDEsXG4gIERPV046IDIsXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oY2xpZW50LCBlbmRwb2ludCwgb3B0aW9ucykge1xuICAgIHRoaXMuX2NsaWVudCAgICAgPSBjbGllbnQ7XG4gICAgdGhpcy5lbmRwb2ludCAgICA9IEZheWUuVVJJLnBhcnNlKGVuZHBvaW50KTtcbiAgICB0aGlzLl9hbHRlcm5hdGVzID0gb3B0aW9ucy5lbmRwb2ludHMgfHwge307XG5cbiAgICB0aGlzLmNvb2tpZXMgICAgICA9IEZheWUuQ29va2llcyAmJiBuZXcgRmF5ZS5Db29raWVzLkNvb2tpZUphcigpO1xuICAgIHRoaXMuX2Rpc2FibGVkICAgID0gW107XG4gICAgdGhpcy5fZW52ZWxvcGVzICAgPSB7fTtcbiAgICB0aGlzLmhlYWRlcnMgICAgICA9IHt9O1xuICAgIHRoaXMucmV0cnkgICAgICAgID0gb3B0aW9ucy5yZXRyeSB8fCB0aGlzLkRFRkFVTFRfUkVUUlk7XG4gICAgdGhpcy5fc2NoZWR1bGVyICAgPSBvcHRpb25zLnNjaGVkdWxlciB8fCBGYXllLlNjaGVkdWxlcjtcbiAgICB0aGlzLl9zdGF0ZSAgICAgICA9IDA7XG4gICAgdGhpcy50cmFuc3BvcnRzICAgPSB7fTtcbiAgICB0aGlzLndzRXh0ZW5zaW9ucyA9IFtdO1xuXG4gICAgdGhpcy5wcm94eSA9IG9wdGlvbnMucHJveHkgfHwge307XG4gICAgaWYgKHR5cGVvZiB0aGlzLl9wcm94eSA9PT0gJ3N0cmluZycpIHRoaXMuX3Byb3h5ID0ge29yaWdpbjogdGhpcy5fcHJveHl9O1xuXG4gICAgdmFyIGV4dHMgPSBvcHRpb25zLndlYnNvY2tldEV4dGVuc2lvbnM7XG4gICAgaWYgKGV4dHMpIHtcbiAgICAgIGV4dHMgPSBbXS5jb25jYXQoZXh0cyk7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGV4dHMubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgICB0aGlzLmFkZFdlYnNvY2tldEV4dGVuc2lvbihleHRzW2ldKTtcbiAgICB9XG5cbiAgICB0aGlzLnRscyA9IG9wdGlvbnMudGxzIHx8IHt9O1xuICAgIHRoaXMudGxzLmNhID0gdGhpcy50bHMuY2EgfHwgb3B0aW9ucy5jYTtcblxuICAgIGZvciAodmFyIHR5cGUgaW4gdGhpcy5fYWx0ZXJuYXRlcylcbiAgICAgIHRoaXMuX2FsdGVybmF0ZXNbdHlwZV0gPSBGYXllLlVSSS5wYXJzZSh0aGlzLl9hbHRlcm5hdGVzW3R5cGVdKTtcblxuICAgIHRoaXMubWF4UmVxdWVzdFNpemUgPSB0aGlzLk1BWF9SRVFVRVNUX1NJWkU7XG4gIH0sXG5cbiAgZW5kcG9pbnRGb3I6IGZ1bmN0aW9uKGNvbm5lY3Rpb25UeXBlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FsdGVybmF0ZXNbY29ubmVjdGlvblR5cGVdIHx8IHRoaXMuZW5kcG9pbnQ7XG4gIH0sXG5cbiAgYWRkV2Vic29ja2V0RXh0ZW5zaW9uOiBmdW5jdGlvbihleHRlbnNpb24pIHtcbiAgICB0aGlzLndzRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG4gIH0sXG5cbiAgZGlzYWJsZTogZnVuY3Rpb24oZmVhdHVyZSkge1xuICAgIHRoaXMuX2Rpc2FibGVkLnB1c2goZmVhdHVyZSk7XG4gIH0sXG5cbiAgc2V0SGVhZGVyOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuICAgIHRoaXMuaGVhZGVyc1tuYW1lXSA9IHZhbHVlO1xuICB9LFxuXG4gIGNsb3NlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdHJhbnNwb3J0ID0gdGhpcy5fdHJhbnNwb3J0O1xuICAgIGRlbGV0ZSB0aGlzLl90cmFuc3BvcnQ7XG4gICAgaWYgKHRyYW5zcG9ydCkgdHJhbnNwb3J0LmNsb3NlKCk7XG4gIH0sXG5cbiAgZ2V0Q29ubmVjdGlvblR5cGVzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gRmF5ZS5UcmFuc3BvcnQuZ2V0Q29ubmVjdGlvblR5cGVzKCk7XG4gIH0sXG5cbiAgc2VsZWN0VHJhbnNwb3J0OiBmdW5jdGlvbih0cmFuc3BvcnRUeXBlcykge1xuICAgIEZheWUuVHJhbnNwb3J0LmdldCh0aGlzLCB0cmFuc3BvcnRUeXBlcywgdGhpcy5fZGlzYWJsZWQsIGZ1bmN0aW9uKHRyYW5zcG9ydCkge1xuICAgICAgdGhpcy5kZWJ1ZygnU2VsZWN0ZWQgPyB0cmFuc3BvcnQgZm9yID8nLCB0cmFuc3BvcnQuY29ubmVjdGlvblR5cGUsIEZheWUuVVJJLnN0cmluZ2lmeSh0cmFuc3BvcnQuZW5kcG9pbnQpKTtcblxuICAgICAgaWYgKHRyYW5zcG9ydCA9PT0gdGhpcy5fdHJhbnNwb3J0KSByZXR1cm47XG4gICAgICBpZiAodGhpcy5fdHJhbnNwb3J0KSB0aGlzLl90cmFuc3BvcnQuY2xvc2UoKTtcblxuICAgICAgdGhpcy5fdHJhbnNwb3J0ID0gdHJhbnNwb3J0O1xuICAgICAgdGhpcy5jb25uZWN0aW9uVHlwZSA9IHRyYW5zcG9ydC5jb25uZWN0aW9uVHlwZTtcbiAgICB9LCB0aGlzKTtcbiAgfSxcblxuICBzZW5kTWVzc2FnZTogZnVuY3Rpb24obWVzc2FnZSwgdGltZW91dCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgdmFyIGlkICAgICAgID0gbWVzc2FnZS5pZCxcbiAgICAgICAgYXR0ZW1wdHMgPSBvcHRpb25zLmF0dGVtcHRzLFxuICAgICAgICBkZWFkbGluZSA9IG9wdGlvbnMuZGVhZGxpbmUgJiYgbmV3IERhdGUoKS5nZXRUaW1lKCkgKyAob3B0aW9ucy5kZWFkbGluZSAqIDEwMDApLFxuICAgICAgICBlbnZlbG9wZSA9IHRoaXMuX2VudmVsb3Blc1tpZF0sXG4gICAgICAgIHNjaGVkdWxlcjtcblxuICAgIGlmICghZW52ZWxvcGUpIHtcbiAgICAgIHNjaGVkdWxlciA9IG5ldyB0aGlzLl9zY2hlZHVsZXIobWVzc2FnZSwge3RpbWVvdXQ6IHRpbWVvdXQsIGludGVydmFsOiB0aGlzLnJldHJ5LCBhdHRlbXB0czogYXR0ZW1wdHMsIGRlYWRsaW5lOiBkZWFkbGluZX0pO1xuICAgICAgZW52ZWxvcGUgID0gdGhpcy5fZW52ZWxvcGVzW2lkXSA9IHttZXNzYWdlOiBtZXNzYWdlLCBzY2hlZHVsZXI6IHNjaGVkdWxlcn07XG4gICAgfVxuXG4gICAgdGhpcy5fc2VuZEVudmVsb3BlKGVudmVsb3BlKTtcbiAgfSxcblxuICBfc2VuZEVudmVsb3BlOiBmdW5jdGlvbihlbnZlbG9wZSkge1xuICAgIGlmICghdGhpcy5fdHJhbnNwb3J0KSByZXR1cm47XG4gICAgaWYgKGVudmVsb3BlLnJlcXVlc3QgfHwgZW52ZWxvcGUudGltZXIpIHJldHVybjtcblxuICAgIHZhciBtZXNzYWdlICAgPSBlbnZlbG9wZS5tZXNzYWdlLFxuICAgICAgICBzY2hlZHVsZXIgPSBlbnZlbG9wZS5zY2hlZHVsZXIsXG4gICAgICAgIHNlbGYgICAgICA9IHRoaXM7XG5cbiAgICBpZiAoIXNjaGVkdWxlci5pc0RlbGl2ZXJhYmxlKCkpIHtcbiAgICAgIHNjaGVkdWxlci5hYm9ydCgpO1xuICAgICAgZGVsZXRlIHRoaXMuX2VudmVsb3Blc1ttZXNzYWdlLmlkXTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBlbnZlbG9wZS50aW1lciA9IEZheWUuRU5WLnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBzZWxmLmhhbmRsZUVycm9yKG1lc3NhZ2UpO1xuICAgIH0sIHNjaGVkdWxlci5nZXRUaW1lb3V0KCkgKiAxMDAwKTtcblxuICAgIHNjaGVkdWxlci5zZW5kKCk7XG4gICAgZW52ZWxvcGUucmVxdWVzdCA9IHRoaXMuX3RyYW5zcG9ydC5zZW5kTWVzc2FnZShtZXNzYWdlKTtcbiAgfSxcblxuICBoYW5kbGVSZXNwb25zZTogZnVuY3Rpb24ocmVwbHkpIHtcbiAgICB2YXIgZW52ZWxvcGUgPSB0aGlzLl9lbnZlbG9wZXNbcmVwbHkuaWRdO1xuXG4gICAgaWYgKHJlcGx5LnN1Y2Nlc3NmdWwgIT09IHVuZGVmaW5lZCAmJiBlbnZlbG9wZSkge1xuICAgICAgZW52ZWxvcGUuc2NoZWR1bGVyLnN1Y2NlZWQoKTtcbiAgICAgIGRlbGV0ZSB0aGlzLl9lbnZlbG9wZXNbcmVwbHkuaWRdO1xuICAgICAgRmF5ZS5FTlYuY2xlYXJUaW1lb3V0KGVudmVsb3BlLnRpbWVyKTtcbiAgICB9XG5cbiAgICB0aGlzLnRyaWdnZXIoJ21lc3NhZ2UnLCByZXBseSk7XG5cbiAgICBpZiAodGhpcy5fc3RhdGUgPT09IHRoaXMuVVApIHJldHVybjtcbiAgICB0aGlzLl9zdGF0ZSA9IHRoaXMuVVA7XG4gICAgdGhpcy5fY2xpZW50LnRyaWdnZXIoJ3RyYW5zcG9ydDp1cCcpO1xuICB9LFxuXG4gIGhhbmRsZUVycm9yOiBmdW5jdGlvbihtZXNzYWdlLCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgZW52ZWxvcGUgPSB0aGlzLl9lbnZlbG9wZXNbbWVzc2FnZS5pZF0sXG4gICAgICAgIHJlcXVlc3QgID0gZW52ZWxvcGUgJiYgZW52ZWxvcGUucmVxdWVzdCxcbiAgICAgICAgc2VsZiAgICAgPSB0aGlzO1xuXG4gICAgaWYgKCFyZXF1ZXN0KSByZXR1cm47XG5cbiAgICByZXF1ZXN0LnRoZW4oZnVuY3Rpb24ocmVxKSB7XG4gICAgICBpZiAocmVxICYmIHJlcS5hYm9ydCkgcmVxLmFib3J0KCk7XG4gICAgfSk7XG5cbiAgICB2YXIgc2NoZWR1bGVyID0gZW52ZWxvcGUuc2NoZWR1bGVyO1xuICAgIHNjaGVkdWxlci5mYWlsKCk7XG5cbiAgICBGYXllLkVOVi5jbGVhclRpbWVvdXQoZW52ZWxvcGUudGltZXIpO1xuICAgIGVudmVsb3BlLnJlcXVlc3QgPSBlbnZlbG9wZS50aW1lciA9IG51bGw7XG5cbiAgICBpZiAoaW1tZWRpYXRlKSB7XG4gICAgICB0aGlzLl9zZW5kRW52ZWxvcGUoZW52ZWxvcGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbnZlbG9wZS50aW1lciA9IEZheWUuRU5WLnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIGVudmVsb3BlLnRpbWVyID0gbnVsbDtcbiAgICAgICAgc2VsZi5fc2VuZEVudmVsb3BlKGVudmVsb3BlKTtcbiAgICAgIH0sIHNjaGVkdWxlci5nZXRJbnRlcnZhbCgpICogMTAwMCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSB0aGlzLkRPV04pIHJldHVybjtcbiAgICB0aGlzLl9zdGF0ZSA9IHRoaXMuRE9XTjtcbiAgICB0aGlzLl9jbGllbnQudHJpZ2dlcigndHJhbnNwb3J0OmRvd24nKTtcbiAgfVxufSk7XG5cbkZheWUuZXh0ZW5kKEZheWUuRGlzcGF0Y2hlci5wcm90b3R5cGUsIEZheWUuUHVibGlzaGVyKTtcbkZheWUuZXh0ZW5kKEZheWUuRGlzcGF0Y2hlci5wcm90b3R5cGUsIEZheWUuTG9nZ2luZyk7XG5cbkZheWUuU2NoZWR1bGVyID0gZnVuY3Rpb24obWVzc2FnZSwgb3B0aW9ucykge1xuICB0aGlzLm1lc3NhZ2UgID0gbWVzc2FnZTtcbiAgdGhpcy5vcHRpb25zICA9IG9wdGlvbnM7XG4gIHRoaXMuYXR0ZW1wdHMgPSAwO1xufTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5TY2hlZHVsZXIucHJvdG90eXBlLCB7XG4gIGdldFRpbWVvdXQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLm9wdGlvbnMudGltZW91dDtcbiAgfSxcblxuICBnZXRJbnRlcnZhbDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMub3B0aW9ucy5pbnRlcnZhbDtcbiAgfSxcblxuICBpc0RlbGl2ZXJhYmxlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXR0ZW1wdHMgPSB0aGlzLm9wdGlvbnMuYXR0ZW1wdHMsXG4gICAgICAgIG1hZGUgICAgID0gdGhpcy5hdHRlbXB0cyxcbiAgICAgICAgZGVhZGxpbmUgPSB0aGlzLm9wdGlvbnMuZGVhZGxpbmUsXG4gICAgICAgIG5vdyAgICAgID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICBpZiAoYXR0ZW1wdHMgIT09IHVuZGVmaW5lZCAmJiBtYWRlID49IGF0dGVtcHRzKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgaWYgKGRlYWRsaW5lICE9PSB1bmRlZmluZWQgJiYgbm93ID4gZGVhZGxpbmUpXG4gICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcblxuICBzZW5kOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmF0dGVtcHRzICs9IDE7XG4gIH0sXG5cbiAgc3VjY2VlZDogZnVuY3Rpb24oKSB7fSxcblxuICBmYWlsOiBmdW5jdGlvbigpIHt9LFxuXG4gIGFib3J0OiBmdW5jdGlvbigpIHt9XG59KTtcblxuRmF5ZS5UcmFuc3BvcnQgPSBGYXllLmV4dGVuZChGYXllLkNsYXNzKHtcbiAgREVGQVVMVF9QT1JUUzogICAgeydodHRwOic6IDgwLCAnaHR0cHM6JzogNDQzLCAnd3M6JzogODAsICd3c3M6JzogNDQzfSxcbiAgU0VDVVJFX1BST1RPQ09MUzogWydodHRwczonLCAnd3NzOiddLFxuICBNQVhfREVMQVk6ICAgICAgICAwLFxuXG4gIGJhdGNoaW5nOiAgdHJ1ZSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbihkaXNwYXRjaGVyLCBlbmRwb2ludCkge1xuICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSBkaXNwYXRjaGVyO1xuICAgIHRoaXMuZW5kcG9pbnQgICAgPSBlbmRwb2ludDtcbiAgICB0aGlzLl9vdXRib3ggICAgID0gW107XG4gICAgdGhpcy5fcHJveHkgICAgICA9IEZheWUuZXh0ZW5kKHt9LCB0aGlzLl9kaXNwYXRjaGVyLnByb3h5KTtcblxuICAgIGlmICghdGhpcy5fcHJveHkub3JpZ2luICYmIEZheWUuTm9kZUFkYXB0ZXIpIHtcbiAgICAgIHRoaXMuX3Byb3h5Lm9yaWdpbiA9IEZheWUuaW5kZXhPZih0aGlzLlNFQ1VSRV9QUk9UT0NPTFMsIHRoaXMuZW5kcG9pbnQucHJvdG9jb2wpID49IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICA/IChwcm9jZXNzLmVudi5IVFRQU19QUk9YWSB8fCBwcm9jZXNzLmVudi5odHRwc19wcm94eSlcbiAgICAgICAgICAgICAgICAgICAgICAgICA6IChwcm9jZXNzLmVudi5IVFRQX1BST1hZICB8fCBwcm9jZXNzLmVudi5odHRwX3Byb3h5KTtcbiAgICB9XG4gIH0sXG5cbiAgY2xvc2U6IGZ1bmN0aW9uKCkge30sXG5cbiAgZW5jb2RlOiBmdW5jdGlvbihtZXNzYWdlcykge1xuICAgIHJldHVybiAnJztcbiAgfSxcblxuICBzZW5kTWVzc2FnZTogZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIHRoaXMuZGVidWcoJ0NsaWVudCA/IHNlbmRpbmcgbWVzc2FnZSB0byA/OiA/JyxcbiAgICAgICAgICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuY2xpZW50SWQsIEZheWUuVVJJLnN0cmluZ2lmeSh0aGlzLmVuZHBvaW50KSwgbWVzc2FnZSk7XG5cbiAgICBpZiAoIXRoaXMuYmF0Y2hpbmcpIHJldHVybiBGYXllLlByb21pc2UuZnVsZmlsbGVkKHRoaXMucmVxdWVzdChbbWVzc2FnZV0pKTtcblxuICAgIHRoaXMuX291dGJveC5wdXNoKG1lc3NhZ2UpO1xuICAgIHRoaXMuX3Byb21pc2UgPSB0aGlzLl9wcm9taXNlIHx8IG5ldyBGYXllLlByb21pc2UoKTtcbiAgICB0aGlzLl9mbHVzaExhcmdlQmF0Y2goKTtcblxuICAgIGlmIChtZXNzYWdlLmNoYW5uZWwgPT09IEZheWUuQ2hhbm5lbC5IQU5EU0hBS0UpIHtcbiAgICAgIHRoaXMuYWRkVGltZW91dCgncHVibGlzaCcsIDAuMDEsIHRoaXMuX2ZsdXNoLCB0aGlzKTtcbiAgICAgIHJldHVybiB0aGlzLl9wcm9taXNlO1xuICAgIH1cblxuICAgIGlmIChtZXNzYWdlLmNoYW5uZWwgPT09IEZheWUuQ2hhbm5lbC5DT05ORUNUKVxuICAgICAgdGhpcy5fY29ubmVjdE1lc3NhZ2UgPSBtZXNzYWdlO1xuXG4gICAgdGhpcy5hZGRUaW1lb3V0KCdwdWJsaXNoJywgdGhpcy5NQVhfREVMQVksIHRoaXMuX2ZsdXNoLCB0aGlzKTtcbiAgICByZXR1cm4gdGhpcy5fcHJvbWlzZTtcbiAgfSxcblxuICBfZmx1c2g6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVtb3ZlVGltZW91dCgncHVibGlzaCcpO1xuXG4gICAgaWYgKHRoaXMuX291dGJveC5sZW5ndGggPiAxICYmIHRoaXMuX2Nvbm5lY3RNZXNzYWdlKVxuICAgICAgdGhpcy5fY29ubmVjdE1lc3NhZ2UuYWR2aWNlID0ge3RpbWVvdXQ6IDB9O1xuXG4gICAgRmF5ZS5Qcm9taXNlLmZ1bGZpbGwodGhpcy5fcHJvbWlzZSwgdGhpcy5yZXF1ZXN0KHRoaXMuX291dGJveCkpO1xuICAgIGRlbGV0ZSB0aGlzLl9wcm9taXNlO1xuXG4gICAgdGhpcy5fY29ubmVjdE1lc3NhZ2UgPSBudWxsO1xuICAgIHRoaXMuX291dGJveCA9IFtdO1xuICB9LFxuXG4gIF9mbHVzaExhcmdlQmF0Y2g6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzdHJpbmcgPSB0aGlzLmVuY29kZSh0aGlzLl9vdXRib3gpO1xuICAgIGlmIChzdHJpbmcubGVuZ3RoIDwgdGhpcy5fZGlzcGF0Y2hlci5tYXhSZXF1ZXN0U2l6ZSkgcmV0dXJuO1xuICAgIHZhciBsYXN0ID0gdGhpcy5fb3V0Ym94LnBvcCgpO1xuICAgIHRoaXMuX2ZsdXNoKCk7XG4gICAgaWYgKGxhc3QpIHRoaXMuX291dGJveC5wdXNoKGxhc3QpO1xuICB9LFxuXG4gIF9yZWNlaXZlOiBmdW5jdGlvbihyZXBsaWVzKSB7XG4gICAgaWYgKCFyZXBsaWVzKSByZXR1cm47XG4gICAgcmVwbGllcyA9IFtdLmNvbmNhdChyZXBsaWVzKTtcblxuICAgIHRoaXMuZGVidWcoJ0NsaWVudCA/IHJlY2VpdmVkIGZyb20gPyB2aWEgPzogPycsXG4gICAgICAgICAgICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBGYXllLlVSSS5zdHJpbmdpZnkodGhpcy5lbmRwb2ludCksIHRoaXMuY29ubmVjdGlvblR5cGUsIHJlcGxpZXMpO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIG4gPSByZXBsaWVzLmxlbmd0aDsgaSA8IG47IGkrKylcbiAgICAgIHRoaXMuX2Rpc3BhdGNoZXIuaGFuZGxlUmVzcG9uc2UocmVwbGllc1tpXSk7XG4gIH0sXG5cbiAgX2hhbmRsZUVycm9yOiBmdW5jdGlvbihtZXNzYWdlcywgaW1tZWRpYXRlKSB7XG4gICAgbWVzc2FnZXMgPSBbXS5jb25jYXQobWVzc2FnZXMpO1xuXG4gICAgdGhpcy5kZWJ1ZygnQ2xpZW50ID8gZmFpbGVkIHRvIHNlbmQgdG8gPyB2aWEgPzogPycsXG4gICAgICAgICAgICAgICB0aGlzLl9kaXNwYXRjaGVyLmNsaWVudElkLCBGYXllLlVSSS5zdHJpbmdpZnkodGhpcy5lbmRwb2ludCksIHRoaXMuY29ubmVjdGlvblR5cGUsIG1lc3NhZ2VzKTtcblxuICAgIGZvciAodmFyIGkgPSAwLCBuID0gbWVzc2FnZXMubGVuZ3RoOyBpIDwgbjsgaSsrKVxuICAgICAgdGhpcy5fZGlzcGF0Y2hlci5oYW5kbGVFcnJvcihtZXNzYWdlc1tpXSk7XG4gIH0sXG5cbiAgX2dldENvb2tpZXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb29raWVzID0gdGhpcy5fZGlzcGF0Y2hlci5jb29raWVzLFxuICAgICAgICB1cmwgICAgID0gRmF5ZS5VUkkuc3RyaW5naWZ5KHRoaXMuZW5kcG9pbnQpO1xuXG4gICAgaWYgKCFjb29raWVzKSByZXR1cm4gJyc7XG5cbiAgICByZXR1cm4gRmF5ZS5tYXAoY29va2llcy5nZXRDb29raWVzU3luYyh1cmwpLCBmdW5jdGlvbihjb29raWUpIHtcbiAgICAgIHJldHVybiBjb29raWUuY29va2llU3RyaW5nKCk7XG4gICAgfSkuam9pbignOyAnKTtcbiAgfSxcblxuICBfc3RvcmVDb29raWVzOiBmdW5jdGlvbihzZXRDb29raWUpIHtcbiAgICB2YXIgY29va2llcyA9IHRoaXMuX2Rpc3BhdGNoZXIuY29va2llcyxcbiAgICAgICAgdXJsICAgICA9IEZheWUuVVJJLnN0cmluZ2lmeSh0aGlzLmVuZHBvaW50KSxcbiAgICAgICAgY29va2llO1xuXG4gICAgaWYgKCFzZXRDb29raWUgfHwgIWNvb2tpZXMpIHJldHVybjtcbiAgICBzZXRDb29raWUgPSBbXS5jb25jYXQoc2V0Q29va2llKTtcblxuICAgIGZvciAodmFyIGkgPSAwLCBuID0gc2V0Q29va2llLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgY29va2llID0gRmF5ZS5Db29raWVzLkNvb2tpZS5wYXJzZShzZXRDb29raWVbaV0pO1xuICAgICAgY29va2llcy5zZXRDb29raWVTeW5jKGNvb2tpZSwgdXJsKTtcbiAgICB9XG4gIH1cblxufSksIHtcbiAgZ2V0OiBmdW5jdGlvbihkaXNwYXRjaGVyLCBhbGxvd2VkLCBkaXNhYmxlZCwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB2YXIgZW5kcG9pbnQgPSBkaXNwYXRjaGVyLmVuZHBvaW50O1xuXG4gICAgRmF5ZS5hc3luY0VhY2godGhpcy5fdHJhbnNwb3J0cywgZnVuY3Rpb24ocGFpciwgcmVzdW1lKSB7XG4gICAgICB2YXIgY29ublR5cGUgICAgID0gcGFpclswXSwga2xhc3MgPSBwYWlyWzFdLFxuICAgICAgICAgIGNvbm5FbmRwb2ludCA9IGRpc3BhdGNoZXIuZW5kcG9pbnRGb3IoY29ublR5cGUpO1xuXG4gICAgICBpZiAoRmF5ZS5pbmRleE9mKGRpc2FibGVkLCBjb25uVHlwZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIHJlc3VtZSgpO1xuXG4gICAgICBpZiAoRmF5ZS5pbmRleE9mKGFsbG93ZWQsIGNvbm5UeXBlKSA8IDApIHtcbiAgICAgICAga2xhc3MuaXNVc2FibGUoZGlzcGF0Y2hlciwgY29ubkVuZHBvaW50LCBmdW5jdGlvbigpIHt9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VtZSgpO1xuICAgICAgfVxuXG4gICAgICBrbGFzcy5pc1VzYWJsZShkaXNwYXRjaGVyLCBjb25uRW5kcG9pbnQsIGZ1bmN0aW9uKGlzVXNhYmxlKSB7XG4gICAgICAgIGlmICghaXNVc2FibGUpIHJldHVybiByZXN1bWUoKTtcbiAgICAgICAgdmFyIHRyYW5zcG9ydCA9IGtsYXNzLmhhc093blByb3BlcnR5KCdjcmVhdGUnKSA/IGtsYXNzLmNyZWF0ZShkaXNwYXRjaGVyLCBjb25uRW5kcG9pbnQpIDogbmV3IGtsYXNzKGRpc3BhdGNoZXIsIGNvbm5FbmRwb2ludCk7XG4gICAgICAgIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgdHJhbnNwb3J0KTtcbiAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBhIHVzYWJsZSBjb25uZWN0aW9uIHR5cGUgZm9yICcgKyBGYXllLlVSSS5zdHJpbmdpZnkoZW5kcG9pbnQpKTtcbiAgICB9KTtcbiAgfSxcblxuICByZWdpc3RlcjogZnVuY3Rpb24odHlwZSwga2xhc3MpIHtcbiAgICB0aGlzLl90cmFuc3BvcnRzLnB1c2goW3R5cGUsIGtsYXNzXSk7XG4gICAga2xhc3MucHJvdG90eXBlLmNvbm5lY3Rpb25UeXBlID0gdHlwZTtcbiAgfSxcblxuICBnZXRDb25uZWN0aW9uVHlwZXM6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBGYXllLm1hcCh0aGlzLl90cmFuc3BvcnRzLCBmdW5jdGlvbih0KSB7IHJldHVybiB0WzBdIH0pO1xuICB9LFxuXG4gIF90cmFuc3BvcnRzOiBbXVxufSk7XG5cbkZheWUuZXh0ZW5kKEZheWUuVHJhbnNwb3J0LnByb3RvdHlwZSwgRmF5ZS5Mb2dnaW5nKTtcbkZheWUuZXh0ZW5kKEZheWUuVHJhbnNwb3J0LnByb3RvdHlwZSwgRmF5ZS5UaW1lb3V0cyk7XG5cbkZheWUuRXZlbnQgPSB7XG4gIF9yZWdpc3RyeTogW10sXG5cbiAgb246IGZ1bmN0aW9uKGVsZW1lbnQsIGV2ZW50TmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB2YXIgd3JhcHBlZCA9IGZ1bmN0aW9uKCkgeyBjYWxsYmFjay5jYWxsKGNvbnRleHQpIH07XG5cbiAgICBpZiAoZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKVxuICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgd3JhcHBlZCwgZmFsc2UpO1xuICAgIGVsc2VcbiAgICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50TmFtZSwgd3JhcHBlZCk7XG5cbiAgICB0aGlzLl9yZWdpc3RyeS5wdXNoKHtcbiAgICAgIF9lbGVtZW50OiAgIGVsZW1lbnQsXG4gICAgICBfdHlwZTogICAgICBldmVudE5hbWUsXG4gICAgICBfY2FsbGJhY2s6ICBjYWxsYmFjayxcbiAgICAgIF9jb250ZXh0OiAgICAgY29udGV4dCxcbiAgICAgIF9oYW5kbGVyOiAgIHdyYXBwZWRcbiAgICB9KTtcbiAgfSxcblxuICBkZXRhY2g6IGZ1bmN0aW9uKGVsZW1lbnQsIGV2ZW50TmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB2YXIgaSA9IHRoaXMuX3JlZ2lzdHJ5Lmxlbmd0aCwgcmVnaXN0ZXI7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgcmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RyeVtpXTtcblxuICAgICAgaWYgKChlbGVtZW50ICAgICYmIGVsZW1lbnQgICAgIT09IHJlZ2lzdGVyLl9lbGVtZW50KSAgIHx8XG4gICAgICAgICAgKGV2ZW50TmFtZSAgJiYgZXZlbnROYW1lICAhPT0gcmVnaXN0ZXIuX3R5cGUpICAgICAgfHxcbiAgICAgICAgICAoY2FsbGJhY2sgICAmJiBjYWxsYmFjayAgICE9PSByZWdpc3Rlci5fY2FsbGJhY2spICB8fFxuICAgICAgICAgIChjb250ZXh0ICAgICAgJiYgY29udGV4dCAgICAgICE9PSByZWdpc3Rlci5fY29udGV4dCkpXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICBpZiAocmVnaXN0ZXIuX2VsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcilcbiAgICAgICAgcmVnaXN0ZXIuX2VsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihyZWdpc3Rlci5fdHlwZSwgcmVnaXN0ZXIuX2hhbmRsZXIsIGZhbHNlKTtcbiAgICAgIGVsc2VcbiAgICAgICAgcmVnaXN0ZXIuX2VsZW1lbnQuZGV0YWNoRXZlbnQoJ29uJyArIHJlZ2lzdGVyLl90eXBlLCByZWdpc3Rlci5faGFuZGxlcik7XG5cbiAgICAgIHRoaXMuX3JlZ2lzdHJ5LnNwbGljZShpLDEpO1xuICAgICAgcmVnaXN0ZXIgPSBudWxsO1xuICAgIH1cbiAgfVxufTtcblxuaWYgKEZheWUuRU5WLm9udW5sb2FkICE9PSB1bmRlZmluZWQpIEZheWUuRXZlbnQub24oRmF5ZS5FTlYsICd1bmxvYWQnLCBGYXllLkV2ZW50LmRldGFjaCwgRmF5ZS5FdmVudCk7XG5cbi8qXG4gICAganNvbjIuanNcbiAgICAyMDEzLTA1LTI2XG5cbiAgICBQdWJsaWMgRG9tYWluLlxuXG4gICAgTk8gV0FSUkFOVFkgRVhQUkVTU0VEIE9SIElNUExJRUQuIFVTRSBBVCBZT1VSIE9XTiBSSVNLLlxuXG4gICAgU2VlIGh0dHA6Ly93d3cuSlNPTi5vcmcvanMuaHRtbFxuXG5cbiAgICBUaGlzIGNvZGUgc2hvdWxkIGJlIG1pbmlmaWVkIGJlZm9yZSBkZXBsb3ltZW50LlxuICAgIFNlZSBodHRwOi8vamF2YXNjcmlwdC5jcm9ja2ZvcmQuY29tL2pzbWluLmh0bWxcblxuICAgIFVTRSBZT1VSIE9XTiBDT1BZLiBJVCBJUyBFWFRSRU1FTFkgVU5XSVNFIFRPIExPQUQgQ09ERSBGUk9NIFNFUlZFUlMgWU9VIERPXG4gICAgTk9UIENPTlRST0wuXG5cblxuICAgIFRoaXMgZmlsZSBjcmVhdGVzIGEgZ2xvYmFsIEpTT04gb2JqZWN0IGNvbnRhaW5pbmcgdHdvIG1ldGhvZHM6IHN0cmluZ2lmeVxuICAgIGFuZCBwYXJzZS5cblxuICAgICAgICBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgcmVwbGFjZXIsIHNwYWNlKVxuICAgICAgICAgICAgdmFsdWUgICAgICAgYW55IEphdmFTY3JpcHQgdmFsdWUsIHVzdWFsbHkgYW4gb2JqZWN0IG9yIGFycmF5LlxuXG4gICAgICAgICAgICByZXBsYWNlciAgICBhbiBvcHRpb25hbCBwYXJhbWV0ZXIgdGhhdCBkZXRlcm1pbmVzIGhvdyBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlcyBhcmUgc3RyaW5naWZpZWQgZm9yIG9iamVjdHMuIEl0IGNhbiBiZSBhXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBvciBhbiBhcnJheSBvZiBzdHJpbmdzLlxuXG4gICAgICAgICAgICBzcGFjZSAgICAgICBhbiBvcHRpb25hbCBwYXJhbWV0ZXIgdGhhdCBzcGVjaWZpZXMgdGhlIGluZGVudGF0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICBvZiBuZXN0ZWQgc3RydWN0dXJlcy4gSWYgaXQgaXMgb21pdHRlZCwgdGhlIHRleHQgd2lsbFxuICAgICAgICAgICAgICAgICAgICAgICAgYmUgcGFja2VkIHdpdGhvdXQgZXh0cmEgd2hpdGVzcGFjZS4gSWYgaXQgaXMgYSBudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpdCB3aWxsIHNwZWNpZnkgdGhlIG51bWJlciBvZiBzcGFjZXMgdG8gaW5kZW50IGF0IGVhY2hcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldmVsLiBJZiBpdCBpcyBhIHN0cmluZyAoc3VjaCBhcyAnXFx0JyBvciAnJm5ic3A7JyksXG4gICAgICAgICAgICAgICAgICAgICAgICBpdCBjb250YWlucyB0aGUgY2hhcmFjdGVycyB1c2VkIHRvIGluZGVudCBhdCBlYWNoIGxldmVsLlxuXG4gICAgICAgICAgICBUaGlzIG1ldGhvZCBwcm9kdWNlcyBhIEpTT04gdGV4dCBmcm9tIGEgSmF2YVNjcmlwdCB2YWx1ZS5cblxuICAgICAgICAgICAgV2hlbiBhbiBvYmplY3QgdmFsdWUgaXMgZm91bmQsIGlmIHRoZSBvYmplY3QgY29udGFpbnMgYSB0b0pTT05cbiAgICAgICAgICAgIG1ldGhvZCwgaXRzIHRvSlNPTiBtZXRob2Qgd2lsbCBiZSBjYWxsZWQgYW5kIHRoZSByZXN1bHQgd2lsbCBiZVxuICAgICAgICAgICAgc3RyaW5naWZpZWQuIEEgdG9KU09OIG1ldGhvZCBkb2VzIG5vdCBzZXJpYWxpemU6IGl0IHJldHVybnMgdGhlXG4gICAgICAgICAgICB2YWx1ZSByZXByZXNlbnRlZCBieSB0aGUgbmFtZS92YWx1ZSBwYWlyIHRoYXQgc2hvdWxkIGJlIHNlcmlhbGl6ZWQsXG4gICAgICAgICAgICBvciB1bmRlZmluZWQgaWYgbm90aGluZyBzaG91bGQgYmUgc2VyaWFsaXplZC4gVGhlIHRvSlNPTiBtZXRob2RcbiAgICAgICAgICAgIHdpbGwgYmUgcGFzc2VkIHRoZSBrZXkgYXNzb2NpYXRlZCB3aXRoIHRoZSB2YWx1ZSwgYW5kIHRoaXMgd2lsbCBiZVxuICAgICAgICAgICAgYm91bmQgdG8gdGhlIHZhbHVlXG5cbiAgICAgICAgICAgIEZvciBleGFtcGxlLCB0aGlzIHdvdWxkIHNlcmlhbGl6ZSBEYXRlcyBhcyBJU08gc3RyaW5ncy5cblxuICAgICAgICAgICAgICAgIERhdGUucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gZihuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3JtYXQgaW50ZWdlcnMgdG8gaGF2ZSBhdCBsZWFzdCB0d28gZGlnaXRzLlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4gOiBuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VVRDRnVsbFllYXIoKSAgICsgJy0nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDTW9udGgoKSArIDEpICsgJy0nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDRGF0ZSgpKSAgICAgICsgJ1QnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDSG91cnMoKSkgICAgICsgJzonICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDTWludXRlcygpKSAgICsgJzonICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDU2Vjb25kcygpKSAgICsgJ1onO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIFlvdSBjYW4gcHJvdmlkZSBhbiBvcHRpb25hbCByZXBsYWNlciBtZXRob2QuIEl0IHdpbGwgYmUgcGFzc2VkIHRoZVxuICAgICAgICAgICAga2V5IGFuZCB2YWx1ZSBvZiBlYWNoIG1lbWJlciwgd2l0aCB0aGlzIGJvdW5kIHRvIHRoZSBjb250YWluaW5nXG4gICAgICAgICAgICBvYmplY3QuIFRoZSB2YWx1ZSB0aGF0IGlzIHJldHVybmVkIGZyb20geW91ciBtZXRob2Qgd2lsbCBiZVxuICAgICAgICAgICAgc2VyaWFsaXplZC4gSWYgeW91ciBtZXRob2QgcmV0dXJucyB1bmRlZmluZWQsIHRoZW4gdGhlIG1lbWJlciB3aWxsXG4gICAgICAgICAgICBiZSBleGNsdWRlZCBmcm9tIHRoZSBzZXJpYWxpemF0aW9uLlxuXG4gICAgICAgICAgICBJZiB0aGUgcmVwbGFjZXIgcGFyYW1ldGVyIGlzIGFuIGFycmF5IG9mIHN0cmluZ3MsIHRoZW4gaXQgd2lsbCBiZVxuICAgICAgICAgICAgdXNlZCB0byBzZWxlY3QgdGhlIG1lbWJlcnMgdG8gYmUgc2VyaWFsaXplZC4gSXQgZmlsdGVycyB0aGUgcmVzdWx0c1xuICAgICAgICAgICAgc3VjaCB0aGF0IG9ubHkgbWVtYmVycyB3aXRoIGtleXMgbGlzdGVkIGluIHRoZSByZXBsYWNlciBhcnJheSBhcmVcbiAgICAgICAgICAgIHN0cmluZ2lmaWVkLlxuXG4gICAgICAgICAgICBWYWx1ZXMgdGhhdCBkbyBub3QgaGF2ZSBKU09OIHJlcHJlc2VudGF0aW9ucywgc3VjaCBhcyB1bmRlZmluZWQgb3JcbiAgICAgICAgICAgIGZ1bmN0aW9ucywgd2lsbCBub3QgYmUgc2VyaWFsaXplZC4gU3VjaCB2YWx1ZXMgaW4gb2JqZWN0cyB3aWxsIGJlXG4gICAgICAgICAgICBkcm9wcGVkOyBpbiBhcnJheXMgdGhleSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggbnVsbC4gWW91IGNhbiB1c2VcbiAgICAgICAgICAgIGEgcmVwbGFjZXIgZnVuY3Rpb24gdG8gcmVwbGFjZSB0aG9zZSB3aXRoIEpTT04gdmFsdWVzLlxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodW5kZWZpbmVkKSByZXR1cm5zIHVuZGVmaW5lZC5cblxuICAgICAgICAgICAgVGhlIG9wdGlvbmFsIHNwYWNlIHBhcmFtZXRlciBwcm9kdWNlcyBhIHN0cmluZ2lmaWNhdGlvbiBvZiB0aGVcbiAgICAgICAgICAgIHZhbHVlIHRoYXQgaXMgZmlsbGVkIHdpdGggbGluZSBicmVha3MgYW5kIGluZGVudGF0aW9uIHRvIG1ha2UgaXRcbiAgICAgICAgICAgIGVhc2llciB0byByZWFkLlxuXG4gICAgICAgICAgICBJZiB0aGUgc3BhY2UgcGFyYW1ldGVyIGlzIGEgbm9uLWVtcHR5IHN0cmluZywgdGhlbiB0aGF0IHN0cmluZyB3aWxsXG4gICAgICAgICAgICBiZSB1c2VkIGZvciBpbmRlbnRhdGlvbi4gSWYgdGhlIHNwYWNlIHBhcmFtZXRlciBpcyBhIG51bWJlciwgdGhlblxuICAgICAgICAgICAgdGhlIGluZGVudGF0aW9uIHdpbGwgYmUgdGhhdCBtYW55IHNwYWNlcy5cblxuICAgICAgICAgICAgRXhhbXBsZTpcblxuICAgICAgICAgICAgdGV4dCA9IEpTT04uc3RyaW5naWZ5KFsnZScsIHtwbHVyaWJ1czogJ3VudW0nfV0pO1xuICAgICAgICAgICAgLy8gdGV4dCBpcyAnW1wiZVwiLHtcInBsdXJpYnVzXCI6XCJ1bnVtXCJ9XSdcblxuXG4gICAgICAgICAgICB0ZXh0ID0gSlNPTi5zdHJpbmdpZnkoWydlJywge3BsdXJpYnVzOiAndW51bSd9XSwgbnVsbCwgJ1xcdCcpO1xuICAgICAgICAgICAgLy8gdGV4dCBpcyAnW1xcblxcdFwiZVwiLFxcblxcdHtcXG5cXHRcXHRcInBsdXJpYnVzXCI6IFwidW51bVwiXFxuXFx0fVxcbl0nXG5cbiAgICAgICAgICAgIHRleHQgPSBKU09OLnN0cmluZ2lmeShbbmV3IERhdGUoKV0sIGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXNba2V5XSBpbnN0YW5jZW9mIERhdGUgP1xuICAgICAgICAgICAgICAgICAgICAnRGF0ZSgnICsgdGhpc1trZXldICsgJyknIDogdmFsdWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIHRleHQgaXMgJ1tcIkRhdGUoLS0tY3VycmVudCB0aW1lLS0tKVwiXSdcblxuXG4gICAgICAgIEpTT04ucGFyc2UodGV4dCwgcmV2aXZlcilcbiAgICAgICAgICAgIFRoaXMgbWV0aG9kIHBhcnNlcyBhIEpTT04gdGV4dCB0byBwcm9kdWNlIGFuIG9iamVjdCBvciBhcnJheS5cbiAgICAgICAgICAgIEl0IGNhbiB0aHJvdyBhIFN5bnRheEVycm9yIGV4Y2VwdGlvbi5cblxuICAgICAgICAgICAgVGhlIG9wdGlvbmFsIHJldml2ZXIgcGFyYW1ldGVyIGlzIGEgZnVuY3Rpb24gdGhhdCBjYW4gZmlsdGVyIGFuZFxuICAgICAgICAgICAgdHJhbnNmb3JtIHRoZSByZXN1bHRzLiBJdCByZWNlaXZlcyBlYWNoIG9mIHRoZSBrZXlzIGFuZCB2YWx1ZXMsXG4gICAgICAgICAgICBhbmQgaXRzIHJldHVybiB2YWx1ZSBpcyB1c2VkIGluc3RlYWQgb2YgdGhlIG9yaWdpbmFsIHZhbHVlLlxuICAgICAgICAgICAgSWYgaXQgcmV0dXJucyB3aGF0IGl0IHJlY2VpdmVkLCB0aGVuIHRoZSBzdHJ1Y3R1cmUgaXMgbm90IG1vZGlmaWVkLlxuICAgICAgICAgICAgSWYgaXQgcmV0dXJucyB1bmRlZmluZWQgdGhlbiB0aGUgbWVtYmVyIGlzIGRlbGV0ZWQuXG5cbiAgICAgICAgICAgIEV4YW1wbGU6XG5cbiAgICAgICAgICAgIC8vIFBhcnNlIHRoZSB0ZXh0LiBWYWx1ZXMgdGhhdCBsb29rIGxpa2UgSVNPIGRhdGUgc3RyaW5ncyB3aWxsXG4gICAgICAgICAgICAvLyBiZSBjb252ZXJ0ZWQgdG8gRGF0ZSBvYmplY3RzLlxuXG4gICAgICAgICAgICBteURhdGEgPSBKU09OLnBhcnNlKHRleHQsIGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGE7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgYSA9XG4vXihcXGR7NH0pLShcXGR7Mn0pLShcXGR7Mn0pVChcXGR7Mn0pOihcXGR7Mn0pOihcXGR7Mn0oPzpcXC5cXGQqKT8pWiQvLmV4ZWModmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRlKERhdGUuVVRDKCthWzFdLCArYVsyXSAtIDEsICthWzNdLCArYVs0XSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArYVs1XSwgK2FbNl0pKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbXlEYXRhID0gSlNPTi5wYXJzZSgnW1wiRGF0ZSgwOS8wOS8yMDAxKVwiXScsIGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGQ7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlLnNsaWNlKDAsIDUpID09PSAnRGF0ZSgnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZS5zbGljZSgtMSkgPT09ICcpJykge1xuICAgICAgICAgICAgICAgICAgICBkID0gbmV3IERhdGUodmFsdWUuc2xpY2UoNSwgLTEpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0pO1xuXG5cbiAgICBUaGlzIGlzIGEgcmVmZXJlbmNlIGltcGxlbWVudGF0aW9uLiBZb3UgYXJlIGZyZWUgdG8gY29weSwgbW9kaWZ5LCBvclxuICAgIHJlZGlzdHJpYnV0ZS5cbiovXG5cbi8qanNsaW50IGV2aWw6IHRydWUsIHJlZ2V4cDogdHJ1ZSAqL1xuXG4vKm1lbWJlcnMgXCJcIiwgXCJcXGJcIiwgXCJcXHRcIiwgXCJcXG5cIiwgXCJcXGZcIiwgXCJcXHJcIiwgXCJcXFwiXCIsIEpTT04sIFwiXFxcXFwiLCBhcHBseSxcbiAgICBjYWxsLCBjaGFyQ29kZUF0LCBnZXRVVENEYXRlLCBnZXRVVENGdWxsWWVhciwgZ2V0VVRDSG91cnMsXG4gICAgZ2V0VVRDTWludXRlcywgZ2V0VVRDTW9udGgsIGdldFVUQ1NlY29uZHMsIGhhc093blByb3BlcnR5LCBqb2luLFxuICAgIGxhc3RJbmRleCwgbGVuZ3RoLCBwYXJzZSwgcHJvdG90eXBlLCBwdXNoLCByZXBsYWNlLCBzbGljZSwgc3RyaW5naWZ5LFxuICAgIHRlc3QsIHRvSlNPTiwgdG9TdHJpbmcsIHZhbHVlT2ZcbiovXG5cblxuLy8gQ3JlYXRlIGEgSlNPTiBvYmplY3Qgb25seSBpZiBvbmUgZG9lcyBub3QgYWxyZWFkeSBleGlzdC4gV2UgY3JlYXRlIHRoZVxuLy8gbWV0aG9kcyBpbiBhIGNsb3N1cmUgdG8gYXZvaWQgY3JlYXRpbmcgZ2xvYmFsIHZhcmlhYmxlcy5cblxuaWYgKHR5cGVvZiBKU09OICE9PSAnb2JqZWN0Jykge1xuICAgIEpTT04gPSB7fTtcbn1cblxuKGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBmdW5jdGlvbiBmKG4pIHtcbiAgICAgICAgLy8gRm9ybWF0IGludGVnZXJzIHRvIGhhdmUgYXQgbGVhc3QgdHdvIGRpZ2l0cy5cbiAgICAgICAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4gOiBuO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgRGF0ZS5wcm90b3R5cGUudG9KU09OICE9PSAnZnVuY3Rpb24nKSB7XG5cbiAgICAgICAgRGF0ZS5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuXG4gICAgICAgICAgICByZXR1cm4gaXNGaW5pdGUodGhpcy52YWx1ZU9mKCkpXG4gICAgICAgICAgICAgICAgPyB0aGlzLmdldFVUQ0Z1bGxZZWFyKCkgICAgICsgJy0nICtcbiAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ01vbnRoKCkgKyAxKSArICctJyArXG4gICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENEYXRlKCkpICAgICAgKyAnVCcgK1xuICAgICAgICAgICAgICAgICAgICBmKHRoaXMuZ2V0VVRDSG91cnMoKSkgICAgICsgJzonICtcbiAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ01pbnV0ZXMoKSkgICArICc6JyArXG4gICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENTZWNvbmRzKCkpICAgKyAnWidcbiAgICAgICAgICAgICAgICA6IG51bGw7XG4gICAgICAgIH07XG5cbiAgICAgICAgU3RyaW5nLnByb3RvdHlwZS50b0pTT04gICAgICA9XG4gICAgICAgICAgICBOdW1iZXIucHJvdG90eXBlLnRvSlNPTiAgPVxuICAgICAgICAgICAgQm9vbGVhbi5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnZhbHVlT2YoKTtcbiAgICAgICAgICAgIH07XG4gICAgfVxuXG4gICAgdmFyIGN4ID0gL1tcXHUwMDAwXFx1MDBhZFxcdTA2MDAtXFx1MDYwNFxcdTA3MGZcXHUxN2I0XFx1MTdiNVxcdTIwMGMtXFx1MjAwZlxcdTIwMjgtXFx1MjAyZlxcdTIwNjAtXFx1MjA2ZlxcdWZlZmZcXHVmZmYwLVxcdWZmZmZdL2csXG4gICAgICAgIGVzY2FwYWJsZSA9IC9bXFxcXFxcXCJcXHgwMC1cXHgxZlxceDdmLVxceDlmXFx1MDBhZFxcdTA2MDAtXFx1MDYwNFxcdTA3MGZcXHUxN2I0XFx1MTdiNVxcdTIwMGMtXFx1MjAwZlxcdTIwMjgtXFx1MjAyZlxcdTIwNjAtXFx1MjA2ZlxcdWZlZmZcXHVmZmYwLVxcdWZmZmZdL2csXG4gICAgICAgIGdhcCxcbiAgICAgICAgaW5kZW50LFxuICAgICAgICBtZXRhID0geyAgICAvLyB0YWJsZSBvZiBjaGFyYWN0ZXIgc3Vic3RpdHV0aW9uc1xuICAgICAgICAgICAgJ1xcYic6ICdcXFxcYicsXG4gICAgICAgICAgICAnXFx0JzogJ1xcXFx0JyxcbiAgICAgICAgICAgICdcXG4nOiAnXFxcXG4nLFxuICAgICAgICAgICAgJ1xcZic6ICdcXFxcZicsXG4gICAgICAgICAgICAnXFxyJzogJ1xcXFxyJyxcbiAgICAgICAgICAgICdcIicgOiAnXFxcXFwiJyxcbiAgICAgICAgICAgICdcXFxcJzogJ1xcXFxcXFxcJ1xuICAgICAgICB9LFxuICAgICAgICByZXA7XG5cblxuICAgIGZ1bmN0aW9uIHF1b3RlKHN0cmluZykge1xuXG4vLyBJZiB0aGUgc3RyaW5nIGNvbnRhaW5zIG5vIGNvbnRyb2wgY2hhcmFjdGVycywgbm8gcXVvdGUgY2hhcmFjdGVycywgYW5kIG5vXG4vLyBiYWNrc2xhc2ggY2hhcmFjdGVycywgdGhlbiB3ZSBjYW4gc2FmZWx5IHNsYXAgc29tZSBxdW90ZXMgYXJvdW5kIGl0LlxuLy8gT3RoZXJ3aXNlIHdlIG11c3QgYWxzbyByZXBsYWNlIHRoZSBvZmZlbmRpbmcgY2hhcmFjdGVycyB3aXRoIHNhZmUgZXNjYXBlXG4vLyBzZXF1ZW5jZXMuXG5cbiAgICAgICAgZXNjYXBhYmxlLmxhc3RJbmRleCA9IDA7XG4gICAgICAgIHJldHVybiBlc2NhcGFibGUudGVzdChzdHJpbmcpID8gJ1wiJyArIHN0cmluZy5yZXBsYWNlKGVzY2FwYWJsZSwgZnVuY3Rpb24gKGEpIHtcbiAgICAgICAgICAgIHZhciBjID0gbWV0YVthXTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgYyA9PT0gJ3N0cmluZydcbiAgICAgICAgICAgICAgICA/IGNcbiAgICAgICAgICAgICAgICA6ICdcXFxcdScgKyAoJzAwMDAnICsgYS5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KSkuc2xpY2UoLTQpO1xuICAgICAgICB9KSArICdcIicgOiAnXCInICsgc3RyaW5nICsgJ1wiJztcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHN0cihrZXksIGhvbGRlcikge1xuXG4vLyBQcm9kdWNlIGEgc3RyaW5nIGZyb20gaG9sZGVyW2tleV0uXG5cbiAgICAgICAgdmFyIGksICAgICAgICAgIC8vIFRoZSBsb29wIGNvdW50ZXIuXG4gICAgICAgICAgICBrLCAgICAgICAgICAvLyBUaGUgbWVtYmVyIGtleS5cbiAgICAgICAgICAgIHYsICAgICAgICAgIC8vIFRoZSBtZW1iZXIgdmFsdWUuXG4gICAgICAgICAgICBsZW5ndGgsXG4gICAgICAgICAgICBtaW5kID0gZ2FwLFxuICAgICAgICAgICAgcGFydGlhbCxcbiAgICAgICAgICAgIHZhbHVlID0gaG9sZGVyW2tleV07XG5cbi8vIElmIHRoZSB2YWx1ZSBoYXMgYSB0b0pTT04gbWV0aG9kLCBjYWxsIGl0IHRvIG9idGFpbiBhIHJlcGxhY2VtZW50IHZhbHVlLlxuXG4gICAgICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS50b0pTT04oa2V5KTtcbiAgICAgICAgfVxuXG4vLyBJZiB3ZSB3ZXJlIGNhbGxlZCB3aXRoIGEgcmVwbGFjZXIgZnVuY3Rpb24sIHRoZW4gY2FsbCB0aGUgcmVwbGFjZXIgdG9cbi8vIG9idGFpbiBhIHJlcGxhY2VtZW50IHZhbHVlLlxuXG4gICAgICAgIGlmICh0eXBlb2YgcmVwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IHJlcC5jYWxsKGhvbGRlciwga2V5LCB2YWx1ZSk7XG4gICAgICAgIH1cblxuLy8gV2hhdCBoYXBwZW5zIG5leHQgZGVwZW5kcyBvbiB0aGUgdmFsdWUncyB0eXBlLlxuXG4gICAgICAgIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG4gICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICByZXR1cm4gcXVvdGUodmFsdWUpO1xuXG4gICAgICAgIGNhc2UgJ251bWJlcic6XG5cbi8vIEpTT04gbnVtYmVycyBtdXN0IGJlIGZpbml0ZS4gRW5jb2RlIG5vbi1maW5pdGUgbnVtYmVycyBhcyBudWxsLlxuXG4gICAgICAgICAgICByZXR1cm4gaXNGaW5pdGUodmFsdWUpID8gU3RyaW5nKHZhbHVlKSA6ICdudWxsJztcblxuICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgY2FzZSAnbnVsbCc6XG5cbi8vIElmIHRoZSB2YWx1ZSBpcyBhIGJvb2xlYW4gb3IgbnVsbCwgY29udmVydCBpdCB0byBhIHN0cmluZy4gTm90ZTpcbi8vIHR5cGVvZiBudWxsIGRvZXMgbm90IHByb2R1Y2UgJ251bGwnLiBUaGUgY2FzZSBpcyBpbmNsdWRlZCBoZXJlIGluXG4vLyB0aGUgcmVtb3RlIGNoYW5jZSB0aGF0IHRoaXMgZ2V0cyBmaXhlZCBzb21lZGF5LlxuXG4gICAgICAgICAgICByZXR1cm4gU3RyaW5nKHZhbHVlKTtcblxuLy8gSWYgdGhlIHR5cGUgaXMgJ29iamVjdCcsIHdlIG1pZ2h0IGJlIGRlYWxpbmcgd2l0aCBhbiBvYmplY3Qgb3IgYW4gYXJyYXkgb3Jcbi8vIG51bGwuXG5cbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcblxuLy8gRHVlIHRvIGEgc3BlY2lmaWNhdGlvbiBibHVuZGVyIGluIEVDTUFTY3JpcHQsIHR5cGVvZiBudWxsIGlzICdvYmplY3QnLFxuLy8gc28gd2F0Y2ggb3V0IGZvciB0aGF0IGNhc2UuXG5cbiAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ251bGwnO1xuICAgICAgICAgICAgfVxuXG4vLyBNYWtlIGFuIGFycmF5IHRvIGhvbGQgdGhlIHBhcnRpYWwgcmVzdWx0cyBvZiBzdHJpbmdpZnlpbmcgdGhpcyBvYmplY3QgdmFsdWUuXG5cbiAgICAgICAgICAgIGdhcCArPSBpbmRlbnQ7XG4gICAgICAgICAgICBwYXJ0aWFsID0gW107XG5cbi8vIElzIHRoZSB2YWx1ZSBhbiBhcnJheT9cblxuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkodmFsdWUpID09PSAnW29iamVjdCBBcnJheV0nKSB7XG5cbi8vIFRoZSB2YWx1ZSBpcyBhbiBhcnJheS4gU3RyaW5naWZ5IGV2ZXJ5IGVsZW1lbnQuIFVzZSBudWxsIGFzIGEgcGxhY2Vob2xkZXJcbi8vIGZvciBub24tSlNPTiB2YWx1ZXMuXG5cbiAgICAgICAgICAgICAgICBsZW5ndGggPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRpYWxbaV0gPSBzdHIoaSwgdmFsdWUpIHx8ICdudWxsJztcbiAgICAgICAgICAgICAgICB9XG5cbi8vIEpvaW4gYWxsIG9mIHRoZSBlbGVtZW50cyB0b2dldGhlciwgc2VwYXJhdGVkIHdpdGggY29tbWFzLCBhbmQgd3JhcCB0aGVtIGluXG4vLyBicmFja2V0cy5cblxuICAgICAgICAgICAgICAgIHYgPSBwYXJ0aWFsLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgICAgICA/ICdbXSdcbiAgICAgICAgICAgICAgICAgICAgOiBnYXBcbiAgICAgICAgICAgICAgICAgICAgPyAnW1xcbicgKyBnYXAgKyBwYXJ0aWFsLmpvaW4oJyxcXG4nICsgZ2FwKSArICdcXG4nICsgbWluZCArICddJ1xuICAgICAgICAgICAgICAgICAgICA6ICdbJyArIHBhcnRpYWwuam9pbignLCcpICsgJ10nO1xuICAgICAgICAgICAgICAgIGdhcCA9IG1pbmQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHY7XG4gICAgICAgICAgICB9XG5cbi8vIElmIHRoZSByZXBsYWNlciBpcyBhbiBhcnJheSwgdXNlIGl0IHRvIHNlbGVjdCB0aGUgbWVtYmVycyB0byBiZSBzdHJpbmdpZmllZC5cblxuICAgICAgICAgICAgaWYgKHJlcCAmJiB0eXBlb2YgcmVwID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIGxlbmd0aCA9IHJlcC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVwW2ldID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgayA9IHJlcFtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHYgPSBzdHIoaywgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJ0aWFsLnB1c2gocXVvdGUoaykgKyAoZ2FwID8gJzogJyA6ICc6JykgKyB2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG5cbi8vIE90aGVyd2lzZSwgaXRlcmF0ZSB0aHJvdWdoIGFsbCBvZiB0aGUga2V5cyBpbiB0aGUgb2JqZWN0LlxuXG4gICAgICAgICAgICAgICAgZm9yIChrIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIGspKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2ID0gc3RyKGssIHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFydGlhbC5wdXNoKHF1b3RlKGspICsgKGdhcCA/ICc6ICcgOiAnOicpICsgdik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbi8vIEpvaW4gYWxsIG9mIHRoZSBtZW1iZXIgdGV4dHMgdG9nZXRoZXIsIHNlcGFyYXRlZCB3aXRoIGNvbW1hcyxcbi8vIGFuZCB3cmFwIHRoZW0gaW4gYnJhY2VzLlxuXG4gICAgICAgICAgICB2ID0gcGFydGlhbC5sZW5ndGggPT09IDBcbiAgICAgICAgICAgICAgICA/ICd7fSdcbiAgICAgICAgICAgICAgICA6IGdhcFxuICAgICAgICAgICAgICAgID8gJ3tcXG4nICsgZ2FwICsgcGFydGlhbC5qb2luKCcsXFxuJyArIGdhcCkgKyAnXFxuJyArIG1pbmQgKyAnfSdcbiAgICAgICAgICAgICAgICA6ICd7JyArIHBhcnRpYWwuam9pbignLCcpICsgJ30nO1xuICAgICAgICAgICAgZ2FwID0gbWluZDtcbiAgICAgICAgICAgIHJldHVybiB2O1xuICAgICAgICB9XG4gICAgfVxuXG4vLyBJZiB0aGUgSlNPTiBvYmplY3QgZG9lcyBub3QgeWV0IGhhdmUgYSBzdHJpbmdpZnkgbWV0aG9kLCBnaXZlIGl0IG9uZS5cblxuICAgIEZheWUuc3RyaW5naWZ5ID0gZnVuY3Rpb24gKHZhbHVlLCByZXBsYWNlciwgc3BhY2UpIHtcblxuLy8gVGhlIHN0cmluZ2lmeSBtZXRob2QgdGFrZXMgYSB2YWx1ZSBhbmQgYW4gb3B0aW9uYWwgcmVwbGFjZXIsIGFuZCBhbiBvcHRpb25hbFxuLy8gc3BhY2UgcGFyYW1ldGVyLCBhbmQgcmV0dXJucyBhIEpTT04gdGV4dC4gVGhlIHJlcGxhY2VyIGNhbiBiZSBhIGZ1bmN0aW9uXG4vLyB0aGF0IGNhbiByZXBsYWNlIHZhbHVlcywgb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncyB0aGF0IHdpbGwgc2VsZWN0IHRoZSBrZXlzLlxuLy8gQSBkZWZhdWx0IHJlcGxhY2VyIG1ldGhvZCBjYW4gYmUgcHJvdmlkZWQuIFVzZSBvZiB0aGUgc3BhY2UgcGFyYW1ldGVyIGNhblxuLy8gcHJvZHVjZSB0ZXh0IHRoYXQgaXMgbW9yZSBlYXNpbHkgcmVhZGFibGUuXG5cbiAgICAgICAgdmFyIGk7XG4gICAgICAgIGdhcCA9ICcnO1xuICAgICAgICBpbmRlbnQgPSAnJztcblxuLy8gSWYgdGhlIHNwYWNlIHBhcmFtZXRlciBpcyBhIG51bWJlciwgbWFrZSBhbiBpbmRlbnQgc3RyaW5nIGNvbnRhaW5pbmcgdGhhdFxuLy8gbWFueSBzcGFjZXMuXG5cbiAgICAgICAgaWYgKHR5cGVvZiBzcGFjZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBzcGFjZTsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgaW5kZW50ICs9ICcgJztcbiAgICAgICAgICAgIH1cblxuLy8gSWYgdGhlIHNwYWNlIHBhcmFtZXRlciBpcyBhIHN0cmluZywgaXQgd2lsbCBiZSB1c2VkIGFzIHRoZSBpbmRlbnQgc3RyaW5nLlxuXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHNwYWNlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgaW5kZW50ID0gc3BhY2U7XG4gICAgICAgIH1cblxuLy8gSWYgdGhlcmUgaXMgYSByZXBsYWNlciwgaXQgbXVzdCBiZSBhIGZ1bmN0aW9uIG9yIGFuIGFycmF5LlxuLy8gT3RoZXJ3aXNlLCB0aHJvdyBhbiBlcnJvci5cblxuICAgICAgICByZXAgPSByZXBsYWNlcjtcbiAgICAgICAgaWYgKHJlcGxhY2VyICYmIHR5cGVvZiByZXBsYWNlciAhPT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgICAgICh0eXBlb2YgcmVwbGFjZXIgIT09ICdvYmplY3QnIHx8XG4gICAgICAgICAgICAgICAgdHlwZW9mIHJlcGxhY2VyLmxlbmd0aCAhPT0gJ251bWJlcicpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0pTT04uc3RyaW5naWZ5Jyk7XG4gICAgICAgIH1cblxuLy8gTWFrZSBhIGZha2Ugcm9vdCBvYmplY3QgY29udGFpbmluZyBvdXIgdmFsdWUgdW5kZXIgdGhlIGtleSBvZiAnJy5cbi8vIFJldHVybiB0aGUgcmVzdWx0IG9mIHN0cmluZ2lmeWluZyB0aGUgdmFsdWUuXG5cbiAgICAgICAgcmV0dXJuIHN0cignJywgeycnOiB2YWx1ZX0pO1xuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIEpTT04uc3RyaW5naWZ5ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIEpTT04uc3RyaW5naWZ5ID0gRmF5ZS5zdHJpbmdpZnk7XG4gICAgfVxuXG4vLyBJZiB0aGUgSlNPTiBvYmplY3QgZG9lcyBub3QgeWV0IGhhdmUgYSBwYXJzZSBtZXRob2QsIGdpdmUgaXQgb25lLlxuXG4gICAgaWYgKHR5cGVvZiBKU09OLnBhcnNlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIEpTT04ucGFyc2UgPSBmdW5jdGlvbiAodGV4dCwgcmV2aXZlcikge1xuXG4vLyBUaGUgcGFyc2UgbWV0aG9kIHRha2VzIGEgdGV4dCBhbmQgYW4gb3B0aW9uYWwgcmV2aXZlciBmdW5jdGlvbiwgYW5kIHJldHVybnNcbi8vIGEgSmF2YVNjcmlwdCB2YWx1ZSBpZiB0aGUgdGV4dCBpcyBhIHZhbGlkIEpTT04gdGV4dC5cblxuICAgICAgICAgICAgdmFyIGo7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHdhbGsoaG9sZGVyLCBrZXkpIHtcblxuLy8gVGhlIHdhbGsgbWV0aG9kIGlzIHVzZWQgdG8gcmVjdXJzaXZlbHkgd2FsayB0aGUgcmVzdWx0aW5nIHN0cnVjdHVyZSBzb1xuLy8gdGhhdCBtb2RpZmljYXRpb25zIGNhbiBiZSBtYWRlLlxuXG4gICAgICAgICAgICAgICAgdmFyIGssIHYsIHZhbHVlID0gaG9sZGVyW2tleV07XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBrKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYgPSB3YWxrKHZhbHVlLCBrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlW2tdID0gdjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgdmFsdWVba107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXZpdmVyLmNhbGwoaG9sZGVyLCBrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuXG4vLyBQYXJzaW5nIGhhcHBlbnMgaW4gZm91ciBzdGFnZXMuIEluIHRoZSBmaXJzdCBzdGFnZSwgd2UgcmVwbGFjZSBjZXJ0YWluXG4vLyBVbmljb2RlIGNoYXJhY3RlcnMgd2l0aCBlc2NhcGUgc2VxdWVuY2VzLiBKYXZhU2NyaXB0IGhhbmRsZXMgbWFueSBjaGFyYWN0ZXJzXG4vLyBpbmNvcnJlY3RseSwgZWl0aGVyIHNpbGVudGx5IGRlbGV0aW5nIHRoZW0sIG9yIHRyZWF0aW5nIHRoZW0gYXMgbGluZSBlbmRpbmdzLlxuXG4gICAgICAgICAgICB0ZXh0ID0gU3RyaW5nKHRleHQpO1xuICAgICAgICAgICAgY3gubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgIGlmIChjeC50ZXN0KHRleHQpKSB7XG4gICAgICAgICAgICAgICAgdGV4dCA9IHRleHQucmVwbGFjZShjeCwgZnVuY3Rpb24gKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdcXFxcdScgK1xuICAgICAgICAgICAgICAgICAgICAgICAgKCcwMDAwJyArIGEuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikpLnNsaWNlKC00KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuLy8gSW4gdGhlIHNlY29uZCBzdGFnZSwgd2UgcnVuIHRoZSB0ZXh0IGFnYWluc3QgcmVndWxhciBleHByZXNzaW9ucyB0aGF0IGxvb2tcbi8vIGZvciBub24tSlNPTiBwYXR0ZXJucy4gV2UgYXJlIGVzcGVjaWFsbHkgY29uY2VybmVkIHdpdGggJygpJyBhbmQgJ25ldydcbi8vIGJlY2F1c2UgdGhleSBjYW4gY2F1c2UgaW52b2NhdGlvbiwgYW5kICc9JyBiZWNhdXNlIGl0IGNhbiBjYXVzZSBtdXRhdGlvbi5cbi8vIEJ1dCBqdXN0IHRvIGJlIHNhZmUsIHdlIHdhbnQgdG8gcmVqZWN0IGFsbCB1bmV4cGVjdGVkIGZvcm1zLlxuXG4vLyBXZSBzcGxpdCB0aGUgc2Vjb25kIHN0YWdlIGludG8gNCByZWdleHAgb3BlcmF0aW9ucyBpbiBvcmRlciB0byB3b3JrIGFyb3VuZFxuLy8gY3JpcHBsaW5nIGluZWZmaWNpZW5jaWVzIGluIElFJ3MgYW5kIFNhZmFyaSdzIHJlZ2V4cCBlbmdpbmVzLiBGaXJzdCB3ZVxuLy8gcmVwbGFjZSB0aGUgSlNPTiBiYWNrc2xhc2ggcGFpcnMgd2l0aCAnQCcgKGEgbm9uLUpTT04gY2hhcmFjdGVyKS4gU2Vjb25kLCB3ZVxuLy8gcmVwbGFjZSBhbGwgc2ltcGxlIHZhbHVlIHRva2VucyB3aXRoICddJyBjaGFyYWN0ZXJzLiBUaGlyZCwgd2UgZGVsZXRlIGFsbFxuLy8gb3BlbiBicmFja2V0cyB0aGF0IGZvbGxvdyBhIGNvbG9uIG9yIGNvbW1hIG9yIHRoYXQgYmVnaW4gdGhlIHRleHQuIEZpbmFsbHksXG4vLyB3ZSBsb29rIHRvIHNlZSB0aGF0IHRoZSByZW1haW5pbmcgY2hhcmFjdGVycyBhcmUgb25seSB3aGl0ZXNwYWNlIG9yICddJyBvclxuLy8gJywnIG9yICc6JyBvciAneycgb3IgJ30nLiBJZiB0aGF0IGlzIHNvLCB0aGVuIHRoZSB0ZXh0IGlzIHNhZmUgZm9yIGV2YWwuXG5cbiAgICAgICAgICAgIGlmICgvXltcXF0sOnt9XFxzXSokL1xuICAgICAgICAgICAgICAgICAgICAudGVzdCh0ZXh0LnJlcGxhY2UoL1xcXFwoPzpbXCJcXFxcXFwvYmZucnRdfHVbMC05YS1mQS1GXXs0fSkvZywgJ0AnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1wiW15cIlxcXFxcXG5cXHJdKlwifHRydWV8ZmFsc2V8bnVsbHwtP1xcZCsoPzpcXC5cXGQqKT8oPzpbZUVdWytcXC1dP1xcZCspPy9nLCAnXScpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKD86Xnw6fCwpKD86XFxzKlxcWykrL2csICcnKSkpIHtcblxuLy8gSW4gdGhlIHRoaXJkIHN0YWdlIHdlIHVzZSB0aGUgZXZhbCBmdW5jdGlvbiB0byBjb21waWxlIHRoZSB0ZXh0IGludG8gYVxuLy8gSmF2YVNjcmlwdCBzdHJ1Y3R1cmUuIFRoZSAneycgb3BlcmF0b3IgaXMgc3ViamVjdCB0byBhIHN5bnRhY3RpYyBhbWJpZ3VpdHlcbi8vIGluIEphdmFTY3JpcHQ6IGl0IGNhbiBiZWdpbiBhIGJsb2NrIG9yIGFuIG9iamVjdCBsaXRlcmFsLiBXZSB3cmFwIHRoZSB0ZXh0XG4vLyBpbiBwYXJlbnMgdG8gZWxpbWluYXRlIHRoZSBhbWJpZ3VpdHkuXG5cbiAgICAgICAgICAgICAgICBqID0gZXZhbCgnKCcgKyB0ZXh0ICsgJyknKTtcblxuLy8gSW4gdGhlIG9wdGlvbmFsIGZvdXJ0aCBzdGFnZSwgd2UgcmVjdXJzaXZlbHkgd2FsayB0aGUgbmV3IHN0cnVjdHVyZSwgcGFzc2luZ1xuLy8gZWFjaCBuYW1lL3ZhbHVlIHBhaXIgdG8gYSByZXZpdmVyIGZ1bmN0aW9uIGZvciBwb3NzaWJsZSB0cmFuc2Zvcm1hdGlvbi5cblxuICAgICAgICAgICAgICAgIHJldHVybiB0eXBlb2YgcmV2aXZlciA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgICAgICA/IHdhbGsoeycnOiBqfSwgJycpXG4gICAgICAgICAgICAgICAgICAgIDogajtcbiAgICAgICAgICAgIH1cblxuLy8gSWYgdGhlIHRleHQgaXMgbm90IEpTT04gcGFyc2VhYmxlLCB0aGVuIGEgU3ludGF4RXJyb3IgaXMgdGhyb3duLlxuXG4gICAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoJ0pTT04ucGFyc2UnKTtcbiAgICAgICAgfTtcbiAgICB9XG59KCkpO1xuXG5GYXllLlRyYW5zcG9ydC5XZWJTb2NrZXQgPSBGYXllLmV4dGVuZChGYXllLkNsYXNzKEZheWUuVHJhbnNwb3J0LCB7XG4gIFVOQ09OTkVDVEVEOiAgMSxcbiAgQ09OTkVDVElORzogICAyLFxuICBDT05ORUNURUQ6ICAgIDMsXG5cbiAgYmF0Y2hpbmc6ICAgICBmYWxzZSxcblxuICBpc1VzYWJsZTogZnVuY3Rpb24oY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB0aGlzLmNhbGxiYWNrKGZ1bmN0aW9uKCkgeyBjYWxsYmFjay5jYWxsKGNvbnRleHQsIHRydWUpIH0pO1xuICAgIHRoaXMuZXJyYmFjayhmdW5jdGlvbigpIHsgY2FsbGJhY2suY2FsbChjb250ZXh0LCBmYWxzZSkgfSk7XG4gICAgdGhpcy5jb25uZWN0KCk7XG4gIH0sXG5cbiAgcmVxdWVzdDogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICB0aGlzLl9wZW5kaW5nID0gdGhpcy5fcGVuZGluZyB8fCBuZXcgRmF5ZS5TZXQoKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbiA9IG1lc3NhZ2VzLmxlbmd0aDsgaSA8IG47IGkrKykgdGhpcy5fcGVuZGluZy5hZGQobWVzc2FnZXNbaV0pO1xuXG4gICAgdmFyIHByb21pc2UgPSBuZXcgRmF5ZS5Qcm9taXNlKCk7XG5cbiAgICB0aGlzLmNhbGxiYWNrKGZ1bmN0aW9uKHNvY2tldCkge1xuICAgICAgaWYgKCFzb2NrZXQgfHwgc29ja2V0LnJlYWR5U3RhdGUgIT09IDEpIHJldHVybjtcbiAgICAgIHNvY2tldC5zZW5kKEZheWUudG9KU09OKG1lc3NhZ2VzKSk7XG4gICAgICBGYXllLlByb21pc2UuZnVsZmlsbChwcm9taXNlLCBzb2NrZXQpO1xuICAgIH0sIHRoaXMpO1xuXG4gICAgdGhpcy5jb25uZWN0KCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgYWJvcnQ6IGZ1bmN0aW9uKCkgeyBwcm9taXNlLnRoZW4oZnVuY3Rpb24od3MpIHsgd3MuY2xvc2UoKSB9KSB9XG4gICAgfTtcbiAgfSxcblxuICBjb25uZWN0OiBmdW5jdGlvbigpIHtcbiAgICBpZiAoRmF5ZS5UcmFuc3BvcnQuV2ViU29ja2V0Ll91bmxvYWRlZCkgcmV0dXJuO1xuXG4gICAgdGhpcy5fc3RhdGUgPSB0aGlzLl9zdGF0ZSB8fCB0aGlzLlVOQ09OTkVDVEVEO1xuICAgIGlmICh0aGlzLl9zdGF0ZSAhPT0gdGhpcy5VTkNPTk5FQ1RFRCkgcmV0dXJuO1xuICAgIHRoaXMuX3N0YXRlID0gdGhpcy5DT05ORUNUSU5HO1xuXG4gICAgdmFyIHNvY2tldCA9IHRoaXMuX2NyZWF0ZVNvY2tldCgpO1xuICAgIGlmICghc29ja2V0KSByZXR1cm4gdGhpcy5zZXREZWZlcnJlZFN0YXR1cygnZmFpbGVkJyk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBzb2NrZXQub25vcGVuID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoc29ja2V0LmhlYWRlcnMpIHNlbGYuX3N0b3JlQ29va2llcyhzb2NrZXQuaGVhZGVyc1snc2V0LWNvb2tpZSddKTtcbiAgICAgIHNlbGYuX3NvY2tldCA9IHNvY2tldDtcbiAgICAgIHNlbGYuX3N0YXRlID0gc2VsZi5DT05ORUNURUQ7XG4gICAgICBzZWxmLl9ldmVyQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgIHNlbGYuX3BpbmcoKTtcbiAgICAgIHNlbGYuc2V0RGVmZXJyZWRTdGF0dXMoJ3N1Y2NlZWRlZCcsIHNvY2tldCk7XG4gICAgfTtcblxuICAgIHZhciBjbG9zZWQgPSBmYWxzZTtcbiAgICBzb2NrZXQub25jbG9zZSA9IHNvY2tldC5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoY2xvc2VkKSByZXR1cm47XG4gICAgICBjbG9zZWQgPSB0cnVlO1xuXG4gICAgICB2YXIgd2FzQ29ubmVjdGVkID0gKHNlbGYuX3N0YXRlID09PSBzZWxmLkNPTk5FQ1RFRCk7XG4gICAgICBzb2NrZXQub25vcGVuID0gc29ja2V0Lm9uY2xvc2UgPSBzb2NrZXQub25lcnJvciA9IHNvY2tldC5vbm1lc3NhZ2UgPSBudWxsO1xuXG4gICAgICBkZWxldGUgc2VsZi5fc29ja2V0O1xuICAgICAgc2VsZi5fc3RhdGUgPSBzZWxmLlVOQ09OTkVDVEVEO1xuICAgICAgc2VsZi5yZW1vdmVUaW1lb3V0KCdwaW5nJyk7XG4gICAgICBzZWxmLnNldERlZmVycmVkU3RhdHVzKCd1bmtub3duJyk7XG5cbiAgICAgIHZhciBwZW5kaW5nID0gc2VsZi5fcGVuZGluZyA/IHNlbGYuX3BlbmRpbmcudG9BcnJheSgpIDogW107XG4gICAgICBkZWxldGUgc2VsZi5fcGVuZGluZztcblxuICAgICAgaWYgKHdhc0Nvbm5lY3RlZCkge1xuICAgICAgICBzZWxmLl9oYW5kbGVFcnJvcihwZW5kaW5nLCB0cnVlKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VsZi5fZXZlckNvbm5lY3RlZCkge1xuICAgICAgICBzZWxmLl9oYW5kbGVFcnJvcihwZW5kaW5nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc2V0RGVmZXJyZWRTdGF0dXMoJ2ZhaWxlZCcpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBzb2NrZXQub25tZXNzYWdlID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIHZhciByZXBsaWVzID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcbiAgICAgIGlmICghcmVwbGllcykgcmV0dXJuO1xuXG4gICAgICByZXBsaWVzID0gW10uY29uY2F0KHJlcGxpZXMpO1xuXG4gICAgICBmb3IgKHZhciBpID0gMCwgbiA9IHJlcGxpZXMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGlmIChyZXBsaWVzW2ldLnN1Y2Nlc3NmdWwgPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgICAgIHNlbGYuX3BlbmRpbmcucmVtb3ZlKHJlcGxpZXNbaV0pO1xuICAgICAgfVxuICAgICAgc2VsZi5fcmVjZWl2ZShyZXBsaWVzKTtcbiAgICB9O1xuICB9LFxuXG4gIGNsb3NlOiBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuX3NvY2tldCkgcmV0dXJuO1xuICAgIHRoaXMuX3NvY2tldC5jbG9zZSgpO1xuICB9LFxuXG4gIF9jcmVhdGVTb2NrZXQ6IGZ1bmN0aW9uKCkge1xuICAgIHZhciB1cmwgICAgICAgID0gRmF5ZS5UcmFuc3BvcnQuV2ViU29ja2V0LmdldFNvY2tldFVybCh0aGlzLmVuZHBvaW50KSxcbiAgICAgICAgaGVhZGVycyAgICA9IHRoaXMuX2Rpc3BhdGNoZXIuaGVhZGVycyxcbiAgICAgICAgZXh0ZW5zaW9ucyA9IHRoaXMuX2Rpc3BhdGNoZXIud3NFeHRlbnNpb25zLFxuICAgICAgICBjb29raWUgICAgID0gdGhpcy5fZ2V0Q29va2llcygpLFxuICAgICAgICB0bHMgICAgICAgID0gdGhpcy5fZGlzcGF0Y2hlci50bHMsXG4gICAgICAgIG9wdGlvbnMgICAgPSB7ZXh0ZW5zaW9uczogZXh0ZW5zaW9ucywgaGVhZGVyczogaGVhZGVycywgcHJveHk6IHRoaXMuX3Byb3h5LCB0bHM6IHRsc307XG5cbiAgICBpZiAoY29va2llICE9PSAnJykgb3B0aW9ucy5oZWFkZXJzWydDb29raWUnXSA9IGNvb2tpZTtcblxuICAgIGlmIChGYXllLldlYlNvY2tldCkgICAgICAgIHJldHVybiBuZXcgRmF5ZS5XZWJTb2NrZXQuQ2xpZW50KHVybCwgW10sIG9wdGlvbnMpO1xuICAgIGlmIChGYXllLkVOVi5Nb3pXZWJTb2NrZXQpIHJldHVybiBuZXcgTW96V2ViU29ja2V0KHVybCk7XG4gICAgaWYgKEZheWUuRU5WLldlYlNvY2tldCkgICAgcmV0dXJuIG5ldyBXZWJTb2NrZXQodXJsKTtcbiAgfSxcblxuICBfcGluZzogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLl9zb2NrZXQpIHJldHVybjtcbiAgICB0aGlzLl9zb2NrZXQuc2VuZCgnW10nKTtcbiAgICB0aGlzLmFkZFRpbWVvdXQoJ3BpbmcnLCB0aGlzLl9kaXNwYXRjaGVyLnRpbWVvdXQgLyAyLCB0aGlzLl9waW5nLCB0aGlzKTtcbiAgfVxuXG59KSwge1xuICBQUk9UT0NPTFM6IHtcbiAgICAnaHR0cDonOiAgJ3dzOicsXG4gICAgJ2h0dHBzOic6ICd3c3M6J1xuICB9LFxuXG4gIGNyZWF0ZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQpIHtcbiAgICB2YXIgc29ja2V0cyA9IGRpc3BhdGNoZXIudHJhbnNwb3J0cy53ZWJzb2NrZXQgPSBkaXNwYXRjaGVyLnRyYW5zcG9ydHMud2Vic29ja2V0IHx8IHt9O1xuICAgIHNvY2tldHNbZW5kcG9pbnQuaHJlZl0gPSBzb2NrZXRzW2VuZHBvaW50LmhyZWZdIHx8IG5ldyB0aGlzKGRpc3BhdGNoZXIsIGVuZHBvaW50KTtcbiAgICByZXR1cm4gc29ja2V0c1tlbmRwb2ludC5ocmVmXTtcbiAgfSxcblxuICBnZXRTb2NrZXRVcmw6IGZ1bmN0aW9uKGVuZHBvaW50KSB7XG4gICAgZW5kcG9pbnQgPSBGYXllLmNvcHlPYmplY3QoZW5kcG9pbnQpO1xuICAgIGVuZHBvaW50LnByb3RvY29sID0gdGhpcy5QUk9UT0NPTFNbZW5kcG9pbnQucHJvdG9jb2xdO1xuICAgIHJldHVybiBGYXllLlVSSS5zdHJpbmdpZnkoZW5kcG9pbnQpO1xuICB9LFxuXG4gIGlzVXNhYmxlOiBmdW5jdGlvbihkaXNwYXRjaGVyLCBlbmRwb2ludCwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB0aGlzLmNyZWF0ZShkaXNwYXRjaGVyLCBlbmRwb2ludCkuaXNVc2FibGUoY2FsbGJhY2ssIGNvbnRleHQpO1xuICB9XG59KTtcblxuRmF5ZS5leHRlbmQoRmF5ZS5UcmFuc3BvcnQuV2ViU29ja2V0LnByb3RvdHlwZSwgRmF5ZS5EZWZlcnJhYmxlKTtcbkZheWUuVHJhbnNwb3J0LnJlZ2lzdGVyKCd3ZWJzb2NrZXQnLCBGYXllLlRyYW5zcG9ydC5XZWJTb2NrZXQpO1xuXG5pZiAoRmF5ZS5FdmVudCAmJiBGYXllLkVOVi5vbmJlZm9yZXVubG9hZCAhPT0gdW5kZWZpbmVkKVxuICBGYXllLkV2ZW50Lm9uKEZheWUuRU5WLCAnYmVmb3JldW5sb2FkJywgZnVuY3Rpb24oKSB7XG4gICAgRmF5ZS5UcmFuc3BvcnQuV2ViU29ja2V0Ll91bmxvYWRlZCA9IHRydWU7XG4gIH0pO1xuXG5GYXllLlRyYW5zcG9ydC5FdmVudFNvdXJjZSA9IEZheWUuZXh0ZW5kKEZheWUuQ2xhc3MoRmF5ZS5UcmFuc3BvcnQsIHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQpIHtcbiAgICBGYXllLlRyYW5zcG9ydC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIGRpc3BhdGNoZXIsIGVuZHBvaW50KTtcbiAgICBpZiAoIUZheWUuRU5WLkV2ZW50U291cmNlKSByZXR1cm4gdGhpcy5zZXREZWZlcnJlZFN0YXR1cygnZmFpbGVkJyk7XG5cbiAgICB0aGlzLl94aHIgPSBuZXcgRmF5ZS5UcmFuc3BvcnQuWEhSKGRpc3BhdGNoZXIsIGVuZHBvaW50KTtcblxuICAgIGVuZHBvaW50ID0gRmF5ZS5jb3B5T2JqZWN0KGVuZHBvaW50KTtcbiAgICBlbmRwb2ludC5wYXRobmFtZSArPSAnLycgKyBkaXNwYXRjaGVyLmNsaWVudElkO1xuXG4gICAgdmFyIHNvY2tldCA9IG5ldyBFdmVudFNvdXJjZShGYXllLlVSSS5zdHJpbmdpZnkoZW5kcG9pbnQpKSxcbiAgICAgICAgc2VsZiAgID0gdGhpcztcblxuICAgIHNvY2tldC5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYuX2V2ZXJDb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgc2VsZi5zZXREZWZlcnJlZFN0YXR1cygnc3VjY2VlZGVkJyk7XG4gICAgfTtcblxuICAgIHNvY2tldC5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoc2VsZi5fZXZlckNvbm5lY3RlZCkge1xuICAgICAgICBzZWxmLl9oYW5kbGVFcnJvcihbXSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnNldERlZmVycmVkU3RhdHVzKCdmYWlsZWQnKTtcbiAgICAgICAgc29ja2V0LmNsb3NlKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHNvY2tldC5vbm1lc3NhZ2UgPSBmdW5jdGlvbihldmVudCkge1xuICAgICAgc2VsZi5fcmVjZWl2ZShKU09OLnBhcnNlKGV2ZW50LmRhdGEpKTtcbiAgICB9O1xuXG4gICAgdGhpcy5fc29ja2V0ID0gc29ja2V0O1xuICB9LFxuXG4gIGNsb3NlOiBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuX3NvY2tldCkgcmV0dXJuO1xuICAgIHRoaXMuX3NvY2tldC5vbm9wZW4gPSB0aGlzLl9zb2NrZXQub25lcnJvciA9IHRoaXMuX3NvY2tldC5vbm1lc3NhZ2UgPSBudWxsO1xuICAgIHRoaXMuX3NvY2tldC5jbG9zZSgpO1xuICAgIGRlbGV0ZSB0aGlzLl9zb2NrZXQ7XG4gIH0sXG5cbiAgaXNVc2FibGU6IGZ1bmN0aW9uKGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdGhpcy5jYWxsYmFjayhmdW5jdGlvbigpIHsgY2FsbGJhY2suY2FsbChjb250ZXh0LCB0cnVlKSB9KTtcbiAgICB0aGlzLmVycmJhY2soZnVuY3Rpb24oKSB7IGNhbGxiYWNrLmNhbGwoY29udGV4dCwgZmFsc2UpIH0pO1xuICB9LFxuXG4gIGVuY29kZTogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICByZXR1cm4gdGhpcy5feGhyLmVuY29kZShtZXNzYWdlcyk7XG4gIH0sXG5cbiAgcmVxdWVzdDogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICByZXR1cm4gdGhpcy5feGhyLnJlcXVlc3QobWVzc2FnZXMpO1xuICB9XG5cbn0pLCB7XG4gIGlzVXNhYmxlOiBmdW5jdGlvbihkaXNwYXRjaGVyLCBlbmRwb2ludCwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICB2YXIgaWQgPSBkaXNwYXRjaGVyLmNsaWVudElkO1xuICAgIGlmICghaWQpIHJldHVybiBjYWxsYmFjay5jYWxsKGNvbnRleHQsIGZhbHNlKTtcblxuICAgIEZheWUuVHJhbnNwb3J0LlhIUi5pc1VzYWJsZShkaXNwYXRjaGVyLCBlbmRwb2ludCwgZnVuY3Rpb24odXNhYmxlKSB7XG4gICAgICBpZiAoIXVzYWJsZSkgcmV0dXJuIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgZmFsc2UpO1xuICAgICAgdGhpcy5jcmVhdGUoZGlzcGF0Y2hlciwgZW5kcG9pbnQpLmlzVXNhYmxlKGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICB9LCB0aGlzKTtcbiAgfSxcblxuICBjcmVhdGU6IGZ1bmN0aW9uKGRpc3BhdGNoZXIsIGVuZHBvaW50KSB7XG4gICAgdmFyIHNvY2tldHMgPSBkaXNwYXRjaGVyLnRyYW5zcG9ydHMuZXZlbnRzb3VyY2UgPSBkaXNwYXRjaGVyLnRyYW5zcG9ydHMuZXZlbnRzb3VyY2UgfHwge30sXG4gICAgICAgIGlkICAgICAgPSBkaXNwYXRjaGVyLmNsaWVudElkO1xuXG4gICAgdmFyIHVybCA9IEZheWUuY29weU9iamVjdChlbmRwb2ludCk7XG4gICAgdXJsLnBhdGhuYW1lICs9ICcvJyArIChpZCB8fCAnJyk7XG4gICAgdXJsID0gRmF5ZS5VUkkuc3RyaW5naWZ5KHVybCk7XG5cbiAgICBzb2NrZXRzW3VybF0gPSBzb2NrZXRzW3VybF0gfHwgbmV3IHRoaXMoZGlzcGF0Y2hlciwgZW5kcG9pbnQpO1xuICAgIHJldHVybiBzb2NrZXRzW3VybF07XG4gIH1cbn0pO1xuXG5GYXllLmV4dGVuZChGYXllLlRyYW5zcG9ydC5FdmVudFNvdXJjZS5wcm90b3R5cGUsIEZheWUuRGVmZXJyYWJsZSk7XG5GYXllLlRyYW5zcG9ydC5yZWdpc3RlcignZXZlbnRzb3VyY2UnLCBGYXllLlRyYW5zcG9ydC5FdmVudFNvdXJjZSk7XG5cbkZheWUuVHJhbnNwb3J0LlhIUiA9IEZheWUuZXh0ZW5kKEZheWUuQ2xhc3MoRmF5ZS5UcmFuc3BvcnQsIHtcbiAgZW5jb2RlOiBmdW5jdGlvbihtZXNzYWdlcykge1xuICAgIHJldHVybiBGYXllLnRvSlNPTihtZXNzYWdlcyk7XG4gIH0sXG5cbiAgcmVxdWVzdDogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICB2YXIgaHJlZiA9IHRoaXMuZW5kcG9pbnQuaHJlZixcbiAgICAgICAgeGhyICA9IEZheWUuRU5WLkFjdGl2ZVhPYmplY3QgPyBuZXcgQWN0aXZlWE9iamVjdCgnTWljcm9zb2Z0LlhNTEhUVFAnKSA6IG5ldyBYTUxIdHRwUmVxdWVzdCgpLFxuICAgICAgICBzZWxmID0gdGhpcztcblxuICAgIHhoci5vcGVuKCdQT1NUJywgaHJlZiwgdHJ1ZSk7XG4gICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ1ByYWdtYScsICduby1jYWNoZScpO1xuICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdYLVJlcXVlc3RlZC1XaXRoJywgJ1hNTEh0dHBSZXF1ZXN0Jyk7XG5cbiAgICB2YXIgaGVhZGVycyA9IHRoaXMuX2Rpc3BhdGNoZXIuaGVhZGVycztcbiAgICBmb3IgKHZhciBrZXkgaW4gaGVhZGVycykge1xuICAgICAgaWYgKCFoZWFkZXJzLmhhc093blByb3BlcnR5KGtleSkpIGNvbnRpbnVlO1xuICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBoZWFkZXJzW2tleV0pO1xuICAgIH1cblxuICAgIHZhciBhYm9ydCA9IGZ1bmN0aW9uKCkgeyB4aHIuYWJvcnQoKSB9O1xuICAgIGlmIChGYXllLkVOVi5vbmJlZm9yZXVubG9hZCAhPT0gdW5kZWZpbmVkKSBGYXllLkV2ZW50Lm9uKEZheWUuRU5WLCAnYmVmb3JldW5sb2FkJywgYWJvcnQpO1xuXG4gICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCF4aHIgfHwgeGhyLnJlYWR5U3RhdGUgIT09IDQpIHJldHVybjtcblxuICAgICAgdmFyIHJlcGxpZXMgICAgPSBudWxsLFxuICAgICAgICAgIHN0YXR1cyAgICAgPSB4aHIuc3RhdHVzLFxuICAgICAgICAgIHRleHQgICAgICAgPSB4aHIucmVzcG9uc2VUZXh0LFxuICAgICAgICAgIHN1Y2Nlc3NmdWwgPSAoc3RhdHVzID49IDIwMCAmJiBzdGF0dXMgPCAzMDApIHx8IHN0YXR1cyA9PT0gMzA0IHx8IHN0YXR1cyA9PT0gMTIyMztcblxuICAgICAgaWYgKEZheWUuRU5WLm9uYmVmb3JldW5sb2FkICE9PSB1bmRlZmluZWQpIEZheWUuRXZlbnQuZGV0YWNoKEZheWUuRU5WLCAnYmVmb3JldW5sb2FkJywgYWJvcnQpO1xuICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge307XG4gICAgICB4aHIgPSBudWxsO1xuXG4gICAgICBpZiAoIXN1Y2Nlc3NmdWwpIHJldHVybiBzZWxmLl9oYW5kbGVFcnJvcihtZXNzYWdlcyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcGxpZXMgPSBKU09OLnBhcnNlKHRleHQpO1xuICAgICAgfSBjYXRjaCAoZSkge31cblxuICAgICAgaWYgKHJlcGxpZXMpXG4gICAgICAgIHNlbGYuX3JlY2VpdmUocmVwbGllcyk7XG4gICAgICBlbHNlXG4gICAgICAgIHNlbGYuX2hhbmRsZUVycm9yKG1lc3NhZ2VzKTtcbiAgICB9O1xuXG4gICAgeGhyLnNlbmQodGhpcy5lbmNvZGUobWVzc2FnZXMpKTtcbiAgICByZXR1cm4geGhyO1xuICB9XG59KSwge1xuICBpc1VzYWJsZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgY2FsbGJhY2suY2FsbChjb250ZXh0LCBGYXllLlVSSS5pc1NhbWVPcmlnaW4oZW5kcG9pbnQpKTtcbiAgfVxufSk7XG5cbkZheWUuVHJhbnNwb3J0LnJlZ2lzdGVyKCdsb25nLXBvbGxpbmcnLCBGYXllLlRyYW5zcG9ydC5YSFIpO1xuXG5GYXllLlRyYW5zcG9ydC5DT1JTID0gRmF5ZS5leHRlbmQoRmF5ZS5DbGFzcyhGYXllLlRyYW5zcG9ydCwge1xuICBlbmNvZGU6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgcmV0dXJuICdtZXNzYWdlPScgKyBlbmNvZGVVUklDb21wb25lbnQoRmF5ZS50b0pTT04obWVzc2FnZXMpKTtcbiAgfSxcblxuICByZXF1ZXN0OiBmdW5jdGlvbihtZXNzYWdlcykge1xuICAgIHZhciB4aHJDbGFzcyA9IEZheWUuRU5WLlhEb21haW5SZXF1ZXN0ID8gWERvbWFpblJlcXVlc3QgOiBYTUxIdHRwUmVxdWVzdCxcbiAgICAgICAgeGhyICAgICAgPSBuZXcgeGhyQ2xhc3MoKSxcbiAgICAgICAgaWQgICAgICAgPSArK0ZheWUuVHJhbnNwb3J0LkNPUlMuX2lkLFxuICAgICAgICBoZWFkZXJzICA9IHRoaXMuX2Rpc3BhdGNoZXIuaGVhZGVycyxcbiAgICAgICAgc2VsZiAgICAgPSB0aGlzLFxuICAgICAgICBrZXk7XG5cbiAgICB4aHIub3BlbignUE9TVCcsIEZheWUuVVJJLnN0cmluZ2lmeSh0aGlzLmVuZHBvaW50KSwgdHJ1ZSk7XG5cbiAgICBpZiAoeGhyLnNldFJlcXVlc3RIZWFkZXIpIHtcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdQcmFnbWEnLCAnbm8tY2FjaGUnKTtcbiAgICAgIGZvciAoa2V5IGluIGhlYWRlcnMpIHtcbiAgICAgICAgaWYgKCFoZWFkZXJzLmhhc093blByb3BlcnR5KGtleSkpIGNvbnRpbnVlO1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGNsZWFuVXAgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgheGhyKSByZXR1cm4gZmFsc2U7XG4gICAgICBGYXllLlRyYW5zcG9ydC5DT1JTLl9wZW5kaW5nLnJlbW92ZShpZCk7XG4gICAgICB4aHIub25sb2FkID0geGhyLm9uZXJyb3IgPSB4aHIub250aW1lb3V0ID0geGhyLm9ucHJvZ3Jlc3MgPSBudWxsO1xuICAgICAgeGhyID0gbnVsbDtcbiAgICB9O1xuXG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHJlcGxpZXMgPSBudWxsO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVwbGllcyA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgICB9IGNhdGNoIChlKSB7fVxuXG4gICAgICBjbGVhblVwKCk7XG5cbiAgICAgIGlmIChyZXBsaWVzKVxuICAgICAgICBzZWxmLl9yZWNlaXZlKHJlcGxpZXMpO1xuICAgICAgZWxzZVxuICAgICAgICBzZWxmLl9oYW5kbGVFcnJvcihtZXNzYWdlcyk7XG4gICAgfTtcblxuICAgIHhoci5vbmVycm9yID0geGhyLm9udGltZW91dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgY2xlYW5VcCgpO1xuICAgICAgc2VsZi5faGFuZGxlRXJyb3IobWVzc2FnZXMpO1xuICAgIH07XG5cbiAgICB4aHIub25wcm9ncmVzcyA9IGZ1bmN0aW9uKCkge307XG5cbiAgICBpZiAoeGhyQ2xhc3MgPT09IEZheWUuRU5WLlhEb21haW5SZXF1ZXN0KVxuICAgICAgRmF5ZS5UcmFuc3BvcnQuQ09SUy5fcGVuZGluZy5hZGQoe2lkOiBpZCwgeGhyOiB4aHJ9KTtcblxuICAgIHhoci5zZW5kKHRoaXMuZW5jb2RlKG1lc3NhZ2VzKSk7XG4gICAgcmV0dXJuIHhocjtcbiAgfVxufSksIHtcbiAgX2lkOiAgICAgIDAsXG4gIF9wZW5kaW5nOiBuZXcgRmF5ZS5TZXQoKSxcblxuICBpc1VzYWJsZTogZnVuY3Rpb24oZGlzcGF0Y2hlciwgZW5kcG9pbnQsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgaWYgKEZheWUuVVJJLmlzU2FtZU9yaWdpbihlbmRwb2ludCkpXG4gICAgICByZXR1cm4gY2FsbGJhY2suY2FsbChjb250ZXh0LCBmYWxzZSk7XG5cbiAgICBpZiAoRmF5ZS5FTlYuWERvbWFpblJlcXVlc3QpXG4gICAgICByZXR1cm4gY2FsbGJhY2suY2FsbChjb250ZXh0LCBlbmRwb2ludC5wcm90b2NvbCA9PT0gRmF5ZS5FTlYubG9jYXRpb24ucHJvdG9jb2wpO1xuXG4gICAgaWYgKEZheWUuRU5WLlhNTEh0dHBSZXF1ZXN0KSB7XG4gICAgICB2YXIgeGhyID0gbmV3IEZheWUuRU5WLlhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICByZXR1cm4gY2FsbGJhY2suY2FsbChjb250ZXh0LCB4aHIud2l0aENyZWRlbnRpYWxzICE9PSB1bmRlZmluZWQpO1xuICAgIH1cbiAgICByZXR1cm4gY2FsbGJhY2suY2FsbChjb250ZXh0LCBmYWxzZSk7XG4gIH1cbn0pO1xuXG5GYXllLlRyYW5zcG9ydC5yZWdpc3RlcignY3Jvc3Mtb3JpZ2luLWxvbmctcG9sbGluZycsIEZheWUuVHJhbnNwb3J0LkNPUlMpO1xuXG5GYXllLlRyYW5zcG9ydC5KU09OUCA9IEZheWUuZXh0ZW5kKEZheWUuQ2xhc3MoRmF5ZS5UcmFuc3BvcnQsIHtcbiBlbmNvZGU6IGZ1bmN0aW9uKG1lc3NhZ2VzKSB7XG4gICAgdmFyIHVybCA9IEZheWUuY29weU9iamVjdCh0aGlzLmVuZHBvaW50KTtcbiAgICB1cmwucXVlcnkubWVzc2FnZSA9IEZheWUudG9KU09OKG1lc3NhZ2VzKTtcbiAgICB1cmwucXVlcnkuanNvbnAgICA9ICdfX2pzb25wJyArIEZheWUuVHJhbnNwb3J0LkpTT05QLl9jYkNvdW50ICsgJ19fJztcbiAgICByZXR1cm4gRmF5ZS5VUkkuc3RyaW5naWZ5KHVybCk7XG4gIH0sXG5cbiAgcmVxdWVzdDogZnVuY3Rpb24obWVzc2FnZXMpIHtcbiAgICB2YXIgaGVhZCAgICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXSxcbiAgICAgICAgc2NyaXB0ICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0JyksXG4gICAgICAgIGNhbGxiYWNrTmFtZSA9IEZheWUuVHJhbnNwb3J0LkpTT05QLmdldENhbGxiYWNrTmFtZSgpLFxuICAgICAgICBlbmRwb2ludCAgICAgPSBGYXllLmNvcHlPYmplY3QodGhpcy5lbmRwb2ludCksXG4gICAgICAgIHNlbGYgICAgICAgICA9IHRoaXM7XG5cbiAgICBlbmRwb2ludC5xdWVyeS5tZXNzYWdlID0gRmF5ZS50b0pTT04obWVzc2FnZXMpO1xuICAgIGVuZHBvaW50LnF1ZXJ5Lmpzb25wICAgPSBjYWxsYmFja05hbWU7XG5cbiAgICB2YXIgY2xlYW51cCA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCFGYXllLkVOVltjYWxsYmFja05hbWVdKSByZXR1cm4gZmFsc2U7XG4gICAgICBGYXllLkVOVltjYWxsYmFja05hbWVdID0gdW5kZWZpbmVkO1xuICAgICAgdHJ5IHsgZGVsZXRlIEZheWUuRU5WW2NhbGxiYWNrTmFtZV0gfSBjYXRjaCAoZSkge31cbiAgICAgIHNjcmlwdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHNjcmlwdCk7XG4gICAgfTtcblxuICAgIEZheWUuRU5WW2NhbGxiYWNrTmFtZV0gPSBmdW5jdGlvbihyZXBsaWVzKSB7XG4gICAgICBjbGVhbnVwKCk7XG4gICAgICBzZWxmLl9yZWNlaXZlKHJlcGxpZXMpO1xuICAgIH07XG5cbiAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgIHNjcmlwdC5zcmMgID0gRmF5ZS5VUkkuc3RyaW5naWZ5KGVuZHBvaW50KTtcbiAgICBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG5cbiAgICBzY3JpcHQub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgY2xlYW51cCgpO1xuICAgICAgc2VsZi5faGFuZGxlRXJyb3IobWVzc2FnZXMpO1xuICAgIH07XG5cbiAgICByZXR1cm4ge2Fib3J0OiBjbGVhbnVwfTtcbiAgfVxufSksIHtcbiAgX2NiQ291bnQ6IDAsXG5cbiAgZ2V0Q2FsbGJhY2tOYW1lOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9jYkNvdW50ICs9IDE7XG4gICAgcmV0dXJuICdfX2pzb25wJyArIHRoaXMuX2NiQ291bnQgKyAnX18nO1xuICB9LFxuXG4gIGlzVXNhYmxlOiBmdW5jdGlvbihkaXNwYXRjaGVyLCBlbmRwb2ludCwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICBjYWxsYmFjay5jYWxsKGNvbnRleHQsIHRydWUpO1xuICB9XG59KTtcblxuRmF5ZS5UcmFuc3BvcnQucmVnaXN0ZXIoJ2NhbGxiYWNrLXBvbGxpbmcnLCBGYXllLlRyYW5zcG9ydC5KU09OUCk7XG5cbn0pKCk7IiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuKGZ1bmN0aW9uICgpIHtcbiAgdHJ5IHtcbiAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNhY2hlZFNldFRpbWVvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaXMgbm90IGRlZmluZWQnKTtcbiAgICB9XG4gIH1cbiAgdHJ5IHtcbiAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBpcyBub3QgZGVmaW5lZCcpO1xuICAgIH1cbiAgfVxufSAoKSlcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IGNhY2hlZFNldFRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGNhY2hlZENsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iXX0=
