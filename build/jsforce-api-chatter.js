(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Chatter = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Salesforce Chatter REST API calls
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var inherits = window.jsforce.require('inherits'),
    _       = window.jsforce.require('lodash/core'),
    jsforce = window.jsforce.require('./core'),
    Promise = window.jsforce.require('./promise');

/**
 * API class for Chatter REST API call
 *
 * @class
 * @param {Connection} conn Connection
 */
var Chatter = module.exports = function(conn) {
  this._conn = conn;
};

/**
 * Sending request to API endpoint
 * @private
 */
Chatter.prototype._request = function(params, callback) {
  if (/^(put|post|patch)$/i.test(params.method)) {
    if (_.isObject(params.body)) {
      params.headers = {
        "Content-Type": "application/json"
      };
      params.body = JSON.stringify(params.body);
    }
  }
  params.url = this._normalizeUrl(params.url);
  return this._conn.request(params, callback);
};

/**
 * Convert path to site root relative url
 * @private
 */
Chatter.prototype._normalizeUrl = function(url) {
  if (url.indexOf('/chatter/') === 0 || url.indexOf('/connect/') === 0) {
    return '/services/data/v' + this._conn.version + url;
  } else if (/^\/v[\d]+\.[\d]+\//.test(url)) {
    return '/services/data' + url;
  } else if (url.indexOf('/services/') !== 0 && url[0] === '/') {
    return '/services/data/v' + this._conn.version + '/chatter' + url;
  } else {
    return url;
  }
};

/**
 * @typedef {Object} Chatter~RequestParams
 * @prop {String} method - HTTP method
 * @prop {String} url - Resource URL
 * @prop {String} [body] - HTTP body (in POST/PUT/PATCH methods)
 */

/**
 * @typedef {Object} Chatter~RequestResult
 */

/**
 * Make a request for chatter API resource
 *
 * @param {Chatter~RequestParams} params - Paramters representing HTTP request
 * @param {Callback.<Chatter~RequestResult>} [callback] - Callback func
 * @returns {Chatter~Request}
 */
Chatter.prototype.request = function(params, callback) {
  return new Request(this, params).thenCall(callback);
};

/**
 * Make a resource request to chatter API
 *
 * @param {String} url - Resource URL
 * @param {Object} [queryParams] - Query parameters (in hash object)
 * @returns {Chatter~Resource}
 */
Chatter.prototype.resource = function(url, queryParams) {
  return new Resource(this, url, queryParams);
};

/**
 * @typedef {Object} Chatter~BatchRequestResult
 * @prop {Boolean} hasError - Flag if the batch has one or more errors
 * @prop {Array.<Object>} results - Batch request results in array
 * @prop {Number} results.statusCode - HTTP response status code
 * @prop {Chatter~RequestResult} results.result - Parsed HTTP response body
 */

/**
 * Make a batch request to chatter API
 *
 * @params {Array.<Chatter~Request>} requests - Chatter API requests
 * @param {Callback.<Chatter~BatchRequestResult>} [callback] - Callback func
 * @returns {Promise.<Chatter~BatchRequestResult>}
 */
Chatter.prototype.batch = function(requests, callback) {
  var self = this;
  var batchRequests = [], batchDeferreds = [];
  _.forEach(requests, function(request) {
    var deferred = Promise.defer();
    request._promise = deferred.promise;
    batchRequests.push(request.batchParams());
    batchDeferreds.push(deferred);
  });
  var params = {
    method: 'POST',
    url: this._normalizeUrl('/connect/batch'),
    body: {
      batchRequests: batchRequests
    }
  };
  return this.request(params).then(function(res) {
    _.forEach(res.results, function(result, i) {
      var deferred = batchDeferreds[i];
      if (result.statusCode >= 400) {
        deferred.reject(result.result);
      } else {
        deferred.resolve(result.result);
      }
    });
    return res;
  }).thenCall(callback);
};


/*--------------------------------------------*/
/**
 * A class representing chatter API request
 *
 * @protected
 * @class Chatter~Request
 * @implements {Promise.<Chatter~RequestResult>}
 * @param {Chatter} chatter - Chatter API object
 * @param {Chatter~RequestParams} params - Paramters representing HTTP request
 */
var Request = function(chatter, params) {
  this._chatter = chatter;
  this._params = params;
  this._promise = null;
};

/**
 * @typedef {Object} Chatter~BatchRequestParams
 * @prop {String} method - HTTP method
 * @prop {String} url - Resource URL
 * @prop {String} [richInput] - HTTP body (in POST/PUT/PATCH methods)
 */

/**
 * Retrieve parameters in batch request form
 *
 * @method Chatter~Request#batchParams
 * @returns {Chatter~BatchRequestParams}
 */
Request.prototype.batchParams = function() {
  var params = this._params;
  var batchParams = {
    method: params.method,
    url: this._chatter._normalizeUrl(params.url)
  };
  if (this._params.body) {
    batchParams.richInput = this._params.body;
  }
  return batchParams;
};

/**
 * Retrieve parameters in batch request form
 *
 * @method Chatter~Request#promise
 * @returns {Promise.<Chatter~RequestResult>}
 */
Request.prototype.promise = function() {
  return this._promise || this._chatter._request(this._params);
};

/**
 * Returns Node.js Stream object for request
 *
 * @method Chatter~Request#stream
 * @returns {stream.Stream}
 */
Request.prototype.stream = function() {
  return this._chatter._request(this._params).stream();
};

/**
 * Promise/A+ interface
 * http://promises-aplus.github.io/promises-spec/
 *
 * Delegate to deferred promise, return promise instance for batch result
 *
 * @method Chatter~Request#then
 */
Request.prototype.then = function(onResolve, onReject) {
  return this.promise().then(onResolve, onReject);
};

/**
 * Promise/A+ extension
 * Call "then" using given node-style callback function
 *
 * @method Chatter~Request#thenCall
 */
Request.prototype.thenCall = function(callback) {
  return _.isFunction(callback) ? this.promise().thenCall(callback) : this;
};


/*--------------------------------------------*/
/**
 * A class representing chatter API resource
 *
 * @protected
 * @class Chatter~Resource
 * @extends Chatter~Request
 * @param {Chatter} chatter - Chatter API object
 * @param {String} url - Resource URL
 * @param {Object} [queryParams] - Query parameters (in hash object)
 */
var Resource = function(chatter, url, queryParams) {
  if (queryParams) {
    var qstring = _.map(_.keys(queryParams), function(name) {
      return name + "=" + encodeURIComponent(queryParams[name]);
    }).join('&');
    url += (url.indexOf('?') > 0 ? '&' : '?') + qstring;
  }
  Resource.super_.call(this, chatter, { method: 'GET', url: url });
  this._url = url;
};

inherits(Resource, Request);

/**
 * Create a new resource
 *
 * @method Chatter~Resource#create
 * @param {Object} data - Data to newly post
 * @param {Callback.<Chatter~RequestResult>} [callback] - Callback function
 * @returns {Chatter~Request}
 */
Resource.prototype.create = function(data, callback) {
  return this._chatter.request({
    method: 'POST',
    url: this._url,
    body: data
  }).thenCall(callback);
};

/**
 * Retrieve resource content
 *
 * @method Chatter~Resource#retrieve
 * @param {Callback.<Chatter~RequestResult>} [callback] - Callback function
 * @returns {Chatter~Request}
 */
Resource.prototype.retrieve = function(callback) {
  return this.thenCall(callback);
};

/**
 * Update specified resource
 *
 * @method Chatter~Resource#update
 * @param {Obejct} data - Data to update
 * @param {Callback.<Chatter~RequestResult>} [callback] - Callback function
 * @returns {Chatter~Request}
 */
Resource.prototype.update = function(data, callback) {
  return this._chatter.request({
    method: 'POST',
    url: this._url,
    body: data
  }).thenCall(callback);
};

/**
 * Synonym of Resource#delete()
 *
 * @method Chatter~Resource#del
 * @param {Callback.<Chatter~RequestResult>} [callback] - Callback function
 * @returns {Chatter~Request}
 */
/**
 * Delete specified resource
 *
 * @method Chatter~Resource#delete
 * @param {Callback.<Chatter~RequestResult>} [callback] - Callback function
 * @returns {Chatter~Request}
 */
Resource.prototype.del =
Resource.prototype["delete"] = function(callback) {
  return this._chatter.request({
    method: 'DELETE',
    url: this._url
  }).thenCall(callback);
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.chatter = new Chatter(conn);
});

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL2NoYXR0ZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXHJcbiAqIEBmaWxlIE1hbmFnZXMgU2FsZXNmb3JjZSBDaGF0dGVyIFJFU1QgQVBJIGNhbGxzXHJcbiAqIEBhdXRob3IgU2hpbmljaGkgVG9taXRhIDxzaGluaWNoaS50b21pdGFAZ21haWwuY29tPlxyXG4gKi9cclxuXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBpbmhlcml0cyA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJ2luaGVyaXRzJyksXHJcbiAgICBfICAgICAgID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnbG9kYXNoL2NvcmUnKSxcclxuICAgIGpzZm9yY2UgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCcuL2NvcmUnKSxcclxuICAgIFByb21pc2UgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCcuL3Byb21pc2UnKTtcclxuXHJcbi8qKlxyXG4gKiBBUEkgY2xhc3MgZm9yIENoYXR0ZXIgUkVTVCBBUEkgY2FsbFxyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIENvbm5lY3Rpb25cclxuICovXHJcbnZhciBDaGF0dGVyID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjb25uKSB7XHJcbiAgdGhpcy5fY29ubiA9IGNvbm47XHJcbn07XHJcblxyXG4vKipcclxuICogU2VuZGluZyByZXF1ZXN0IHRvIEFQSSBlbmRwb2ludFxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQ2hhdHRlci5wcm90b3R5cGUuX3JlcXVlc3QgPSBmdW5jdGlvbihwYXJhbXMsIGNhbGxiYWNrKSB7XHJcbiAgaWYgKC9eKHB1dHxwb3N0fHBhdGNoKSQvaS50ZXN0KHBhcmFtcy5tZXRob2QpKSB7XHJcbiAgICBpZiAoXy5pc09iamVjdChwYXJhbXMuYm9keSkpIHtcclxuICAgICAgcGFyYW1zLmhlYWRlcnMgPSB7XHJcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCJcclxuICAgICAgfTtcclxuICAgICAgcGFyYW1zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShwYXJhbXMuYm9keSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHBhcmFtcy51cmwgPSB0aGlzLl9ub3JtYWxpemVVcmwocGFyYW1zLnVybCk7XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4ucmVxdWVzdChwYXJhbXMsIGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0IHBhdGggdG8gc2l0ZSByb290IHJlbGF0aXZlIHVybFxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQ2hhdHRlci5wcm90b3R5cGUuX25vcm1hbGl6ZVVybCA9IGZ1bmN0aW9uKHVybCkge1xyXG4gIGlmICh1cmwuaW5kZXhPZignL2NoYXR0ZXIvJykgPT09IDAgfHwgdXJsLmluZGV4T2YoJy9jb25uZWN0LycpID09PSAwKSB7XHJcbiAgICByZXR1cm4gJy9zZXJ2aWNlcy9kYXRhL3YnICsgdGhpcy5fY29ubi52ZXJzaW9uICsgdXJsO1xyXG4gIH0gZWxzZSBpZiAoL15cXC92W1xcZF0rXFwuW1xcZF0rXFwvLy50ZXN0KHVybCkpIHtcclxuICAgIHJldHVybiAnL3NlcnZpY2VzL2RhdGEnICsgdXJsO1xyXG4gIH0gZWxzZSBpZiAodXJsLmluZGV4T2YoJy9zZXJ2aWNlcy8nKSAhPT0gMCAmJiB1cmxbMF0gPT09ICcvJykge1xyXG4gICAgcmV0dXJuICcvc2VydmljZXMvZGF0YS92JyArIHRoaXMuX2Nvbm4udmVyc2lvbiArICcvY2hhdHRlcicgKyB1cmw7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiB1cmw7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IENoYXR0ZXJ+UmVxdWVzdFBhcmFtc1xyXG4gKiBAcHJvcCB7U3RyaW5nfSBtZXRob2QgLSBIVFRQIG1ldGhvZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1cmwgLSBSZXNvdXJjZSBVUkxcclxuICogQHByb3Age1N0cmluZ30gW2JvZHldIC0gSFRUUCBib2R5IChpbiBQT1NUL1BVVC9QQVRDSCBtZXRob2RzKVxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBDaGF0dGVyflJlcXVlc3RSZXN1bHRcclxuICovXHJcblxyXG4vKipcclxuICogTWFrZSBhIHJlcXVlc3QgZm9yIGNoYXR0ZXIgQVBJIHJlc291cmNlXHJcbiAqXHJcbiAqIEBwYXJhbSB7Q2hhdHRlcn5SZXF1ZXN0UGFyYW1zfSBwYXJhbXMgLSBQYXJhbXRlcnMgcmVwcmVzZW50aW5nIEhUVFAgcmVxdWVzdFxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxDaGF0dGVyflJlcXVlc3RSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY1xyXG4gKiBAcmV0dXJucyB7Q2hhdHRlcn5SZXF1ZXN0fVxyXG4gKi9cclxuQ2hhdHRlci5wcm90b3R5cGUucmVxdWVzdCA9IGZ1bmN0aW9uKHBhcmFtcywgY2FsbGJhY2spIHtcclxuICByZXR1cm4gbmV3IFJlcXVlc3QodGhpcywgcGFyYW1zKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogTWFrZSBhIHJlc291cmNlIHJlcXVlc3QgdG8gY2hhdHRlciBBUElcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHVybCAtIFJlc291cmNlIFVSTFxyXG4gKiBAcGFyYW0ge09iamVjdH0gW3F1ZXJ5UGFyYW1zXSAtIFF1ZXJ5IHBhcmFtZXRlcnMgKGluIGhhc2ggb2JqZWN0KVxyXG4gKiBAcmV0dXJucyB7Q2hhdHRlcn5SZXNvdXJjZX1cclxuICovXHJcbkNoYXR0ZXIucHJvdG90eXBlLnJlc291cmNlID0gZnVuY3Rpb24odXJsLCBxdWVyeVBhcmFtcykge1xyXG4gIHJldHVybiBuZXcgUmVzb3VyY2UodGhpcywgdXJsLCBxdWVyeVBhcmFtcyk7XHJcbn07XHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gQ2hhdHRlcn5CYXRjaFJlcXVlc3RSZXN1bHRcclxuICogQHByb3Age0Jvb2xlYW59IGhhc0Vycm9yIC0gRmxhZyBpZiB0aGUgYmF0Y2ggaGFzIG9uZSBvciBtb3JlIGVycm9yc1xyXG4gKiBAcHJvcCB7QXJyYXkuPE9iamVjdD59IHJlc3VsdHMgLSBCYXRjaCByZXF1ZXN0IHJlc3VsdHMgaW4gYXJyYXlcclxuICogQHByb3Age051bWJlcn0gcmVzdWx0cy5zdGF0dXNDb2RlIC0gSFRUUCByZXNwb25zZSBzdGF0dXMgY29kZVxyXG4gKiBAcHJvcCB7Q2hhdHRlcn5SZXF1ZXN0UmVzdWx0fSByZXN1bHRzLnJlc3VsdCAtIFBhcnNlZCBIVFRQIHJlc3BvbnNlIGJvZHlcclxuICovXHJcblxyXG4vKipcclxuICogTWFrZSBhIGJhdGNoIHJlcXVlc3QgdG8gY2hhdHRlciBBUElcclxuICpcclxuICogQHBhcmFtcyB7QXJyYXkuPENoYXR0ZXJ+UmVxdWVzdD59IHJlcXVlc3RzIC0gQ2hhdHRlciBBUEkgcmVxdWVzdHNcclxuICogQHBhcmFtIHtDYWxsYmFjay48Q2hhdHRlcn5CYXRjaFJlcXVlc3RSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY1xyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48Q2hhdHRlcn5CYXRjaFJlcXVlc3RSZXN1bHQ+fVxyXG4gKi9cclxuQ2hhdHRlci5wcm90b3R5cGUuYmF0Y2ggPSBmdW5jdGlvbihyZXF1ZXN0cywgY2FsbGJhY2spIHtcclxuICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgdmFyIGJhdGNoUmVxdWVzdHMgPSBbXSwgYmF0Y2hEZWZlcnJlZHMgPSBbXTtcclxuICBfLmZvckVhY2gocmVxdWVzdHMsIGZ1bmN0aW9uKHJlcXVlc3QpIHtcclxuICAgIHZhciBkZWZlcnJlZCA9IFByb21pc2UuZGVmZXIoKTtcclxuICAgIHJlcXVlc3QuX3Byb21pc2UgPSBkZWZlcnJlZC5wcm9taXNlO1xyXG4gICAgYmF0Y2hSZXF1ZXN0cy5wdXNoKHJlcXVlc3QuYmF0Y2hQYXJhbXMoKSk7XHJcbiAgICBiYXRjaERlZmVycmVkcy5wdXNoKGRlZmVycmVkKTtcclxuICB9KTtcclxuICB2YXIgcGFyYW1zID0ge1xyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICB1cmw6IHRoaXMuX25vcm1hbGl6ZVVybCgnL2Nvbm5lY3QvYmF0Y2gnKSxcclxuICAgIGJvZHk6IHtcclxuICAgICAgYmF0Y2hSZXF1ZXN0czogYmF0Y2hSZXF1ZXN0c1xyXG4gICAgfVxyXG4gIH07XHJcbiAgcmV0dXJuIHRoaXMucmVxdWVzdChwYXJhbXMpLnRoZW4oZnVuY3Rpb24ocmVzKSB7XHJcbiAgICBfLmZvckVhY2gocmVzLnJlc3VsdHMsIGZ1bmN0aW9uKHJlc3VsdCwgaSkge1xyXG4gICAgICB2YXIgZGVmZXJyZWQgPSBiYXRjaERlZmVycmVkc1tpXTtcclxuICAgICAgaWYgKHJlc3VsdC5zdGF0dXNDb2RlID49IDQwMCkge1xyXG4gICAgICAgIGRlZmVycmVkLnJlamVjdChyZXN1bHQucmVzdWx0KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdC5yZXN1bHQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZXM7XHJcbiAgfSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuXHJcbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4vKipcclxuICogQSBjbGFzcyByZXByZXNlbnRpbmcgY2hhdHRlciBBUEkgcmVxdWVzdFxyXG4gKlxyXG4gKiBAcHJvdGVjdGVkXHJcbiAqIEBjbGFzcyBDaGF0dGVyflJlcXVlc3RcclxuICogQGltcGxlbWVudHMge1Byb21pc2UuPENoYXR0ZXJ+UmVxdWVzdFJlc3VsdD59XHJcbiAqIEBwYXJhbSB7Q2hhdHRlcn0gY2hhdHRlciAtIENoYXR0ZXIgQVBJIG9iamVjdFxyXG4gKiBAcGFyYW0ge0NoYXR0ZXJ+UmVxdWVzdFBhcmFtc30gcGFyYW1zIC0gUGFyYW10ZXJzIHJlcHJlc2VudGluZyBIVFRQIHJlcXVlc3RcclxuICovXHJcbnZhciBSZXF1ZXN0ID0gZnVuY3Rpb24oY2hhdHRlciwgcGFyYW1zKSB7XHJcbiAgdGhpcy5fY2hhdHRlciA9IGNoYXR0ZXI7XHJcbiAgdGhpcy5fcGFyYW1zID0gcGFyYW1zO1xyXG4gIHRoaXMuX3Byb21pc2UgPSBudWxsO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IENoYXR0ZXJ+QmF0Y2hSZXF1ZXN0UGFyYW1zXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG1ldGhvZCAtIEhUVFAgbWV0aG9kXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVybCAtIFJlc291cmNlIFVSTFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBbcmljaElucHV0XSAtIEhUVFAgYm9keSAoaW4gUE9TVC9QVVQvUEFUQ0ggbWV0aG9kcylcclxuICovXHJcblxyXG4vKipcclxuICogUmV0cmlldmUgcGFyYW1ldGVycyBpbiBiYXRjaCByZXF1ZXN0IGZvcm1cclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlcXVlc3QjYmF0Y2hQYXJhbXNcclxuICogQHJldHVybnMge0NoYXR0ZXJ+QmF0Y2hSZXF1ZXN0UGFyYW1zfVxyXG4gKi9cclxuUmVxdWVzdC5wcm90b3R5cGUuYmF0Y2hQYXJhbXMgPSBmdW5jdGlvbigpIHtcclxuICB2YXIgcGFyYW1zID0gdGhpcy5fcGFyYW1zO1xyXG4gIHZhciBiYXRjaFBhcmFtcyA9IHtcclxuICAgIG1ldGhvZDogcGFyYW1zLm1ldGhvZCxcclxuICAgIHVybDogdGhpcy5fY2hhdHRlci5fbm9ybWFsaXplVXJsKHBhcmFtcy51cmwpXHJcbiAgfTtcclxuICBpZiAodGhpcy5fcGFyYW1zLmJvZHkpIHtcclxuICAgIGJhdGNoUGFyYW1zLnJpY2hJbnB1dCA9IHRoaXMuX3BhcmFtcy5ib2R5O1xyXG4gIH1cclxuICByZXR1cm4gYmF0Y2hQYXJhbXM7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0cmlldmUgcGFyYW1ldGVycyBpbiBiYXRjaCByZXF1ZXN0IGZvcm1cclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlcXVlc3QjcHJvbWlzZVxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48Q2hhdHRlcn5SZXF1ZXN0UmVzdWx0Pn1cclxuICovXHJcblJlcXVlc3QucHJvdG90eXBlLnByb21pc2UgPSBmdW5jdGlvbigpIHtcclxuICByZXR1cm4gdGhpcy5fcHJvbWlzZSB8fCB0aGlzLl9jaGF0dGVyLl9yZXF1ZXN0KHRoaXMuX3BhcmFtcyk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyBOb2RlLmpzIFN0cmVhbSBvYmplY3QgZm9yIHJlcXVlc3RcclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlcXVlc3Qjc3RyZWFtXHJcbiAqIEByZXR1cm5zIHtzdHJlYW0uU3RyZWFtfVxyXG4gKi9cclxuUmVxdWVzdC5wcm90b3R5cGUuc3RyZWFtID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2NoYXR0ZXIuX3JlcXVlc3QodGhpcy5fcGFyYW1zKS5zdHJlYW0oKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9taXNlL0ErIGludGVyZmFjZVxyXG4gKiBodHRwOi8vcHJvbWlzZXMtYXBsdXMuZ2l0aHViLmlvL3Byb21pc2VzLXNwZWMvXHJcbiAqXHJcbiAqIERlbGVnYXRlIHRvIGRlZmVycmVkIHByb21pc2UsIHJldHVybiBwcm9taXNlIGluc3RhbmNlIGZvciBiYXRjaCByZXN1bHRcclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlcXVlc3QjdGhlblxyXG4gKi9cclxuUmVxdWVzdC5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uKG9uUmVzb2x2ZSwgb25SZWplY3QpIHtcclxuICByZXR1cm4gdGhpcy5wcm9taXNlKCkudGhlbihvblJlc29sdmUsIG9uUmVqZWN0KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9taXNlL0ErIGV4dGVuc2lvblxyXG4gKiBDYWxsIFwidGhlblwiIHVzaW5nIGdpdmVuIG5vZGUtc3R5bGUgY2FsbGJhY2sgZnVuY3Rpb25cclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlcXVlc3QjdGhlbkNhbGxcclxuICovXHJcblJlcXVlc3QucHJvdG90eXBlLnRoZW5DYWxsID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICByZXR1cm4gXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSA/IHRoaXMucHJvbWlzZSgpLnRoZW5DYWxsKGNhbGxiYWNrKSA6IHRoaXM7XHJcbn07XHJcblxyXG5cclxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbi8qKlxyXG4gKiBBIGNsYXNzIHJlcHJlc2VudGluZyBjaGF0dGVyIEFQSSByZXNvdXJjZVxyXG4gKlxyXG4gKiBAcHJvdGVjdGVkXHJcbiAqIEBjbGFzcyBDaGF0dGVyflJlc291cmNlXHJcbiAqIEBleHRlbmRzIENoYXR0ZXJ+UmVxdWVzdFxyXG4gKiBAcGFyYW0ge0NoYXR0ZXJ9IGNoYXR0ZXIgLSBDaGF0dGVyIEFQSSBvYmplY3RcclxuICogQHBhcmFtIHtTdHJpbmd9IHVybCAtIFJlc291cmNlIFVSTFxyXG4gKiBAcGFyYW0ge09iamVjdH0gW3F1ZXJ5UGFyYW1zXSAtIFF1ZXJ5IHBhcmFtZXRlcnMgKGluIGhhc2ggb2JqZWN0KVxyXG4gKi9cclxudmFyIFJlc291cmNlID0gZnVuY3Rpb24oY2hhdHRlciwgdXJsLCBxdWVyeVBhcmFtcykge1xyXG4gIGlmIChxdWVyeVBhcmFtcykge1xyXG4gICAgdmFyIHFzdHJpbmcgPSBfLm1hcChfLmtleXMocXVlcnlQYXJhbXMpLCBmdW5jdGlvbihuYW1lKSB7XHJcbiAgICAgIHJldHVybiBuYW1lICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQocXVlcnlQYXJhbXNbbmFtZV0pO1xyXG4gICAgfSkuam9pbignJicpO1xyXG4gICAgdXJsICs9ICh1cmwuaW5kZXhPZignPycpID4gMCA/ICcmJyA6ICc/JykgKyBxc3RyaW5nO1xyXG4gIH1cclxuICBSZXNvdXJjZS5zdXBlcl8uY2FsbCh0aGlzLCBjaGF0dGVyLCB7IG1ldGhvZDogJ0dFVCcsIHVybDogdXJsIH0pO1xyXG4gIHRoaXMuX3VybCA9IHVybDtcclxufTtcclxuXHJcbmluaGVyaXRzKFJlc291cmNlLCBSZXF1ZXN0KTtcclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgYSBuZXcgcmVzb3VyY2VcclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlc291cmNlI2NyZWF0ZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSAtIERhdGEgdG8gbmV3bHkgcG9zdFxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxDaGF0dGVyflJlcXVlc3RSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge0NoYXR0ZXJ+UmVxdWVzdH1cclxuICovXHJcblJlc291cmNlLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9jaGF0dGVyLnJlcXVlc3Qoe1xyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICB1cmw6IHRoaXMuX3VybCxcclxuICAgIGJvZHk6IGRhdGFcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0cmlldmUgcmVzb3VyY2UgY29udGVudFxyXG4gKlxyXG4gKiBAbWV0aG9kIENoYXR0ZXJ+UmVzb3VyY2UjcmV0cmlldmVcclxuICogQHBhcmFtIHtDYWxsYmFjay48Q2hhdHRlcn5SZXF1ZXN0UmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtDaGF0dGVyflJlcXVlc3R9XHJcbiAqL1xyXG5SZXNvdXJjZS5wcm90b3R5cGUucmV0cmlldmUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBVcGRhdGUgc3BlY2lmaWVkIHJlc291cmNlXHJcbiAqXHJcbiAqIEBtZXRob2QgQ2hhdHRlcn5SZXNvdXJjZSN1cGRhdGVcclxuICogQHBhcmFtIHtPYmVqY3R9IGRhdGEgLSBEYXRhIHRvIHVwZGF0ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxDaGF0dGVyflJlcXVlc3RSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge0NoYXR0ZXJ+UmVxdWVzdH1cclxuICovXHJcblJlc291cmNlLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9jaGF0dGVyLnJlcXVlc3Qoe1xyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICB1cmw6IHRoaXMuX3VybCxcclxuICAgIGJvZHk6IGRhdGFcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogU3lub255bSBvZiBSZXNvdXJjZSNkZWxldGUoKVxyXG4gKlxyXG4gKiBAbWV0aG9kIENoYXR0ZXJ+UmVzb3VyY2UjZGVsXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPENoYXR0ZXJ+UmVxdWVzdFJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7Q2hhdHRlcn5SZXF1ZXN0fVxyXG4gKi9cclxuLyoqXHJcbiAqIERlbGV0ZSBzcGVjaWZpZWQgcmVzb3VyY2VcclxuICpcclxuICogQG1ldGhvZCBDaGF0dGVyflJlc291cmNlI2RlbGV0ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxDaGF0dGVyflJlcXVlc3RSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge0NoYXR0ZXJ+UmVxdWVzdH1cclxuICovXHJcblJlc291cmNlLnByb3RvdHlwZS5kZWwgPVxyXG5SZXNvdXJjZS5wcm90b3R5cGVbXCJkZWxldGVcIl0gPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9jaGF0dGVyLnJlcXVlc3Qoe1xyXG4gICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgIHVybDogdGhpcy5fdXJsXHJcbiAgfSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuXHJcbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG4vKlxyXG4gKiBSZWdpc3RlciBob29rIGluIGNvbm5lY3Rpb24gaW5zdGFudGlhdGlvbiBmb3IgZHluYW1pY2FsbHkgYWRkaW5nIHRoaXMgQVBJIG1vZHVsZSBmZWF0dXJlc1xyXG4gKi9cclxuanNmb3JjZS5vbignY29ubmVjdGlvbjpuZXcnLCBmdW5jdGlvbihjb25uKSB7XHJcbiAgY29ubi5jaGF0dGVyID0gbmV3IENoYXR0ZXIoY29ubik7XHJcbn0pO1xyXG4iXX0=
