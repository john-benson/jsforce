(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Tooling = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Manages Tooling APIs
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var jsforce = window.jsforce.require('./core'),
    _     = window.jsforce.require('lodash/core'),
    Cache = window.jsforce.require('./cache');

/**
 * API class for Tooling API call
 *
 * @class
 * @param {Connection} conn - Connection
 */
var Tooling = function(conn) {
  this._conn = conn;
  this._logger = conn._logger;
  var delegates = [
    "query",
    "queryMore",
    "create",
    "insert",
    "retrieve",
    "update",
    "upsert",
    "del",
    "delete",
    "destroy",
    "describe",
    "describeGlobal",
    "sobject"
  ];
  delegates.forEach(function(method) {
    this[method] = conn.constructor.prototype[method];
  }, this);

  this.cache = new Cache();

  var cacheOptions = {
    key: function(type) { return type ? "describe." + type : "describe"; }
  };
  this.describe$ = this.cache.makeCacheable(this.describe, this, cacheOptions);
  this.describe = this.cache.makeResponseCacheable(this.describe, this, cacheOptions);
  this.describeSObject$ = this.describe$;
  this.describeSObject = this.describe;

  cacheOptions = { key: 'describeGlobal' };
  this.describeGlobal$ = this.cache.makeCacheable(this.describeGlobal, this, cacheOptions);
  this.describeGlobal = this.cache.makeResponseCacheable(this.describeGlobal, this, cacheOptions);

  this.initialize();
};

/**
 * Initialize tooling API
 * @protected
 */
Tooling.prototype.initialize = function() {
  this.sobjects = {};
  this.cache.clear();
  this.cache.get('describeGlobal').on('value', _.bind(function(res) {
    if (res.result) {
      var types = _.map(res.result.sobjects, function(so) { return so.name; });
      types.forEach(this.sobject, this);
    }
  }, this));
};

/**
 * @private
 */
Tooling.prototype._baseUrl = function() {
  return this._conn._baseUrl() + "/tooling";
};

/**
 * @private
 */
Tooling.prototype.request = function() {
  return this._conn.request.apply(this._conn, arguments);
};

/**
 * Execute query by using SOQL
 *
 * @param {String} soql - SOQL string
 * @param {Callback.<QueryResult>} [callback] - Callback function
 * @returns {Query.<QueryResult>}
 */
/**
 * Query next record set by using query locator
 *
 * @method Tooling#query
 * @param {String} locator - Next record set locator
 * @param {Callback.<QueryResult>} [callback] - Callback function
 * @returns {Query.<QueryResult>}
 */
/**
 * Retrieve specified records
 *
 * @method Tooling#queryMore
 * @param {String} type - SObject Type
 * @param {String|Array.<String>} ids - A record ID or array of record IDs
 * @param {Callback.<Record|Array.<Record>>} [callback] - Callback function
 * @returns {Promise.<Record|Array.<Record>>}
 */

/**
 * Synonym of Tooling#create()
 *
 * @method Tooling#insert
 * @param {String} type - SObject Type
 * @param {Object|Array.<Object>} records - A record or array of records to create
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback function
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */
/**
 * Create records
 *
 * @method Tooling#create
 * @param {String} type - SObject Type
 * @param {Record|Array.<Record>} records - A record or array of records to create
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback function
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */

/**
 * Update records
 *
 * @method Tooling#update
 * @param {String} type - SObject Type
 * @param {Record|Array.<Record>} records - A record or array of records to update
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback function
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */

/**
 * Upsert records
 *
 * @method Tooling#upsert
 * @param {String} type - SObject Type
 * @param {Record|Array.<Record>} records - Record or array of records to upsert
 * @param {String} extIdField - External ID field name
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */

/**
 * Synonym of Tooling#destroy()
 *
 * @method Tooling#delete
 * @param {String} type - SObject Type
 * @param {String|Array.<String>} ids - A ID or array of IDs to delete
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */
/**
 * Synonym of Tooling#destroy()
 *
 * @method Tooling#del
 * @param {String} type - SObject Type
 * @param {String|Array.<String>} ids - A ID or array of IDs to delete
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */
/**
 * Delete records
 *
 * @method Tooling#destroy
 * @param {String} type - SObject Type
 * @param {String|Array.<String>} ids - A ID or array of IDs to delete
 * @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback
 * @returns {Promise.<RecordResult|Array.<RecordResult>>}
 */

/**
 * Synonym of Tooling#describe()
 *
 * @method Tooling#describeSObject
 * @param {String} type - SObject Type
 * @param {Callback.<DescribeSObjectResult>} [callback] - Callback function
 * @returns {Promise.<DescribeSObjectResult>}
 */
/**
 * Describe SObject metadata
 *
 * @method Tooling#describe
 * @param {String} type - SObject Type
 * @param {Callback.<DescribeSObjectResult>} [callback] - Callback function
 * @returns {Promise.<DescribeSObjectResult>}
 */

/**
 * Describe global SObjects
 *
 * @method Tooling#describeGlobal
 * @param {Callback.<DescribeGlobalResult>} [callback] - Callback function
 * @returns {Promise.<DescribeGlobalResult>}
 */

/**
 * Get SObject instance
 *
 * @method Tooling#sobject
 * @param {String} type - SObject Type
 * @returns {SObject}
 */

/**
 * @typedef {Object} Tooling~ExecuteAnonymousResult
 * @prop {Boolean} compiled - Flag if the query is compiled successfully
 * @prop {String} compileProblem - Error reason in compilation
 * @prop {Boolean} success - Flag if the code is executed successfully
 * @prop {Number} line - Line number for the error
 * @prop {Number} column - Column number for the error
 * @prop {String} exceptionMessage - Exception message
 * @prop {String} exceptionStackTrace - Exception stack trace
 */
/**
 * Executes Apex code anonymously
 *
 * @param {String} body - Anonymous Apex code
 * @param {Callback.<Tooling~ExecuteAnonymousResult>} [callback] - Callback function
 * @returns {Promise.<Tooling~ExecuteAnonymousResult>}
 */
Tooling.prototype.executeAnonymous = function(body, callback) {
  var url = this._baseUrl() + "/executeAnonymous?anonymousBody=" + encodeURIComponent(body);
  return this.request(url).thenCall(callback);
};

/**
 * Executes Apex tests asynchronously
 *
 * @param {Array.<String>} classids - Comma separated list of class IDs
 * @param {Callback.<Tooling~ExecuteAnonymousResult>} [callback] - Callback function
 * @returns {Promise.<Tooling~ExecuteAnonymousResult>}
 */
Tooling.prototype.runTestsAsynchronous = function(classids, callback) {
  var url = this._baseUrl() + "/runTestsAsynchronous/?classids=" + classids.join(',');
  return this.request(url).thenCall(callback);
};

/**
 * Executes Apex tests synchronously
 *
 * @param {Array.<String>} classnames - Comma separated list of class Names
 * @param {Callback.<Tooling~ExecuteAnonymousResult>} [callback] - Callback function
 * @returns {Promise.<Tooling~ExecuteAnonymousResult>}
 */
Tooling.prototype.runTestsSynchronous = function(classnames, callback) {
  var url = this._baseUrl() + "/runTestsSynchronous/?classnames=" + classnames.join(',');
  return this.request(url).thenCall(callback);
};

/**
 * @typedef {Object} Tooling~CompletionsResult
 * @prop {Object} publicDeclarations
 */
/**
 * Retrieves available code completions of the referenced type
 *
 * @param {String} [type] - completion type (default 'apex')
 * @param {Callback.<Tooling~CompletionsResult>} [callback] - Callback function
 * @returns {Promise.<Tooling~CompletionsResult>}
 */
Tooling.prototype.completions = function(type, callback) {
  if (!_.isString(type)) {
    callback = type;
    type = 'apex';
  }
  var url = this._baseUrl() + "/completions?type=" + encodeURIComponent(type);
  return this.request(url).thenCall(callback);
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.tooling = new Tooling(conn);
});


