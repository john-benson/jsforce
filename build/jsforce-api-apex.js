(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Apex = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Salesforce Apex REST endpoint calls
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var jsforce = window.jsforce.require('./core');

/**
 * API class for Apex REST endpoint call
 *
 * @class
 * @param {Connection} conn Connection
 */
var Apex = function(conn) {
  this._conn = conn;
};

/**
 * @private
 */
Apex.prototype._baseUrl = function() {
  return this._conn.instanceUrl + "/services/apexrest";
};

/**
 * @private
 */
Apex.prototype._createRequestParams = function(method, path, body, options) {
  var params = {
    method: method,
    url: this._baseUrl() + path
  },
  _headers = {};
  if(options && 'object' === typeof options['headers']){
    _headers = options['headers'];
  }
  if (!/^(GET|DELETE)$/i.test(method)) {
    _headers["Content-Type"] = "application/json";
  }
  params.headers = _headers;
  if (body) {
    params.body = JSON.stringify(body);
  }
  return params;
};

/**
 * Call Apex REST service in GET request
 *
 * @param {String} path - URL path to Apex REST service
 * @param {Object} options - Holds headers and other meta data for the request.
 * @param {Callback.<Object>} [callback] - Callback function
 * @returns {Promise.<Object>}
 */
Apex.prototype.get = function(path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  return this._conn.request(this._createRequestParams('GET', path, undefined, options)).thenCall(callback);
};

/**
 * Call Apex REST service in POST request
 *
 * @param {String} path - URL path to Apex REST service
 * @param {Object} [body] - Request body
 * @param {Object} options - Holds headers and other meta data for the request.
 * @param {Callback.<Object>} [callback] - Callback function
 * @returns {Promise.<Object>}
 */
Apex.prototype.post = function(path, body, options, callback) {
  if (typeof body === 'function') {
    callback = body;
    body = undefined;
    options = undefined;
  }
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  var params = this._createRequestParams('POST', path, body, options);
  return this._conn.request(params).thenCall(callback);
};

/**
 * Call Apex REST service in PUT request
 *
 * @param {String} path - URL path to Apex REST service
 * @param {Object} [body] - Request body
 * @param {Object} [options] - Holds headers and other meta data for the request.
 * @param {Callback.<Object>} [callback] - Callback function
 * @returns {Promise.<Object>}
 */
Apex.prototype.put = function(path, body, options, callback) {
  if (typeof body === 'function') {
    callback = body;
    body = undefined;
    options = undefined;
  }
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  var params = this._createRequestParams('PUT', path, body, options);
  return this._conn.request(params).thenCall(callback);
};

/**
 * Call Apex REST service in PATCH request
 *
 * @param {String} path - URL path to Apex REST service
 * @param {Object} [body] - Request body
 * @param {Object} [options] - Holds headers and other meta data for the request.
 * @param {Callback.<Object>} [callback] - Callback function
 * @returns {Promise.<Object>}
 */
Apex.prototype.patch = function(path, body, options, callback) {
  if (typeof body === 'function') {
    callback = body;
    body = undefined;
    options = undefined;
  }
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  var params = this._createRequestParams('PATCH', path, body, options);
  return this._conn.request(params).thenCall(callback);
};

/**
 * Synonym of Apex#delete()
 *
 * @method Apex#del
 *
 * @param {String} path - URL path to Apex REST service
 * @param {Object} [body] - Request body
 * @param {Callback.<Object>} [callback] - Callback function
 * @returns {Promise.<Object>}
 */
/**
 * Call Apex REST service in DELETE request
 *
 * @method Apex#delete
 *
 * @param {String} path - URL path to Apex REST service
 * @param {Object} [body] - Request body
 * @param {Object} [options] - Holds headers and other meta data for the request.
 * @param {Callback.<Object>} [callback] - Callback function
 * @returns {Promise.<Object>}
 */
Apex.prototype.del =
  Apex.prototype["delete"] = function(path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  return this._conn.request(this._createRequestParams('DELETE', path, undefined, options)).thenCall(callback);
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.apex = new Apex(conn);
});


