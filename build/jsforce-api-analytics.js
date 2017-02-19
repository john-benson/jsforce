(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Analytics = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Salesforce Analytics API
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var isFunction = require('lodash/isFunction'),
    jsforce = window.jsforce.require('./core'),
    Promise  = window.jsforce.require('./promise');

/**
 * Report instance to retrieving asynchronously executed result
 *
 * @protected
 * @class Analytics~ReportInstance
 * @param {Analytics~Report} report - Report
 * @param {String} id - Report instance id
 */
var ReportInstance = function(report, id) {
  this._report = report;
  this._conn = report._conn;
  this.id = id;
};

/**
 * Retrieve report result asynchronously executed
 *
 * @method Analytics~ReportInstance#retrieve
 * @param {Callback.<Analytics~ReportResult>} [callback] - Callback function
 * @returns {Promise.<Analytics~ReportResult>}
 */
ReportInstance.prototype.retrieve = function(callback) {
  var conn = this._conn,
      report = this._report;
  var url = [ conn._baseUrl(), "analytics", "reports", report.id, "instances", this.id ].join('/');
  return conn.request(url).thenCall(callback);
};

/**
 * Report object in Analytics API
 *
 * @protected
 * @class Analytics~Report
 * @param {Connection} conn Connection
 */
var Report = function(conn, id) {
  this._conn = conn;
  this.id = id;
};

/**
 * Describe report metadata
 *
 * @method Analytics~Report#describe
 * @param {Callback.<Analytics~ReportMetadata>} [callback] - Callback function
 * @returns {Promise.<Analytics~ReportMetadata>}
 */
Report.prototype.describe = function(callback) {
  var url = [ this._conn._baseUrl(), "analytics", "reports", this.id, "describe" ].join('/');
  return this._conn.request(url).thenCall(callback);
};

/**
 * Explain plan for executing report
 *
 * @method Analytics~Report#explain
 * @param {Callback.<ExplainInfo>} [callback] - Callback function
 * @returns {Promise.<ExplainInfo>}
 */
Report.prototype.explain = function(callback) {
  var url = "/query/?explain=" + this.id;
  return this._conn.request(url).thenCall(callback);
};


/**
 * Run report synchronously
 *
 * @method Analytics~Report#execute
 * @param {Object} [options] - Options
 * @param {Boolean} options.details - Flag if include detail in result
 * @param {Analytics~ReportMetadata} options.metadata - Overriding report metadata
 * @param {Callback.<Analytics~ReportResult>} [callback] - Callback function
 * @returns {Promise.<Analytics~ReportResult>}
 */
Report.prototype.run =
Report.prototype.exec =
Report.prototype.execute = function(options, callback) {
  options = options || {};
  if (isFunction(options)) {
    callback = options;
    options = {};
  }
  var url = [ this._conn._baseUrl(), "analytics", "reports", this.id ].join('/');
  url += "?includeDetails=" + (options.details ? "true" : "false");
  var params = { method : options.metadata ? 'POST' : 'GET', url : url };
  if (options.metadata) {
    params.headers = { "Content-Type" : "application/json" };
    params.body = JSON.stringify(options.metadata);
  }
  return this._conn.request(params).thenCall(callback);
};


/**
 * Run report asynchronously
 *
 * @method Analytics~Report#executeAsync
 * @param {Object} [options] - Options
 * @param {Boolean} options.details - Flag if include detail in result
 * @param {Analytics~ReportMetadata} options.metadata - Overriding report metadata
 * @param {Callback.<Analytics~ReportInstanceAttrs>} [callback] - Callback function
 * @returns {Promise.<Analytics~ReportInstanceAttrs>}
 */
Report.prototype.executeAsync = function(options, callback) {
  options = options || {};
  if (isFunction(options)) {
    callback = options;
    options = {};
  }
  var url = [ this._conn._baseUrl(), "analytics", "reports", this.id, "instances" ].join('/');
  if (options.details) {
    url += "?includeDetails=true";
  }
  var params = { method : 'POST', url : url, body: "" };
  if (options.metadata) {
    params.headers = { "Content-Type" : "application/json" };
    params.body = JSON.stringify(options.metadata);
  }
  return this._conn.request(params).thenCall(callback);
};

/**
 * Get report instance for specified instance ID
 *
 * @method Analytics~Report#instance
 * @param {String} id - Report instance ID
 * @returns {Analytics~ReportInstance}
 */
Report.prototype.instance = function(id) {
  return new ReportInstance(this, id);
};

/**
 * List report instances which had been executed asynchronously
 *
 * @method Analytics~Report#instances
 * @param {Callback.<Array.<Analytics~ReportInstanceAttrs>>} [callback] - Callback function
 * @returns {Promise.<Array.<Analytics~ReportInstanceAttrs>>}
 */
Report.prototype.instances = function(callback) {
  var url = [ this._conn._baseUrl(), "analytics", "reports", this.id, "instances" ].join('/');
  return this._conn.request(url).thenCall(callback);
};


/**
 * API class for Analytics API
 *
 * @class
 * @param {Connection} conn Connection
 */
var Analytics = function(conn) {
  this._conn = conn;
};

/**
 * Get report object of Analytics API
 *
 * @param {String} id - Report Id
 * @returns {Analytics~Report}
 */
Analytics.prototype.report = function(id) {
  return new Report(this._conn, id);
};

/**
 * Get recent report list
 *
 * @param {Callback.<Array.<Analytics~ReportInfo>>} [callback] - Callback function
 * @returns {Promise.<Array.<Analytics~ReportInfo>>}
 */
Analytics.prototype.reports = function(callback) {
  var url = [ this._conn._baseUrl(), "analytics", "reports" ].join('/');
  return this._conn.request(url).thenCall(callback);
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.analytics = new Analytics(conn);
});