module.exports = Tooling;

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL3Rvb2xpbmcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcclxuICogQGZpbGUgTWFuYWdlcyBUb29saW5nIEFQSXNcclxuICogQGF1dGhvciBTaGluaWNoaSBUb21pdGEgPHNoaW5pY2hpLnRvbWl0YUBnbWFpbC5jb20+XHJcbiAqL1xyXG5cclxuJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpzZm9yY2UgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCcuL2NvcmUnKSxcclxuICAgIF8gICAgID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnbG9kYXNoL2NvcmUnKSxcclxuICAgIENhY2hlID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9jYWNoZScpO1xyXG5cclxuLyoqXHJcbiAqIEFQSSBjbGFzcyBmb3IgVG9vbGluZyBBUEkgY2FsbFxyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIC0gQ29ubmVjdGlvblxyXG4gKi9cclxudmFyIFRvb2xpbmcgPSBmdW5jdGlvbihjb25uKSB7XHJcbiAgdGhpcy5fY29ubiA9IGNvbm47XHJcbiAgdGhpcy5fbG9nZ2VyID0gY29ubi5fbG9nZ2VyO1xyXG4gIHZhciBkZWxlZ2F0ZXMgPSBbXHJcbiAgICBcInF1ZXJ5XCIsXHJcbiAgICBcInF1ZXJ5TW9yZVwiLFxyXG4gICAgXCJjcmVhdGVcIixcclxuICAgIFwiaW5zZXJ0XCIsXHJcbiAgICBcInJldHJpZXZlXCIsXHJcbiAgICBcInVwZGF0ZVwiLFxyXG4gICAgXCJ1cHNlcnRcIixcclxuICAgIFwiZGVsXCIsXHJcbiAgICBcImRlbGV0ZVwiLFxyXG4gICAgXCJkZXN0cm95XCIsXHJcbiAgICBcImRlc2NyaWJlXCIsXHJcbiAgICBcImRlc2NyaWJlR2xvYmFsXCIsXHJcbiAgICBcInNvYmplY3RcIlxyXG4gIF07XHJcbiAgZGVsZWdhdGVzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XHJcbiAgICB0aGlzW21ldGhvZF0gPSBjb25uLmNvbnN0cnVjdG9yLnByb3RvdHlwZVttZXRob2RdO1xyXG4gIH0sIHRoaXMpO1xyXG5cclxuICB0aGlzLmNhY2hlID0gbmV3IENhY2hlKCk7XHJcblxyXG4gIHZhciBjYWNoZU9wdGlvbnMgPSB7XHJcbiAgICBrZXk6IGZ1bmN0aW9uKHR5cGUpIHsgcmV0dXJuIHR5cGUgPyBcImRlc2NyaWJlLlwiICsgdHlwZSA6IFwiZGVzY3JpYmVcIjsgfVxyXG4gIH07XHJcbiAgdGhpcy5kZXNjcmliZSQgPSB0aGlzLmNhY2hlLm1ha2VDYWNoZWFibGUodGhpcy5kZXNjcmliZSwgdGhpcywgY2FjaGVPcHRpb25zKTtcclxuICB0aGlzLmRlc2NyaWJlID0gdGhpcy5jYWNoZS5tYWtlUmVzcG9uc2VDYWNoZWFibGUodGhpcy5kZXNjcmliZSwgdGhpcywgY2FjaGVPcHRpb25zKTtcclxuICB0aGlzLmRlc2NyaWJlU09iamVjdCQgPSB0aGlzLmRlc2NyaWJlJDtcclxuICB0aGlzLmRlc2NyaWJlU09iamVjdCA9IHRoaXMuZGVzY3JpYmU7XHJcblxyXG4gIGNhY2hlT3B0aW9ucyA9IHsga2V5OiAnZGVzY3JpYmVHbG9iYWwnIH07XHJcbiAgdGhpcy5kZXNjcmliZUdsb2JhbCQgPSB0aGlzLmNhY2hlLm1ha2VDYWNoZWFibGUodGhpcy5kZXNjcmliZUdsb2JhbCwgdGhpcywgY2FjaGVPcHRpb25zKTtcclxuICB0aGlzLmRlc2NyaWJlR2xvYmFsID0gdGhpcy5jYWNoZS5tYWtlUmVzcG9uc2VDYWNoZWFibGUodGhpcy5kZXNjcmliZUdsb2JhbCwgdGhpcywgY2FjaGVPcHRpb25zKTtcclxuXHJcbiAgdGhpcy5pbml0aWFsaXplKCk7XHJcbn07XHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSB0b29saW5nIEFQSVxyXG4gKiBAcHJvdGVjdGVkXHJcbiAqL1xyXG5Ub29saW5nLnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24oKSB7XHJcbiAgdGhpcy5zb2JqZWN0cyA9IHt9O1xyXG4gIHRoaXMuY2FjaGUuY2xlYXIoKTtcclxuICB0aGlzLmNhY2hlLmdldCgnZGVzY3JpYmVHbG9iYWwnKS5vbigndmFsdWUnLCBfLmJpbmQoZnVuY3Rpb24ocmVzKSB7XHJcbiAgICBpZiAocmVzLnJlc3VsdCkge1xyXG4gICAgICB2YXIgdHlwZXMgPSBfLm1hcChyZXMucmVzdWx0LnNvYmplY3RzLCBmdW5jdGlvbihzbykgeyByZXR1cm4gc28ubmFtZTsgfSk7XHJcbiAgICAgIHR5cGVzLmZvckVhY2godGhpcy5zb2JqZWN0LCB0aGlzKTtcclxuICAgIH1cclxuICB9LCB0aGlzKSk7XHJcbn07XHJcblxyXG4vKipcclxuICogQHByaXZhdGVcclxuICovXHJcblRvb2xpbmcucHJvdG90eXBlLl9iYXNlVXJsID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2Nvbm4uX2Jhc2VVcmwoKSArIFwiL3Rvb2xpbmdcIjtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuVG9vbGluZy5wcm90b3R5cGUucmVxdWVzdCA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiB0aGlzLl9jb25uLnJlcXVlc3QuYXBwbHkodGhpcy5fY29ubiwgYXJndW1lbnRzKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlIHF1ZXJ5IGJ5IHVzaW5nIFNPUUxcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHNvcWwgLSBTT1FMIHN0cmluZ1xyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxRdWVyeVJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UXVlcnkuPFF1ZXJ5UmVzdWx0Pn1cclxuICovXHJcbi8qKlxyXG4gKiBRdWVyeSBuZXh0IHJlY29yZCBzZXQgYnkgdXNpbmcgcXVlcnkgbG9jYXRvclxyXG4gKlxyXG4gKiBAbWV0aG9kIFRvb2xpbmcjcXVlcnlcclxuICogQHBhcmFtIHtTdHJpbmd9IGxvY2F0b3IgLSBOZXh0IHJlY29yZCBzZXQgbG9jYXRvclxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxRdWVyeVJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UXVlcnkuPFF1ZXJ5UmVzdWx0Pn1cclxuICovXHJcbi8qKlxyXG4gKiBSZXRyaWV2ZSBzcGVjaWZpZWQgcmVjb3Jkc1xyXG4gKlxyXG4gKiBAbWV0aG9kIFRvb2xpbmcjcXVlcnlNb3JlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gU09iamVjdCBUeXBlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfEFycmF5LjxTdHJpbmc+fSBpZHMgLSBBIHJlY29yZCBJRCBvciBhcnJheSBvZiByZWNvcmQgSURzXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFJlY29yZHxBcnJheS48UmVjb3JkPj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48UmVjb3JkfEFycmF5LjxSZWNvcmQ+Pn1cclxuICovXHJcblxyXG4vKipcclxuICogU3lub255bSBvZiBUb29saW5nI2NyZWF0ZSgpXHJcbiAqXHJcbiAqIEBtZXRob2QgVG9vbGluZyNpbnNlcnRcclxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgLSBTT2JqZWN0IFR5cGVcclxuICogQHBhcmFtIHtPYmplY3R8QXJyYXkuPE9iamVjdD59IHJlY29yZHMgLSBBIHJlY29yZCBvciBhcnJheSBvZiByZWNvcmRzIHRvIGNyZWF0ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxSZWNvcmRSZXN1bHR8QXJyYXkuPFJlY29yZFJlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPFJlY29yZFJlc3VsdHxBcnJheS48UmVjb3JkUmVzdWx0Pj59XHJcbiAqL1xyXG4vKipcclxuICogQ3JlYXRlIHJlY29yZHNcclxuICpcclxuICogQG1ldGhvZCBUb29saW5nI2NyZWF0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFNPYmplY3QgVHlwZVxyXG4gKiBAcGFyYW0ge1JlY29yZHxBcnJheS48UmVjb3JkPn0gcmVjb3JkcyAtIEEgcmVjb3JkIG9yIGFycmF5IG9mIHJlY29yZHMgdG8gY3JlYXRlXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFJlY29yZFJlc3VsdHxBcnJheS48UmVjb3JkUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48UmVjb3JkUmVzdWx0fEFycmF5LjxSZWNvcmRSZXN1bHQ+Pn1cclxuICovXHJcblxyXG4vKipcclxuICogVXBkYXRlIHJlY29yZHNcclxuICpcclxuICogQG1ldGhvZCBUb29saW5nI3VwZGF0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFNPYmplY3QgVHlwZVxyXG4gKiBAcGFyYW0ge1JlY29yZHxBcnJheS48UmVjb3JkPn0gcmVjb3JkcyAtIEEgcmVjb3JkIG9yIGFycmF5IG9mIHJlY29yZHMgdG8gdXBkYXRlXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFJlY29yZFJlc3VsdHxBcnJheS48UmVjb3JkUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48UmVjb3JkUmVzdWx0fEFycmF5LjxSZWNvcmRSZXN1bHQ+Pn1cclxuICovXHJcblxyXG4vKipcclxuICogVXBzZXJ0IHJlY29yZHNcclxuICpcclxuICogQG1ldGhvZCBUb29saW5nI3Vwc2VydFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFNPYmplY3QgVHlwZVxyXG4gKiBAcGFyYW0ge1JlY29yZHxBcnJheS48UmVjb3JkPn0gcmVjb3JkcyAtIFJlY29yZCBvciBhcnJheSBvZiByZWNvcmRzIHRvIHVwc2VydFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXh0SWRGaWVsZCAtIEV4dGVybmFsIElEIGZpZWxkIG5hbWVcclxuICogQHBhcmFtIHtDYWxsYmFjay48UmVjb3JkUmVzdWx0fEFycmF5LjxSZWNvcmRSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxSZWNvcmRSZXN1bHR8QXJyYXkuPFJlY29yZFJlc3VsdD4+fVxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBTeW5vbnltIG9mIFRvb2xpbmcjZGVzdHJveSgpXHJcbiAqXHJcbiAqIEBtZXRob2QgVG9vbGluZyNkZWxldGVcclxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgLSBTT2JqZWN0IFR5cGVcclxuICogQHBhcmFtIHtTdHJpbmd8QXJyYXkuPFN0cmluZz59IGlkcyAtIEEgSUQgb3IgYXJyYXkgb2YgSURzIHRvIGRlbGV0ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxSZWNvcmRSZXN1bHR8QXJyYXkuPFJlY29yZFJlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2tcclxuICogQHJldHVybnMge1Byb21pc2UuPFJlY29yZFJlc3VsdHxBcnJheS48UmVjb3JkUmVzdWx0Pj59XHJcbiAqL1xyXG4vKipcclxuICogU3lub255bSBvZiBUb29saW5nI2Rlc3Ryb3koKVxyXG4gKlxyXG4gKiBAbWV0aG9kIFRvb2xpbmcjZGVsXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gU09iamVjdCBUeXBlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfEFycmF5LjxTdHJpbmc+fSBpZHMgLSBBIElEIG9yIGFycmF5IG9mIElEcyB0byBkZWxldGVcclxuICogQHBhcmFtIHtDYWxsYmFjay48UmVjb3JkUmVzdWx0fEFycmF5LjxSZWNvcmRSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxSZWNvcmRSZXN1bHR8QXJyYXkuPFJlY29yZFJlc3VsdD4+fVxyXG4gKi9cclxuLyoqXHJcbiAqIERlbGV0ZSByZWNvcmRzXHJcbiAqXHJcbiAqIEBtZXRob2QgVG9vbGluZyNkZXN0cm95XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gU09iamVjdCBUeXBlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfEFycmF5LjxTdHJpbmc+fSBpZHMgLSBBIElEIG9yIGFycmF5IG9mIElEcyB0byBkZWxldGVcclxuICogQHBhcmFtIHtDYWxsYmFjay48UmVjb3JkUmVzdWx0fEFycmF5LjxSZWNvcmRSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxSZWNvcmRSZXN1bHR8QXJyYXkuPFJlY29yZFJlc3VsdD4+fVxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBTeW5vbnltIG9mIFRvb2xpbmcjZGVzY3JpYmUoKVxyXG4gKlxyXG4gKiBAbWV0aG9kIFRvb2xpbmcjZGVzY3JpYmVTT2JqZWN0XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gU09iamVjdCBUeXBlXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPERlc2NyaWJlU09iamVjdFJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48RGVzY3JpYmVTT2JqZWN0UmVzdWx0Pn1cclxuICovXHJcbi8qKlxyXG4gKiBEZXNjcmliZSBTT2JqZWN0IG1ldGFkYXRhXHJcbiAqXHJcbiAqIEBtZXRob2QgVG9vbGluZyNkZXNjcmliZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFNPYmplY3QgVHlwZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxEZXNjcmliZVNPYmplY3RSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPERlc2NyaWJlU09iamVjdFJlc3VsdD59XHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIERlc2NyaWJlIGdsb2JhbCBTT2JqZWN0c1xyXG4gKlxyXG4gKiBAbWV0aG9kIFRvb2xpbmcjZGVzY3JpYmVHbG9iYWxcclxuICogQHBhcmFtIHtDYWxsYmFjay48RGVzY3JpYmVHbG9iYWxSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPERlc2NyaWJlR2xvYmFsUmVzdWx0Pn1cclxuICovXHJcblxyXG4vKipcclxuICogR2V0IFNPYmplY3QgaW5zdGFuY2VcclxuICpcclxuICogQG1ldGhvZCBUb29saW5nI3NvYmplY3RcclxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgLSBTT2JqZWN0IFR5cGVcclxuICogQHJldHVybnMge1NPYmplY3R9XHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFRvb2xpbmd+RXhlY3V0ZUFub255bW91c1Jlc3VsdFxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gY29tcGlsZWQgLSBGbGFnIGlmIHRoZSBxdWVyeSBpcyBjb21waWxlZCBzdWNjZXNzZnVsbHlcclxuICogQHByb3Age1N0cmluZ30gY29tcGlsZVByb2JsZW0gLSBFcnJvciByZWFzb24gaW4gY29tcGlsYXRpb25cclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBGbGFnIGlmIHRoZSBjb2RlIGlzIGV4ZWN1dGVkIHN1Y2Nlc3NmdWxseVxyXG4gKiBAcHJvcCB7TnVtYmVyfSBsaW5lIC0gTGluZSBudW1iZXIgZm9yIHRoZSBlcnJvclxyXG4gKiBAcHJvcCB7TnVtYmVyfSBjb2x1bW4gLSBDb2x1bW4gbnVtYmVyIGZvciB0aGUgZXJyb3JcclxuICogQHByb3Age1N0cmluZ30gZXhjZXB0aW9uTWVzc2FnZSAtIEV4Y2VwdGlvbiBtZXNzYWdlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGV4Y2VwdGlvblN0YWNrVHJhY2UgLSBFeGNlcHRpb24gc3RhY2sgdHJhY2VcclxuICovXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyBBcGV4IGNvZGUgYW5vbnltb3VzbHlcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGJvZHkgLSBBbm9ueW1vdXMgQXBleCBjb2RlXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFRvb2xpbmd+RXhlY3V0ZUFub255bW91c1Jlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48VG9vbGluZ35FeGVjdXRlQW5vbnltb3VzUmVzdWx0Pn1cclxuICovXHJcblRvb2xpbmcucHJvdG90eXBlLmV4ZWN1dGVBbm9ueW1vdXMgPSBmdW5jdGlvbihib2R5LCBjYWxsYmFjaykge1xyXG4gIHZhciB1cmwgPSB0aGlzLl9iYXNlVXJsKCkgKyBcIi9leGVjdXRlQW5vbnltb3VzP2Fub255bW91c0JvZHk9XCIgKyBlbmNvZGVVUklDb21wb25lbnQoYm9keSk7XHJcbiAgcmV0dXJuIHRoaXMucmVxdWVzdCh1cmwpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFeGVjdXRlcyBBcGV4IHRlc3RzIGFzeW5jaHJvbm91c2x5XHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXkuPFN0cmluZz59IGNsYXNzaWRzIC0gQ29tbWEgc2VwYXJhdGVkIGxpc3Qgb2YgY2xhc3MgSURzXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFRvb2xpbmd+RXhlY3V0ZUFub255bW91c1Jlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48VG9vbGluZ35FeGVjdXRlQW5vbnltb3VzUmVzdWx0Pn1cclxuICovXHJcblRvb2xpbmcucHJvdG90eXBlLnJ1blRlc3RzQXN5bmNocm9ub3VzID0gZnVuY3Rpb24oY2xhc3NpZHMsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIHVybCA9IHRoaXMuX2Jhc2VVcmwoKSArIFwiL3J1blRlc3RzQXN5bmNocm9ub3VzLz9jbGFzc2lkcz1cIiArIGNsYXNzaWRzLmpvaW4oJywnKTtcclxuICByZXR1cm4gdGhpcy5yZXF1ZXN0KHVybCkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEV4ZWN1dGVzIEFwZXggdGVzdHMgc3luY2hyb25vdXNseVxyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSBjbGFzc25hbWVzIC0gQ29tbWEgc2VwYXJhdGVkIGxpc3Qgb2YgY2xhc3MgTmFtZXNcclxuICogQHBhcmFtIHtDYWxsYmFjay48VG9vbGluZ35FeGVjdXRlQW5vbnltb3VzUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxUb29saW5nfkV4ZWN1dGVBbm9ueW1vdXNSZXN1bHQ+fVxyXG4gKi9cclxuVG9vbGluZy5wcm90b3R5cGUucnVuVGVzdHNTeW5jaHJvbm91cyA9IGZ1bmN0aW9uKGNsYXNzbmFtZXMsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIHVybCA9IHRoaXMuX2Jhc2VVcmwoKSArIFwiL3J1blRlc3RzU3luY2hyb25vdXMvP2NsYXNzbmFtZXM9XCIgKyBjbGFzc25hbWVzLmpvaW4oJywnKTtcclxuICByZXR1cm4gdGhpcy5yZXF1ZXN0KHVybCkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IFRvb2xpbmd+Q29tcGxldGlvbnNSZXN1bHRcclxuICogQHByb3Age09iamVjdH0gcHVibGljRGVjbGFyYXRpb25zXHJcbiAqL1xyXG4vKipcclxuICogUmV0cmlldmVzIGF2YWlsYWJsZSBjb2RlIGNvbXBsZXRpb25zIG9mIHRoZSByZWZlcmVuY2VkIHR5cGVcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IFt0eXBlXSAtIGNvbXBsZXRpb24gdHlwZSAoZGVmYXVsdCAnYXBleCcpXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFRvb2xpbmd+Q29tcGxldGlvbnNSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPFRvb2xpbmd+Q29tcGxldGlvbnNSZXN1bHQ+fVxyXG4gKi9cclxuVG9vbGluZy5wcm90b3R5cGUuY29tcGxldGlvbnMgPSBmdW5jdGlvbih0eXBlLCBjYWxsYmFjaykge1xyXG4gIGlmICghXy5pc1N0cmluZyh0eXBlKSkge1xyXG4gICAgY2FsbGJhY2sgPSB0eXBlO1xyXG4gICAgdHlwZSA9ICdhcGV4JztcclxuICB9XHJcbiAgdmFyIHVybCA9IHRoaXMuX2Jhc2VVcmwoKSArIFwiL2NvbXBsZXRpb25zP3R5cGU9XCIgKyBlbmNvZGVVUklDb21wb25lbnQodHlwZSk7XHJcbiAgcmV0dXJuIHRoaXMucmVxdWVzdCh1cmwpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLypcclxuICogUmVnaXN0ZXIgaG9vayBpbiBjb25uZWN0aW9uIGluc3RhbnRpYXRpb24gZm9yIGR5bmFtaWNhbGx5IGFkZGluZyB0aGlzIEFQSSBtb2R1bGUgZmVhdHVyZXNcclxuICovXHJcbmpzZm9yY2Uub24oJ2Nvbm5lY3Rpb246bmV3JywgZnVuY3Rpb24oY29ubikge1xyXG4gIGNvbm4udG9vbGluZyA9IG5ldyBUb29saW5nKGNvbm4pO1xyXG59KTtcclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFRvb2xpbmc7XHJcbiJdfQ==