module.exports = Apex;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL2FwZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcclxuICogQGZpbGUgTWFuYWdlcyBTYWxlc2ZvcmNlIEFwZXggUkVTVCBlbmRwb2ludCBjYWxsc1xyXG4gKiBAYXV0aG9yIFNoaW5pY2hpIFRvbWl0YSA8c2hpbmljaGkudG9taXRhQGdtYWlsLmNvbT5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIganNmb3JjZSA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJy4vY29yZScpO1xyXG5cclxuLyoqXHJcbiAqIEFQSSBjbGFzcyBmb3IgQXBleCBSRVNUIGVuZHBvaW50IGNhbGxcclxuICpcclxuICogQGNsYXNzXHJcbiAqIEBwYXJhbSB7Q29ubmVjdGlvbn0gY29ubiBDb25uZWN0aW9uXHJcbiAqL1xyXG52YXIgQXBleCA9IGZ1bmN0aW9uKGNvbm4pIHtcclxuICB0aGlzLl9jb25uID0gY29ubjtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQXBleC5wcm90b3R5cGUuX2Jhc2VVcmwgPSBmdW5jdGlvbigpIHtcclxuICByZXR1cm4gdGhpcy5fY29ubi5pbnN0YW5jZVVybCArIFwiL3NlcnZpY2VzL2FwZXhyZXN0XCI7XHJcbn07XHJcblxyXG4vKipcclxuICogQHByaXZhdGVcclxuICovXHJcbkFwZXgucHJvdG90eXBlLl9jcmVhdGVSZXF1ZXN0UGFyYW1zID0gZnVuY3Rpb24obWV0aG9kLCBwYXRoLCBib2R5LCBvcHRpb25zKSB7XHJcbiAgdmFyIHBhcmFtcyA9IHtcclxuICAgIG1ldGhvZDogbWV0aG9kLFxyXG4gICAgdXJsOiB0aGlzLl9iYXNlVXJsKCkgKyBwYXRoXHJcbiAgfSxcclxuICBfaGVhZGVycyA9IHt9O1xyXG4gIGlmKG9wdGlvbnMgJiYgJ29iamVjdCcgPT09IHR5cGVvZiBvcHRpb25zWydoZWFkZXJzJ10pe1xyXG4gICAgX2hlYWRlcnMgPSBvcHRpb25zWydoZWFkZXJzJ107XHJcbiAgfVxyXG4gIGlmICghL14oR0VUfERFTEVURSkkL2kudGVzdChtZXRob2QpKSB7XHJcbiAgICBfaGVhZGVyc1tcIkNvbnRlbnQtVHlwZVwiXSA9IFwiYXBwbGljYXRpb24vanNvblwiO1xyXG4gIH1cclxuICBwYXJhbXMuaGVhZGVycyA9IF9oZWFkZXJzO1xyXG4gIGlmIChib2R5KSB7XHJcbiAgICBwYXJhbXMuYm9keSA9IEpTT04uc3RyaW5naWZ5KGJvZHkpO1xyXG4gIH1cclxuICByZXR1cm4gcGFyYW1zO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENhbGwgQXBleCBSRVNUIHNlcnZpY2UgaW4gR0VUIHJlcXVlc3RcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGggLSBVUkwgcGF0aCB0byBBcGV4IFJFU1Qgc2VydmljZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIEhvbGRzIGhlYWRlcnMgYW5kIG90aGVyIG1ldGEgZGF0YSBmb3IgdGhlIHJlcXVlc3QuXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE9iamVjdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48T2JqZWN0Pn1cclxuICovXHJcbkFwZXgucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKHBhdGgsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICBjYWxsYmFjayA9IG9wdGlvbnM7XHJcbiAgICBvcHRpb25zID0gdW5kZWZpbmVkO1xyXG4gIH1cclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHRoaXMuX2NyZWF0ZVJlcXVlc3RQYXJhbXMoJ0dFVCcsIHBhdGgsIHVuZGVmaW5lZCwgb3B0aW9ucykpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYWxsIEFwZXggUkVTVCBzZXJ2aWNlIGluIFBPU1QgcmVxdWVzdFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aCAtIFVSTCBwYXRoIHRvIEFwZXggUkVTVCBzZXJ2aWNlXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbYm9keV0gLSBSZXF1ZXN0IGJvZHlcclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBIb2xkcyBoZWFkZXJzIGFuZCBvdGhlciBtZXRhIGRhdGEgZm9yIHRoZSByZXF1ZXN0LlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxPYmplY3Q+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPE9iamVjdD59XHJcbiAqL1xyXG5BcGV4LnByb3RvdHlwZS5wb3N0ID0gZnVuY3Rpb24ocGF0aCwgYm9keSwgb3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gYm9keTtcclxuICAgIGJvZHkgPSB1bmRlZmluZWQ7XHJcbiAgICBvcHRpb25zID0gdW5kZWZpbmVkO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gb3B0aW9ucztcclxuICAgIG9wdGlvbnMgPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG4gIHZhciBwYXJhbXMgPSB0aGlzLl9jcmVhdGVSZXF1ZXN0UGFyYW1zKCdQT1NUJywgcGF0aCwgYm9keSwgb3B0aW9ucyk7XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4ucmVxdWVzdChwYXJhbXMpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYWxsIEFwZXggUkVTVCBzZXJ2aWNlIGluIFBVVCByZXF1ZXN0XHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIC0gVVJMIHBhdGggdG8gQXBleCBSRVNUIHNlcnZpY2VcclxuICogQHBhcmFtIHtPYmplY3R9IFtib2R5XSAtIFJlcXVlc3QgYm9keVxyXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIC0gSG9sZHMgaGVhZGVycyBhbmQgb3RoZXIgbWV0YSBkYXRhIGZvciB0aGUgcmVxdWVzdC5cclxuICogQHBhcmFtIHtDYWxsYmFjay48T2JqZWN0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxPYmplY3Q+fVxyXG4gKi9cclxuQXBleC5wcm90b3R5cGUucHV0ID0gZnVuY3Rpb24ocGF0aCwgYm9keSwgb3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gYm9keTtcclxuICAgIGJvZHkgPSB1bmRlZmluZWQ7XHJcbiAgICBvcHRpb25zID0gdW5kZWZpbmVkO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gb3B0aW9ucztcclxuICAgIG9wdGlvbnMgPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG4gIHZhciBwYXJhbXMgPSB0aGlzLl9jcmVhdGVSZXF1ZXN0UGFyYW1zKCdQVVQnLCBwYXRoLCBib2R5LCBvcHRpb25zKTtcclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHBhcmFtcykudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENhbGwgQXBleCBSRVNUIHNlcnZpY2UgaW4gUEFUQ0ggcmVxdWVzdFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aCAtIFVSTCBwYXRoIHRvIEFwZXggUkVTVCBzZXJ2aWNlXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbYm9keV0gLSBSZXF1ZXN0IGJvZHlcclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSAtIEhvbGRzIGhlYWRlcnMgYW5kIG90aGVyIG1ldGEgZGF0YSBmb3IgdGhlIHJlcXVlc3QuXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE9iamVjdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48T2JqZWN0Pn1cclxuICovXHJcbkFwZXgucHJvdG90eXBlLnBhdGNoID0gZnVuY3Rpb24ocGF0aCwgYm9keSwgb3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZiAodHlwZW9mIGJvZHkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gYm9keTtcclxuICAgIGJvZHkgPSB1bmRlZmluZWQ7XHJcbiAgICBvcHRpb25zID0gdW5kZWZpbmVkO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gb3B0aW9ucztcclxuICAgIG9wdGlvbnMgPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG4gIHZhciBwYXJhbXMgPSB0aGlzLl9jcmVhdGVSZXF1ZXN0UGFyYW1zKCdQQVRDSCcsIHBhdGgsIGJvZHksIG9wdGlvbnMpO1xyXG4gIHJldHVybiB0aGlzLl9jb25uLnJlcXVlc3QocGFyYW1zKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogU3lub255bSBvZiBBcGV4I2RlbGV0ZSgpXHJcbiAqXHJcbiAqIEBtZXRob2QgQXBleCNkZWxcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGggLSBVUkwgcGF0aCB0byBBcGV4IFJFU1Qgc2VydmljZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gW2JvZHldIC0gUmVxdWVzdCBib2R5XHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE9iamVjdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48T2JqZWN0Pn1cclxuICovXHJcbi8qKlxyXG4gKiBDYWxsIEFwZXggUkVTVCBzZXJ2aWNlIGluIERFTEVURSByZXF1ZXN0XHJcbiAqXHJcbiAqIEBtZXRob2QgQXBleCNkZWxldGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGggLSBVUkwgcGF0aCB0byBBcGV4IFJFU1Qgc2VydmljZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gW2JvZHldIC0gUmVxdWVzdCBib2R5XHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gLSBIb2xkcyBoZWFkZXJzIGFuZCBvdGhlciBtZXRhIGRhdGEgZm9yIHRoZSByZXF1ZXN0LlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxPYmplY3Q+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPE9iamVjdD59XHJcbiAqL1xyXG5BcGV4LnByb3RvdHlwZS5kZWwgPVxyXG4gIEFwZXgucHJvdG90eXBlW1wiZGVsZXRlXCJdID0gZnVuY3Rpb24ocGF0aCwgb3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcclxuICAgIGNhbGxiYWNrID0gb3B0aW9ucztcclxuICAgIG9wdGlvbnMgPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG4gIHJldHVybiB0aGlzLl9jb25uLnJlcXVlc3QodGhpcy5fY3JlYXRlUmVxdWVzdFBhcmFtcygnREVMRVRFJywgcGF0aCwgdW5kZWZpbmVkLCBvcHRpb25zKSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuXHJcbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4vKlxyXG4gKiBSZWdpc3RlciBob29rIGluIGNvbm5lY3Rpb24gaW5zdGFudGlhdGlvbiBmb3IgZHluYW1pY2FsbHkgYWRkaW5nIHRoaXMgQVBJIG1vZHVsZSBmZWF0dXJlc1xyXG4gKi9cclxuanNmb3JjZS5vbignY29ubmVjdGlvbjpuZXcnLCBmdW5jdGlvbihjb25uKSB7XHJcbiAgY29ubi5hcGV4ID0gbmV3IEFwZXgoY29ubik7XHJcbn0pO1xyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQXBleDtcclxuIl19