module.exports = Analytics;

},{"lodash/isFunction":2}],2:[function(require,module,exports){
var isObject = require('./isObject');

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified,
 *  else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8 which returns 'object' for typed array and weak map constructors,
  // and PhantomJS 1.9 which returns 'function' for `NodeList` instances.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

module.exports = isFunction;

},{"./isObject":3}],3:[function(require,module,exports){
/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/6.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL2FuYWx5dGljcy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gvaXNGdW5jdGlvbi5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gvaXNPYmplY3QuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxyXG4gKiBAZmlsZSBNYW5hZ2VzIFNhbGVzZm9yY2UgQW5hbHl0aWNzIEFQSVxyXG4gKiBAYXV0aG9yIFNoaW5pY2hpIFRvbWl0YSA8c2hpbmljaGkudG9taXRhQGdtYWlsLmNvbT5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2xvZGFzaC9pc0Z1bmN0aW9uJyksXHJcbiAgICBqc2ZvcmNlID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9jb3JlJyksXHJcbiAgICBQcm9taXNlICA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJy4vcHJvbWlzZScpO1xyXG5cclxuLyoqXHJcbiAqIFJlcG9ydCBpbnN0YW5jZSB0byByZXRyaWV2aW5nIGFzeW5jaHJvbm91c2x5IGV4ZWN1dGVkIHJlc3VsdFxyXG4gKlxyXG4gKiBAcHJvdGVjdGVkXHJcbiAqIEBjbGFzcyBBbmFseXRpY3N+UmVwb3J0SW5zdGFuY2VcclxuICogQHBhcmFtIHtBbmFseXRpY3N+UmVwb3J0fSByZXBvcnQgLSBSZXBvcnRcclxuICogQHBhcmFtIHtTdHJpbmd9IGlkIC0gUmVwb3J0IGluc3RhbmNlIGlkXHJcbiAqL1xyXG52YXIgUmVwb3J0SW5zdGFuY2UgPSBmdW5jdGlvbihyZXBvcnQsIGlkKSB7XHJcbiAgdGhpcy5fcmVwb3J0ID0gcmVwb3J0O1xyXG4gIHRoaXMuX2Nvbm4gPSByZXBvcnQuX2Nvbm47XHJcbiAgdGhpcy5pZCA9IGlkO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHJpZXZlIHJlcG9ydCByZXN1bHQgYXN5bmNocm9ub3VzbHkgZXhlY3V0ZWRcclxuICpcclxuICogQG1ldGhvZCBBbmFseXRpY3N+UmVwb3J0SW5zdGFuY2UjcmV0cmlldmVcclxuICogQHBhcmFtIHtDYWxsYmFjay48QW5hbHl0aWNzflJlcG9ydFJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QW5hbHl0aWNzflJlcG9ydFJlc3VsdD59XHJcbiAqL1xyXG5SZXBvcnRJbnN0YW5jZS5wcm90b3R5cGUucmV0cmlldmUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHZhciBjb25uID0gdGhpcy5fY29ubixcclxuICAgICAgcmVwb3J0ID0gdGhpcy5fcmVwb3J0O1xyXG4gIHZhciB1cmwgPSBbIGNvbm4uX2Jhc2VVcmwoKSwgXCJhbmFseXRpY3NcIiwgXCJyZXBvcnRzXCIsIHJlcG9ydC5pZCwgXCJpbnN0YW5jZXNcIiwgdGhpcy5pZCBdLmpvaW4oJy8nKTtcclxuICByZXR1cm4gY29ubi5yZXF1ZXN0KHVybCkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlcG9ydCBvYmplY3QgaW4gQW5hbHl0aWNzIEFQSVxyXG4gKlxyXG4gKiBAcHJvdGVjdGVkXHJcbiAqIEBjbGFzcyBBbmFseXRpY3N+UmVwb3J0XHJcbiAqIEBwYXJhbSB7Q29ubmVjdGlvbn0gY29ubiBDb25uZWN0aW9uXHJcbiAqL1xyXG52YXIgUmVwb3J0ID0gZnVuY3Rpb24oY29ubiwgaWQpIHtcclxuICB0aGlzLl9jb25uID0gY29ubjtcclxuICB0aGlzLmlkID0gaWQ7XHJcbn07XHJcblxyXG4vKipcclxuICogRGVzY3JpYmUgcmVwb3J0IG1ldGFkYXRhXHJcbiAqXHJcbiAqIEBtZXRob2QgQW5hbHl0aWNzflJlcG9ydCNkZXNjcmliZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxBbmFseXRpY3N+UmVwb3J0TWV0YWRhdGE+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFuYWx5dGljc35SZXBvcnRNZXRhZGF0YT59XHJcbiAqL1xyXG5SZXBvcnQucHJvdG90eXBlLmRlc2NyaWJlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICB2YXIgdXJsID0gWyB0aGlzLl9jb25uLl9iYXNlVXJsKCksIFwiYW5hbHl0aWNzXCIsIFwicmVwb3J0c1wiLCB0aGlzLmlkLCBcImRlc2NyaWJlXCIgXS5qb2luKCcvJyk7XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4ucmVxdWVzdCh1cmwpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeHBsYWluIHBsYW4gZm9yIGV4ZWN1dGluZyByZXBvcnRcclxuICpcclxuICogQG1ldGhvZCBBbmFseXRpY3N+UmVwb3J0I2V4cGxhaW5cclxuICogQHBhcmFtIHtDYWxsYmFjay48RXhwbGFpbkluZm8+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEV4cGxhaW5JbmZvPn1cclxuICovXHJcblJlcG9ydC5wcm90b3R5cGUuZXhwbGFpbiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcbiAgdmFyIHVybCA9IFwiL3F1ZXJ5Lz9leHBsYWluPVwiICsgdGhpcy5pZDtcclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHVybCkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBSdW4gcmVwb3J0IHN5bmNocm9ub3VzbHlcclxuICpcclxuICogQG1ldGhvZCBBbmFseXRpY3N+UmVwb3J0I2V4ZWN1dGVcclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSAtIE9wdGlvbnNcclxuICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLmRldGFpbHMgLSBGbGFnIGlmIGluY2x1ZGUgZGV0YWlsIGluIHJlc3VsdFxyXG4gKiBAcGFyYW0ge0FuYWx5dGljc35SZXBvcnRNZXRhZGF0YX0gb3B0aW9ucy5tZXRhZGF0YSAtIE92ZXJyaWRpbmcgcmVwb3J0IG1ldGFkYXRhXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPEFuYWx5dGljc35SZXBvcnRSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFuYWx5dGljc35SZXBvcnRSZXN1bHQ+fVxyXG4gKi9cclxuUmVwb3J0LnByb3RvdHlwZS5ydW4gPVxyXG5SZXBvcnQucHJvdG90eXBlLmV4ZWMgPVxyXG5SZXBvcnQucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG4gIGlmIChpc0Z1bmN0aW9uKG9wdGlvbnMpKSB7XHJcbiAgICBjYWxsYmFjayA9IG9wdGlvbnM7XHJcbiAgICBvcHRpb25zID0ge307XHJcbiAgfVxyXG4gIHZhciB1cmwgPSBbIHRoaXMuX2Nvbm4uX2Jhc2VVcmwoKSwgXCJhbmFseXRpY3NcIiwgXCJyZXBvcnRzXCIsIHRoaXMuaWQgXS5qb2luKCcvJyk7XHJcbiAgdXJsICs9IFwiP2luY2x1ZGVEZXRhaWxzPVwiICsgKG9wdGlvbnMuZGV0YWlscyA/IFwidHJ1ZVwiIDogXCJmYWxzZVwiKTtcclxuICB2YXIgcGFyYW1zID0geyBtZXRob2QgOiBvcHRpb25zLm1ldGFkYXRhID8gJ1BPU1QnIDogJ0dFVCcsIHVybCA6IHVybCB9O1xyXG4gIGlmIChvcHRpb25zLm1ldGFkYXRhKSB7XHJcbiAgICBwYXJhbXMuaGVhZGVycyA9IHsgXCJDb250ZW50LVR5cGVcIiA6IFwiYXBwbGljYXRpb24vanNvblwiIH07XHJcbiAgICBwYXJhbXMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMubWV0YWRhdGEpO1xyXG4gIH1cclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHBhcmFtcykudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBSdW4gcmVwb3J0IGFzeW5jaHJvbm91c2x5XHJcbiAqXHJcbiAqIEBtZXRob2QgQW5hbHl0aWNzflJlcG9ydCNleGVjdXRlQXN5bmNcclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSAtIE9wdGlvbnNcclxuICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLmRldGFpbHMgLSBGbGFnIGlmIGluY2x1ZGUgZGV0YWlsIGluIHJlc3VsdFxyXG4gKiBAcGFyYW0ge0FuYWx5dGljc35SZXBvcnRNZXRhZGF0YX0gb3B0aW9ucy5tZXRhZGF0YSAtIE92ZXJyaWRpbmcgcmVwb3J0IG1ldGFkYXRhXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPEFuYWx5dGljc35SZXBvcnRJbnN0YW5jZUF0dHJzPn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxBbmFseXRpY3N+UmVwb3J0SW5zdGFuY2VBdHRycz59XHJcbiAqL1xyXG5SZXBvcnQucHJvdG90eXBlLmV4ZWN1dGVBc3luYyA9IGZ1bmN0aW9uKG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgaWYgKGlzRnVuY3Rpb24ob3B0aW9ucykpIHtcclxuICAgIGNhbGxiYWNrID0gb3B0aW9ucztcclxuICAgIG9wdGlvbnMgPSB7fTtcclxuICB9XHJcbiAgdmFyIHVybCA9IFsgdGhpcy5fY29ubi5fYmFzZVVybCgpLCBcImFuYWx5dGljc1wiLCBcInJlcG9ydHNcIiwgdGhpcy5pZCwgXCJpbnN0YW5jZXNcIiBdLmpvaW4oJy8nKTtcclxuICBpZiAob3B0aW9ucy5kZXRhaWxzKSB7XHJcbiAgICB1cmwgKz0gXCI/aW5jbHVkZURldGFpbHM9dHJ1ZVwiO1xyXG4gIH1cclxuICB2YXIgcGFyYW1zID0geyBtZXRob2QgOiAnUE9TVCcsIHVybCA6IHVybCwgYm9keTogXCJcIiB9O1xyXG4gIGlmIChvcHRpb25zLm1ldGFkYXRhKSB7XHJcbiAgICBwYXJhbXMuaGVhZGVycyA9IHsgXCJDb250ZW50LVR5cGVcIiA6IFwiYXBwbGljYXRpb24vanNvblwiIH07XHJcbiAgICBwYXJhbXMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMubWV0YWRhdGEpO1xyXG4gIH1cclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHBhcmFtcykudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldCByZXBvcnQgaW5zdGFuY2UgZm9yIHNwZWNpZmllZCBpbnN0YW5jZSBJRFxyXG4gKlxyXG4gKiBAbWV0aG9kIEFuYWx5dGljc35SZXBvcnQjaW5zdGFuY2VcclxuICogQHBhcmFtIHtTdHJpbmd9IGlkIC0gUmVwb3J0IGluc3RhbmNlIElEXHJcbiAqIEByZXR1cm5zIHtBbmFseXRpY3N+UmVwb3J0SW5zdGFuY2V9XHJcbiAqL1xyXG5SZXBvcnQucHJvdG90eXBlLmluc3RhbmNlID0gZnVuY3Rpb24oaWQpIHtcclxuICByZXR1cm4gbmV3IFJlcG9ydEluc3RhbmNlKHRoaXMsIGlkKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBMaXN0IHJlcG9ydCBpbnN0YW5jZXMgd2hpY2ggaGFkIGJlZW4gZXhlY3V0ZWQgYXN5bmNocm9ub3VzbHlcclxuICpcclxuICogQG1ldGhvZCBBbmFseXRpY3N+UmVwb3J0I2luc3RhbmNlc1xyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxBcnJheS48QW5hbHl0aWNzflJlcG9ydEluc3RhbmNlQXR0cnM+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxBcnJheS48QW5hbHl0aWNzflJlcG9ydEluc3RhbmNlQXR0cnM+Pn1cclxuICovXHJcblJlcG9ydC5wcm90b3R5cGUuaW5zdGFuY2VzID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICB2YXIgdXJsID0gWyB0aGlzLl9jb25uLl9iYXNlVXJsKCksIFwiYW5hbHl0aWNzXCIsIFwicmVwb3J0c1wiLCB0aGlzLmlkLCBcImluc3RhbmNlc1wiIF0uam9pbignLycpO1xyXG4gIHJldHVybiB0aGlzLl9jb25uLnJlcXVlc3QodXJsKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIEFQSSBjbGFzcyBmb3IgQW5hbHl0aWNzIEFQSVxyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIENvbm5lY3Rpb25cclxuICovXHJcbnZhciBBbmFseXRpY3MgPSBmdW5jdGlvbihjb25uKSB7XHJcbiAgdGhpcy5fY29ubiA9IGNvbm47XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0IHJlcG9ydCBvYmplY3Qgb2YgQW5hbHl0aWNzIEFQSVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaWQgLSBSZXBvcnQgSWRcclxuICogQHJldHVybnMge0FuYWx5dGljc35SZXBvcnR9XHJcbiAqL1xyXG5BbmFseXRpY3MucHJvdG90eXBlLnJlcG9ydCA9IGZ1bmN0aW9uKGlkKSB7XHJcbiAgcmV0dXJuIG5ldyBSZXBvcnQodGhpcy5fY29ubiwgaWQpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldCByZWNlbnQgcmVwb3J0IGxpc3RcclxuICpcclxuICogQHBhcmFtIHtDYWxsYmFjay48QXJyYXkuPEFuYWx5dGljc35SZXBvcnRJbmZvPj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QXJyYXkuPEFuYWx5dGljc35SZXBvcnRJbmZvPj59XHJcbiAqL1xyXG5BbmFseXRpY3MucHJvdG90eXBlLnJlcG9ydHMgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHZhciB1cmwgPSBbIHRoaXMuX2Nvbm4uX2Jhc2VVcmwoKSwgXCJhbmFseXRpY3NcIiwgXCJyZXBvcnRzXCIgXS5qb2luKCcvJyk7XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4ucmVxdWVzdCh1cmwpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLypcclxuICogUmVnaXN0ZXIgaG9vayBpbiBjb25uZWN0aW9uIGluc3RhbnRpYXRpb24gZm9yIGR5bmFtaWNhbGx5IGFkZGluZyB0aGlzIEFQSSBtb2R1bGUgZmVhdHVyZXNcclxuICovXHJcbmpzZm9yY2Uub24oJ2Nvbm5lY3Rpb246bmV3JywgZnVuY3Rpb24oY29ubikge1xyXG4gIGNvbm4uYW5hbHl0aWNzID0gbmV3IEFuYWx5dGljcyhjb25uKTtcclxufSk7XHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBbmFseXRpY3M7XHJcbiIsInZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNUYWcgPSAnW29iamVjdCBGdW5jdGlvbl0nLFxuICAgIGdlblRhZyA9ICdbb2JqZWN0IEdlbmVyYXRvckZ1bmN0aW9uXSc7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZVxuICogW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSBgRnVuY3Rpb25gIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDAuMS4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGdW5jdGlvbihfKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oL2FiYy8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICAvLyBUaGUgdXNlIG9mIGBPYmplY3QjdG9TdHJpbmdgIGF2b2lkcyBpc3N1ZXMgd2l0aCB0aGUgYHR5cGVvZmAgb3BlcmF0b3JcbiAgLy8gaW4gU2FmYXJpIDggd2hpY2ggcmV0dXJucyAnb2JqZWN0JyBmb3IgdHlwZWQgYXJyYXkgYW5kIHdlYWsgbWFwIGNvbnN0cnVjdG9ycyxcbiAgLy8gYW5kIFBoYW50b21KUyAxLjkgd2hpY2ggcmV0dXJucyAnZnVuY3Rpb24nIGZvciBgTm9kZUxpc3RgIGluc3RhbmNlcy5cbiAgdmFyIHRhZyA9IGlzT2JqZWN0KHZhbHVlKSA/IG9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpIDogJyc7XG4gIHJldHVybiB0YWcgPT0gZnVuY1RhZyB8fCB0YWcgPT0gZ2VuVGFnO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzRnVuY3Rpb247XG4iLCIvKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZVxuICogW2xhbmd1YWdlIHR5cGVdKGh0dHA6Ly93d3cuZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1lY21hc2NyaXB0LWxhbmd1YWdlLXR5cGVzKVxuICogb2YgYE9iamVjdGAuIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMC4xLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0KHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChfLm5vb3ApO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QobnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgcmV0dXJuICEhdmFsdWUgJiYgKHR5cGUgPT0gJ29iamVjdCcgfHwgdHlwZSA9PSAnZnVuY3Rpb24nKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc09iamVjdDtcbiJdfQ==
