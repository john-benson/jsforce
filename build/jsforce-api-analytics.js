(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Analytics = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Salesforce Analytics API
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var _ = window.jsforce.require('lodash/core'),
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
  if (_.isFunction(options)) {
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
  if (_.isFunction(options)) {
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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL2FuYWx5dGljcy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXHJcbiAqIEBmaWxlIE1hbmFnZXMgU2FsZXNmb3JjZSBBbmFseXRpY3MgQVBJXHJcbiAqIEBhdXRob3IgU2hpbmljaGkgVG9taXRhIDxzaGluaWNoaS50b21pdGFAZ21haWwuY29tPlxyXG4gKi9cclxuXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBfID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnbG9kYXNoL2NvcmUnKSxcclxuICAgIGpzZm9yY2UgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCcuL2NvcmUnKSxcclxuICAgIFByb21pc2UgID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9wcm9taXNlJyk7XHJcblxyXG4vKipcclxuICogUmVwb3J0IGluc3RhbmNlIHRvIHJldHJpZXZpbmcgYXN5bmNocm9ub3VzbHkgZXhlY3V0ZWQgcmVzdWx0XHJcbiAqXHJcbiAqIEBwcm90ZWN0ZWRcclxuICogQGNsYXNzIEFuYWx5dGljc35SZXBvcnRJbnN0YW5jZVxyXG4gKiBAcGFyYW0ge0FuYWx5dGljc35SZXBvcnR9IHJlcG9ydCAtIFJlcG9ydFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaWQgLSBSZXBvcnQgaW5zdGFuY2UgaWRcclxuICovXHJcbnZhciBSZXBvcnRJbnN0YW5jZSA9IGZ1bmN0aW9uKHJlcG9ydCwgaWQpIHtcclxuICB0aGlzLl9yZXBvcnQgPSByZXBvcnQ7XHJcbiAgdGhpcy5fY29ubiA9IHJlcG9ydC5fY29ubjtcclxuICB0aGlzLmlkID0gaWQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0cmlldmUgcmVwb3J0IHJlc3VsdCBhc3luY2hyb25vdXNseSBleGVjdXRlZFxyXG4gKlxyXG4gKiBAbWV0aG9kIEFuYWx5dGljc35SZXBvcnRJbnN0YW5jZSNyZXRyaWV2ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxBbmFseXRpY3N+UmVwb3J0UmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxBbmFseXRpY3N+UmVwb3J0UmVzdWx0Pn1cclxuICovXHJcblJlcG9ydEluc3RhbmNlLnByb3RvdHlwZS5yZXRyaWV2ZSA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcbiAgdmFyIGNvbm4gPSB0aGlzLl9jb25uLFxyXG4gICAgICByZXBvcnQgPSB0aGlzLl9yZXBvcnQ7XHJcbiAgdmFyIHVybCA9IFsgY29ubi5fYmFzZVVybCgpLCBcImFuYWx5dGljc1wiLCBcInJlcG9ydHNcIiwgcmVwb3J0LmlkLCBcImluc3RhbmNlc1wiLCB0aGlzLmlkIF0uam9pbignLycpO1xyXG4gIHJldHVybiBjb25uLnJlcXVlc3QodXJsKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogUmVwb3J0IG9iamVjdCBpbiBBbmFseXRpY3MgQVBJXHJcbiAqXHJcbiAqIEBwcm90ZWN0ZWRcclxuICogQGNsYXNzIEFuYWx5dGljc35SZXBvcnRcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIENvbm5lY3Rpb25cclxuICovXHJcbnZhciBSZXBvcnQgPSBmdW5jdGlvbihjb25uLCBpZCkge1xyXG4gIHRoaXMuX2Nvbm4gPSBjb25uO1xyXG4gIHRoaXMuaWQgPSBpZDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBEZXNjcmliZSByZXBvcnQgbWV0YWRhdGFcclxuICpcclxuICogQG1ldGhvZCBBbmFseXRpY3N+UmVwb3J0I2Rlc2NyaWJlXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPEFuYWx5dGljc35SZXBvcnRNZXRhZGF0YT59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QW5hbHl0aWNzflJlcG9ydE1ldGFkYXRhPn1cclxuICovXHJcblJlcG9ydC5wcm90b3R5cGUuZGVzY3JpYmUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHZhciB1cmwgPSBbIHRoaXMuX2Nvbm4uX2Jhc2VVcmwoKSwgXCJhbmFseXRpY3NcIiwgXCJyZXBvcnRzXCIsIHRoaXMuaWQsIFwiZGVzY3JpYmVcIiBdLmpvaW4oJy8nKTtcclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHVybCkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4cGxhaW4gcGxhbiBmb3IgZXhlY3V0aW5nIHJlcG9ydFxyXG4gKlxyXG4gKiBAbWV0aG9kIEFuYWx5dGljc35SZXBvcnQjZXhwbGFpblxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxFeHBsYWluSW5mbz59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48RXhwbGFpbkluZm8+fVxyXG4gKi9cclxuUmVwb3J0LnByb3RvdHlwZS5leHBsYWluID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICB2YXIgdXJsID0gXCIvcXVlcnkvP2V4cGxhaW49XCIgKyB0aGlzLmlkO1xyXG4gIHJldHVybiB0aGlzLl9jb25uLnJlcXVlc3QodXJsKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIFJ1biByZXBvcnQgc3luY2hyb25vdXNseVxyXG4gKlxyXG4gKiBAbWV0aG9kIEFuYWx5dGljc35SZXBvcnQjZXhlY3V0ZVxyXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIC0gT3B0aW9uc1xyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMuZGV0YWlscyAtIEZsYWcgaWYgaW5jbHVkZSBkZXRhaWwgaW4gcmVzdWx0XHJcbiAqIEBwYXJhbSB7QW5hbHl0aWNzflJlcG9ydE1ldGFkYXRhfSBvcHRpb25zLm1ldGFkYXRhIC0gT3ZlcnJpZGluZyByZXBvcnQgbWV0YWRhdGFcclxuICogQHBhcmFtIHtDYWxsYmFjay48QW5hbHl0aWNzflJlcG9ydFJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QW5hbHl0aWNzflJlcG9ydFJlc3VsdD59XHJcbiAqL1xyXG5SZXBvcnQucHJvdG90eXBlLnJ1biA9XHJcblJlcG9ydC5wcm90b3R5cGUuZXhlYyA9XHJcblJlcG9ydC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uKG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgaWYgKF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xyXG4gICAgY2FsbGJhY2sgPSBvcHRpb25zO1xyXG4gICAgb3B0aW9ucyA9IHt9O1xyXG4gIH1cclxuICB2YXIgdXJsID0gWyB0aGlzLl9jb25uLl9iYXNlVXJsKCksIFwiYW5hbHl0aWNzXCIsIFwicmVwb3J0c1wiLCB0aGlzLmlkIF0uam9pbignLycpO1xyXG4gIHVybCArPSBcIj9pbmNsdWRlRGV0YWlscz1cIiArIChvcHRpb25zLmRldGFpbHMgPyBcInRydWVcIiA6IFwiZmFsc2VcIik7XHJcbiAgdmFyIHBhcmFtcyA9IHsgbWV0aG9kIDogb3B0aW9ucy5tZXRhZGF0YSA/ICdQT1NUJyA6ICdHRVQnLCB1cmwgOiB1cmwgfTtcclxuICBpZiAob3B0aW9ucy5tZXRhZGF0YSkge1xyXG4gICAgcGFyYW1zLmhlYWRlcnMgPSB7IFwiQ29udGVudC1UeXBlXCIgOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9O1xyXG4gICAgcGFyYW1zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLm1ldGFkYXRhKTtcclxuICB9XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4ucmVxdWVzdChwYXJhbXMpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKipcclxuICogUnVuIHJlcG9ydCBhc3luY2hyb25vdXNseVxyXG4gKlxyXG4gKiBAbWV0aG9kIEFuYWx5dGljc35SZXBvcnQjZXhlY3V0ZUFzeW5jXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gLSBPcHRpb25zXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5kZXRhaWxzIC0gRmxhZyBpZiBpbmNsdWRlIGRldGFpbCBpbiByZXN1bHRcclxuICogQHBhcmFtIHtBbmFseXRpY3N+UmVwb3J0TWV0YWRhdGF9IG9wdGlvbnMubWV0YWRhdGEgLSBPdmVycmlkaW5nIHJlcG9ydCBtZXRhZGF0YVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxBbmFseXRpY3N+UmVwb3J0SW5zdGFuY2VBdHRycz59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QW5hbHl0aWNzflJlcG9ydEluc3RhbmNlQXR0cnM+fVxyXG4gKi9cclxuUmVwb3J0LnByb3RvdHlwZS5leGVjdXRlQXN5bmMgPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG4gIGlmIChfLmlzRnVuY3Rpb24ob3B0aW9ucykpIHtcclxuICAgIGNhbGxiYWNrID0gb3B0aW9ucztcclxuICAgIG9wdGlvbnMgPSB7fTtcclxuICB9XHJcbiAgdmFyIHVybCA9IFsgdGhpcy5fY29ubi5fYmFzZVVybCgpLCBcImFuYWx5dGljc1wiLCBcInJlcG9ydHNcIiwgdGhpcy5pZCwgXCJpbnN0YW5jZXNcIiBdLmpvaW4oJy8nKTtcclxuICBpZiAob3B0aW9ucy5kZXRhaWxzKSB7XHJcbiAgICB1cmwgKz0gXCI/aW5jbHVkZURldGFpbHM9dHJ1ZVwiO1xyXG4gIH1cclxuICB2YXIgcGFyYW1zID0geyBtZXRob2QgOiAnUE9TVCcsIHVybCA6IHVybCwgYm9keTogXCJcIiB9O1xyXG4gIGlmIChvcHRpb25zLm1ldGFkYXRhKSB7XHJcbiAgICBwYXJhbXMuaGVhZGVycyA9IHsgXCJDb250ZW50LVR5cGVcIiA6IFwiYXBwbGljYXRpb24vanNvblwiIH07XHJcbiAgICBwYXJhbXMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMubWV0YWRhdGEpO1xyXG4gIH1cclxuICByZXR1cm4gdGhpcy5fY29ubi5yZXF1ZXN0KHBhcmFtcykudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldCByZXBvcnQgaW5zdGFuY2UgZm9yIHNwZWNpZmllZCBpbnN0YW5jZSBJRFxyXG4gKlxyXG4gKiBAbWV0aG9kIEFuYWx5dGljc35SZXBvcnQjaW5zdGFuY2VcclxuICogQHBhcmFtIHtTdHJpbmd9IGlkIC0gUmVwb3J0IGluc3RhbmNlIElEXHJcbiAqIEByZXR1cm5zIHtBbmFseXRpY3N+UmVwb3J0SW5zdGFuY2V9XHJcbiAqL1xyXG5SZXBvcnQucHJvdG90eXBlLmluc3RhbmNlID0gZnVuY3Rpb24oaWQpIHtcclxuICByZXR1cm4gbmV3IFJlcG9ydEluc3RhbmNlKHRoaXMsIGlkKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBMaXN0IHJlcG9ydCBpbnN0YW5jZXMgd2hpY2ggaGFkIGJlZW4gZXhlY3V0ZWQgYXN5bmNocm9ub3VzbHlcclxuICpcclxuICogQG1ldGhvZCBBbmFseXRpY3N+UmVwb3J0I2luc3RhbmNlc1xyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxBcnJheS48QW5hbHl0aWNzflJlcG9ydEluc3RhbmNlQXR0cnM+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxBcnJheS48QW5hbHl0aWNzflJlcG9ydEluc3RhbmNlQXR0cnM+Pn1cclxuICovXHJcblJlcG9ydC5wcm90b3R5cGUuaW5zdGFuY2VzID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICB2YXIgdXJsID0gWyB0aGlzLl9jb25uLl9iYXNlVXJsKCksIFwiYW5hbHl0aWNzXCIsIFwicmVwb3J0c1wiLCB0aGlzLmlkLCBcImluc3RhbmNlc1wiIF0uam9pbignLycpO1xyXG4gIHJldHVybiB0aGlzLl9jb25uLnJlcXVlc3QodXJsKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIEFQSSBjbGFzcyBmb3IgQW5hbHl0aWNzIEFQSVxyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIENvbm5lY3Rpb25cclxuICovXHJcbnZhciBBbmFseXRpY3MgPSBmdW5jdGlvbihjb25uKSB7XHJcbiAgdGhpcy5fY29ubiA9IGNvbm47XHJcbn07XHJcblxyXG4vKipcclxuICogR2V0IHJlcG9ydCBvYmplY3Qgb2YgQW5hbHl0aWNzIEFQSVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaWQgLSBSZXBvcnQgSWRcclxuICogQHJldHVybnMge0FuYWx5dGljc35SZXBvcnR9XHJcbiAqL1xyXG5BbmFseXRpY3MucHJvdG90eXBlLnJlcG9ydCA9IGZ1bmN0aW9uKGlkKSB7XHJcbiAgcmV0dXJuIG5ldyBSZXBvcnQodGhpcy5fY29ubiwgaWQpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldCByZWNlbnQgcmVwb3J0IGxpc3RcclxuICpcclxuICogQHBhcmFtIHtDYWxsYmFjay48QXJyYXkuPEFuYWx5dGljc35SZXBvcnRJbmZvPj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QXJyYXkuPEFuYWx5dGljc35SZXBvcnRJbmZvPj59XHJcbiAqL1xyXG5BbmFseXRpY3MucHJvdG90eXBlLnJlcG9ydHMgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHZhciB1cmwgPSBbIHRoaXMuX2Nvbm4uX2Jhc2VVcmwoKSwgXCJhbmFseXRpY3NcIiwgXCJyZXBvcnRzXCIgXS5qb2luKCcvJyk7XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4ucmVxdWVzdCh1cmwpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLypcclxuICogUmVnaXN0ZXIgaG9vayBpbiBjb25uZWN0aW9uIGluc3RhbnRpYXRpb24gZm9yIGR5bmFtaWNhbGx5IGFkZGluZyB0aGlzIEFQSSBtb2R1bGUgZmVhdHVyZXNcclxuICovXHJcbmpzZm9yY2Uub24oJ2Nvbm5lY3Rpb246bmV3JywgZnVuY3Rpb24oY29ubikge1xyXG4gIGNvbm4uYW5hbHl0aWNzID0gbmV3IEFuYWx5dGljcyhjb25uKTtcclxufSk7XHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBbmFseXRpY3M7XHJcbiJdfQ==
