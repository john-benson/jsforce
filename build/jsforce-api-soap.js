(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Soap = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Salesforce SOAP API
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var isArray = require('lodash/isArray');
var jsforce = window.jsforce.require('./core');
var SOAP = window.jsforce.require('./soap');

/**
 * API class for Partner SOAP call
 *
 * @class
 * @param {Connection} conn - Connection
 */
var SoapApi = module.exports = function(conn) {
  this._conn = conn;
};

/**
 * Call SOAP Api (Partner) endpoint
 * @private
 */
SoapApi.prototype._invoke = function(method, message, schema, callback) {
  var soapEndpoint = new SOAP(this._conn, {
    xmlns: "urn:partner.soap.sforce.com",
    endpointUrl: this._conn.instanceUrl + "/services/Soap/u/" + this._conn.version
  });
  return soapEndpoint.invoke(method, message, { result: schema }).then(function(res) {
    return res.result;
  }).thenCall(callback);
};


/* */
var Schemas = {};

/**
 * @typedef SoapApi~LeadConvert
 * @prop {String} convertedStatus - Status of converted lead
 * @prop {String} leadId - Lead record Id to convert
 * @prop {String} [accountId] - Account record Id to assign the converted record
 * @prop {String} [contactId] - Contact record Id to assign the converted record
 * @prop {Boolean} [doNotCreateOpportunity] - True if you don't want to create a new opportunity
 * @prop {String} [opportunityName] - Name of opportunity to create
 * @prop {Boolean} [overwriteLeadSource] - True if overwriting lead source
 * @prop {String} [ownerId] - Owner Id
 * @prop {Boolean} [sendNotificationEmail] - True if send notification email
 */
/**
 * @typedef SoapApi~LeadConvertResult
 * @prop {String} leadId - Lead record Id to convert
 * @prop {String} [accountId] - Account record Id of converted lead
 * @prop {String} [contactId] - Contact record Id of converted lead
 * @prop {String} [opportunityId] - Opportunity record Id created in conversion
 * @prop {Boolean} success - True if successfully converted
 * @prop {Array.<Object>} errors - Error
 */
/**
 * Converts a Lead into an Account, Contact, or (optionally) an Opportunity.
 *
 * @param {SoapApi~LeadConvert|Array.<SoapApi~LeadConvert>} leadConverts
 * @param {Callback.<SoapApi~LeadConvertResult|Array.<SoapApi~LeadConvertResult>>} [callback] - Callback function
 * @returns {Promise.<SoapApi~LeadConvertResult|Array.<SoapApi~LeadConvertResult>>}
 */
SoapApi.prototype.convertLead = function(leadConverts, callback) {
  var schema = isArray(leadConverts) ? [ Schemas.LeadConvertResult ] : Schemas.LeadConvertResult;
  return this._invoke("convertLead", { leadConverts: leadConverts }, schema, callback);
};
Schemas.LeadConvertResult = {
  success: 'boolean',
  errors: [],
  leadId: 'string',
  accountId: 'string',
  contactId: 'string',
  opportunityId: 'string'
};

/**
 * @typedef SoapApi~MergeRequest
 * @prop {Object} masterRecord - The merge destination record
 * @prop {Array.<String>} recordToMergeIds - Ids of records to merge
 */
/**
 * @typedef SoapApi~MergeResult
 * @prop {Boolean} success - True if successfully merged
 * @prop {Array.<Object>} errors - Error
 * @prop {String} id - ID of the master record
 * @prop {Array.<String>} mergedRecordIds - ID of the records that were merged into the master record
 * @prop {Array.<String>} updatedRelatedIds - ID of all related records that were moved (re-parented) as a result of the merge
 */

/**
 * Merge up to three records into one
 *
 * @param {SoapApi~MergeRequest|Array.<SoapApi~MergeRequest>} mergeRequests
 * @param {Callback.<SoapApi~MergeResult|Array.<SoapApi~MergeResult>>} [callback] - Callback function
 * @returns {Promise.<SoapApi~MergeResult|Array.<SoapApi~MergeResult>>}
 */
SoapApi.prototype.merge = function(mergeRequests, callback) {
  var schema = isArray(mergeRequests) ? [ Schemas.MergeResult ] : Schemas.MergeResult;
  return this._invoke("merge", { mergeRequests: mergeRequests }, schema, callback);
};
Schemas.MergeResult = {
  success: 'boolean',
  errors: [],
  id: 'string',
  mergedRecordIds: ['string'],
  updatedRelatedIds: ['string']
};


/**
 * @typedef SoapApi~EmptyRecycleBinResult
 * @prop {String} id - ID of an sObject that you attempted to delete from the Recycle Bin
 * @prop {Boolean} success - Whether the call succeeded (true) or not (false) for this record
 * @prop {Array.<Object>} errors - Errors
 */
/**
 * Delete records from the recycle bin immediately
 *
 * @param {Array.<String>} ids - Record ids to empty from recycle bin
 * @param {Callback.<Array.<SoapApi~EmptyRecycleBinResult>>} [callback] - Callback function
 * @returns {Promise.<Array.<SoapApi~EmptyRecycleBinResult>>}
 */
SoapApi.prototype.emptyRecycleBin = function(ids, callback) {
  return this._invoke("emptyRecycleBin", { ids: ids }, [ Schemas.EmptyRecycleBinResult ], callback);
};
Schemas.EmptyRecycleBinResult = {
  id: 'string',
  success: 'boolean',
  errors: []
};


/**
 * @typedef SoapApi~DescribeTabSetResult
 * @prop {String} label - The display label for this standard or custom app
 * @prop {String} logoUrl - A fully qualified URL to the logo image associated with the standard or custom app
 * @prop {String} namespace - Namespace of application package
 * @prop {Boolean} selected - If true, then this standard or custom app is the user’s currently selected app
 * @prop {Array.<SoapApi~DescribeTab>} tabs - An array of tabs that are displayed for the specified standard app or custom app
 */
/**
 * @typedef SoapApi~DescribeTab
 * @prop {Array.<Object>} colors - Array of color information used for a tab
 * @prop {Boolean} custom - true if this is a custom tab
 * @prop {String} iconUrl - The URL for the main 32 x 32 pixel icon for a tab
 * @prop {Array.<Object>} icons - Array of icon information used for a tab
 * @prop {String} label - The display label for this tab
 * @prop {String} miniIconUrl - The URL for the 16 x 16 pixel icon that represents a tab
 * @prop {String} name - The API name of the tab
 * @prop {String} sobjectName - The name of the sObject that is primarily displayed on this tab
 * @prop {String} url - A fully qualified URL for viewing this tab
 */
/**
 * Returns information about the standard and custom apps available to the logged-in user
 *
 * @param {Callback.<Array.<SoapApi~DescribeTabSetResult>>} [callback] - Callback function
 * @returns {Promise.<Array.<SoapApi~DescribeTabSetResult>>}
 */
SoapApi.prototype.describeTabs = function(callback) {
  return this._invoke("describeTabs", {}, [ Schemas.DescribeTabSetResult ], callback);
};
Schemas.DescribeTabSetResult = {
  label: 'string',
  logoUrl: 'string',
  namespace: 'string',
  selected: 'boolean',
  tabs: [{
    colors: [{
      theme: 'string',
      color: 'string',
      context: 'string'
    }],
    iconUrl: 'string',
    icons: [{
      theme: 'string',
      height: 'number',
      width: 'number',
      url: 'string',
      contentType: 'string'
    }],
    label: 'string',
    custom: 'boolean',
    miniIconUrl: 'string',
    name: 'string',
    sobjectName: 'string',
    url: 'string'
  }]
};

/**
 * Retrieves the current system timestamp (Coordinated Universal Time (UTC) time zone) from the API
 *
 * @typedef SoapApi~ServerTimestampResult
 * @prop {String} timestamp - Timestamp
 */
/**
 * @param {Callback.<SoapApi~ServerTimestampResult>} [callback] - Callback function
 * @returns {Promise.<SoapApi~ServerTimestampResult>}
 */
SoapApi.prototype.getServerTimestamp = function(callback) {
  return this._invoke("getServerTimestamp", {}, Schemas.GetServerTimestampResult, callback);
};
Schemas.GetServerTimestampResult = {
  timestamp: 'string'
};

/**
 * @typedef SoapApi~UserInfoResult
 * @prop {Boolean} accessibilityMode
 * @prop {String} currencySymbol
 * @prop {Number} orgAttachmentFileSizeLimit
 * @prop {String} orgDefaultCurrencyIsoCode
 * @prop {String} orgDisallowHtmlAttachments
 * @prop {Boolean} orgHasPersonAccounts
 * @prop {String} organizationId
 * @prop {Boolean} organizationMultiCurrency
 * @prop {String} organizationName
 * @prop {String} profileId
 * @prop {String} roleId
 * @prop {Number} sessionSecondsValid
 * @prop {String} userDefaultCurrencyIsoCode
 * @prop {String} userEmail
 * @prop {String} userFullName
 * @prop {String} userId
 * @prop {String} userLanguage
 * @prop {String} userLocale
 * @prop {String} userName
 * @prop {String} userTimeZone
 * @prop {String} userType
 * @prop {String} userUiSkin
 */
/**
 * Retrieves personal information for the user associated with the current session
 *
 * @param {Callback.<SoapApi~UserInfoResult>} [callback] - Callback function
 * @returns {Promise.<SoapApi~UserInfoResult>}
 */
SoapApi.prototype.getUserInfo = function(callback) {
  return this._invoke("getUserInfo", {}, Schemas.GetUserInfoResult, callback);
};
Schemas.GetUserInfoResult = {
  accessibilityMode: 'boolean',
  currencySymbol: 'string',
  orgAttachmentFileSizeLimit: 'number',
  orgDefaultCurrencyIsoCode: 'string',
  orgDisallowHtmlAttachments: 'boolean',
  orgHasPersonAccounts: 'boolean',
  organizationId: 'string',
  organizationMultiCurrency: 'boolean',
  organizationName: 'string',
  profileId: 'string',
  roleId: 'string',
  sessionSecondsValid: 'number',
  userDefaultCurrencyIsoCode: 'string',
  userEmail: 'string',
  userFullName: 'string',
  userId: 'string',
  userLanguage: 'string',
  userLocale: 'string',
  userName: 'string',
  userTimeZone: 'string',
  userType: 'string',
  userUiSkin: 'string'
};

/**
 * Sets the specified user’s password to the specified value
 *
 * @param {String} userId - User Id to set password
 * @param {String} password - New password
 * @param {Callback.<String>} [callback] - Callback function
 * @returns {Promise.<String>}
 */
SoapApi.prototype.setPassword = function(userId, password, callback) {
  return this._invoke("setPassword", { userId: userId, password: password }, callback);
};

/**
 * @typedef SoapApi~ResetPasswordResult
 * @prop {String} password
 */
/**
 * Resets the specified user’s password
 *
 * @param {String} userId - User Id to set password
 * @param {String} password - New password
 * @param {Callback.<SoapApi~ResetPasswordResult>} [callback] - Callback function
 * @returns {Promise.<SoapApi~ResetPasswordResult>}
 */
SoapApi.prototype.resetPassword = function(userId, callback) {
  return this._invoke("resetPassword", { userId: userId }, callback);
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.soap = new SoapApi(conn);
});


module.exports = SoapApi;

},{"lodash/isArray":2}],2:[function(require,module,exports){
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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL3NvYXAuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoL2lzQXJyYXkuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcclxuICogQGZpbGUgU2FsZXNmb3JjZSBTT0FQIEFQSVxyXG4gKiBAYXV0aG9yIFNoaW5pY2hpIFRvbWl0YSA8c2hpbmljaGkudG9taXRhQGdtYWlsLmNvbT5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC9pc0FycmF5Jyk7XHJcbnZhciBqc2ZvcmNlID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9jb3JlJyk7XHJcbnZhciBTT0FQID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9zb2FwJyk7XHJcblxyXG4vKipcclxuICogQVBJIGNsYXNzIGZvciBQYXJ0bmVyIFNPQVAgY2FsbFxyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIC0gQ29ubmVjdGlvblxyXG4gKi9cclxudmFyIFNvYXBBcGkgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbm4pIHtcclxuICB0aGlzLl9jb25uID0gY29ubjtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYWxsIFNPQVAgQXBpIChQYXJ0bmVyKSBlbmRwb2ludFxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuU29hcEFwaS5wcm90b3R5cGUuX2ludm9rZSA9IGZ1bmN0aW9uKG1ldGhvZCwgbWVzc2FnZSwgc2NoZW1hLCBjYWxsYmFjaykge1xyXG4gIHZhciBzb2FwRW5kcG9pbnQgPSBuZXcgU09BUCh0aGlzLl9jb25uLCB7XHJcbiAgICB4bWxuczogXCJ1cm46cGFydG5lci5zb2FwLnNmb3JjZS5jb21cIixcclxuICAgIGVuZHBvaW50VXJsOiB0aGlzLl9jb25uLmluc3RhbmNlVXJsICsgXCIvc2VydmljZXMvU29hcC91L1wiICsgdGhpcy5fY29ubi52ZXJzaW9uXHJcbiAgfSk7XHJcbiAgcmV0dXJuIHNvYXBFbmRwb2ludC5pbnZva2UobWV0aG9kLCBtZXNzYWdlLCB7IHJlc3VsdDogc2NoZW1hIH0pLnRoZW4oZnVuY3Rpb24ocmVzKSB7XHJcbiAgICByZXR1cm4gcmVzLnJlc3VsdDtcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyogKi9cclxudmFyIFNjaGVtYXMgPSB7fTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpfkxlYWRDb252ZXJ0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IGNvbnZlcnRlZFN0YXR1cyAtIFN0YXR1cyBvZiBjb252ZXJ0ZWQgbGVhZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBsZWFkSWQgLSBMZWFkIHJlY29yZCBJZCB0byBjb252ZXJ0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IFthY2NvdW50SWRdIC0gQWNjb3VudCByZWNvcmQgSWQgdG8gYXNzaWduIHRoZSBjb252ZXJ0ZWQgcmVjb3JkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFtjb250YWN0SWRdIC0gQ29udGFjdCByZWNvcmQgSWQgdG8gYXNzaWduIHRoZSBjb252ZXJ0ZWQgcmVjb3JkXHJcbiAqIEBwcm9wIHtCb29sZWFufSBbZG9Ob3RDcmVhdGVPcHBvcnR1bml0eV0gLSBUcnVlIGlmIHlvdSBkb24ndCB3YW50IHRvIGNyZWF0ZSBhIG5ldyBvcHBvcnR1bml0eVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBbb3Bwb3J0dW5pdHlOYW1lXSAtIE5hbWUgb2Ygb3Bwb3J0dW5pdHkgdG8gY3JlYXRlXHJcbiAqIEBwcm9wIHtCb29sZWFufSBbb3ZlcndyaXRlTGVhZFNvdXJjZV0gLSBUcnVlIGlmIG92ZXJ3cml0aW5nIGxlYWQgc291cmNlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFtvd25lcklkXSAtIE93bmVyIElkXHJcbiAqIEBwcm9wIHtCb29sZWFufSBbc2VuZE5vdGlmaWNhdGlvbkVtYWlsXSAtIFRydWUgaWYgc2VuZCBub3RpZmljYXRpb24gZW1haWxcclxuICovXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpfkxlYWRDb252ZXJ0UmVzdWx0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IGxlYWRJZCAtIExlYWQgcmVjb3JkIElkIHRvIGNvbnZlcnRcclxuICogQHByb3Age1N0cmluZ30gW2FjY291bnRJZF0gLSBBY2NvdW50IHJlY29yZCBJZCBvZiBjb252ZXJ0ZWQgbGVhZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBbY29udGFjdElkXSAtIENvbnRhY3QgcmVjb3JkIElkIG9mIGNvbnZlcnRlZCBsZWFkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFtvcHBvcnR1bml0eUlkXSAtIE9wcG9ydHVuaXR5IHJlY29yZCBJZCBjcmVhdGVkIGluIGNvbnZlcnNpb25cclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBUcnVlIGlmIHN1Y2Nlc3NmdWxseSBjb252ZXJ0ZWRcclxuICogQHByb3Age0FycmF5LjxPYmplY3Q+fSBlcnJvcnMgLSBFcnJvclxyXG4gKi9cclxuLyoqXHJcbiAqIENvbnZlcnRzIGEgTGVhZCBpbnRvIGFuIEFjY291bnQsIENvbnRhY3QsIG9yIChvcHRpb25hbGx5KSBhbiBPcHBvcnR1bml0eS5cclxuICpcclxuICogQHBhcmFtIHtTb2FwQXBpfkxlYWRDb252ZXJ0fEFycmF5LjxTb2FwQXBpfkxlYWRDb252ZXJ0Pn0gbGVhZENvbnZlcnRzXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFNvYXBBcGl+TGVhZENvbnZlcnRSZXN1bHR8QXJyYXkuPFNvYXBBcGl+TGVhZENvbnZlcnRSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTb2FwQXBpfkxlYWRDb252ZXJ0UmVzdWx0fEFycmF5LjxTb2FwQXBpfkxlYWRDb252ZXJ0UmVzdWx0Pj59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5jb252ZXJ0TGVhZCA9IGZ1bmN0aW9uKGxlYWRDb252ZXJ0cywgY2FsbGJhY2spIHtcclxuICB2YXIgc2NoZW1hID0gaXNBcnJheShsZWFkQ29udmVydHMpID8gWyBTY2hlbWFzLkxlYWRDb252ZXJ0UmVzdWx0IF0gOiBTY2hlbWFzLkxlYWRDb252ZXJ0UmVzdWx0O1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJjb252ZXJ0TGVhZFwiLCB7IGxlYWRDb252ZXJ0czogbGVhZENvbnZlcnRzIH0sIHNjaGVtYSwgY2FsbGJhY2spO1xyXG59O1xyXG5TY2hlbWFzLkxlYWRDb252ZXJ0UmVzdWx0ID0ge1xyXG4gIHN1Y2Nlc3M6ICdib29sZWFuJyxcclxuICBlcnJvcnM6IFtdLFxyXG4gIGxlYWRJZDogJ3N0cmluZycsXHJcbiAgYWNjb3VudElkOiAnc3RyaW5nJyxcclxuICBjb250YWN0SWQ6ICdzdHJpbmcnLFxyXG4gIG9wcG9ydHVuaXR5SWQ6ICdzdHJpbmcnXHJcbn07XHJcblxyXG4vKipcclxuICogQHR5cGVkZWYgU29hcEFwaX5NZXJnZVJlcXVlc3RcclxuICogQHByb3Age09iamVjdH0gbWFzdGVyUmVjb3JkIC0gVGhlIG1lcmdlIGRlc3RpbmF0aW9uIHJlY29yZFxyXG4gKiBAcHJvcCB7QXJyYXkuPFN0cmluZz59IHJlY29yZFRvTWVyZ2VJZHMgLSBJZHMgb2YgcmVjb3JkcyB0byBtZXJnZVxyXG4gKi9cclxuLyoqXHJcbiAqIEB0eXBlZGVmIFNvYXBBcGl+TWVyZ2VSZXN1bHRcclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBUcnVlIGlmIHN1Y2Nlc3NmdWxseSBtZXJnZWRcclxuICogQHByb3Age0FycmF5LjxPYmplY3Q+fSBlcnJvcnMgLSBFcnJvclxyXG4gKiBAcHJvcCB7U3RyaW5nfSBpZCAtIElEIG9mIHRoZSBtYXN0ZXIgcmVjb3JkXHJcbiAqIEBwcm9wIHtBcnJheS48U3RyaW5nPn0gbWVyZ2VkUmVjb3JkSWRzIC0gSUQgb2YgdGhlIHJlY29yZHMgdGhhdCB3ZXJlIG1lcmdlZCBpbnRvIHRoZSBtYXN0ZXIgcmVjb3JkXHJcbiAqIEBwcm9wIHtBcnJheS48U3RyaW5nPn0gdXBkYXRlZFJlbGF0ZWRJZHMgLSBJRCBvZiBhbGwgcmVsYXRlZCByZWNvcmRzIHRoYXQgd2VyZSBtb3ZlZCAocmUtcGFyZW50ZWQpIGFzIGEgcmVzdWx0IG9mIHRoZSBtZXJnZVxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBNZXJnZSB1cCB0byB0aHJlZSByZWNvcmRzIGludG8gb25lXHJcbiAqXHJcbiAqIEBwYXJhbSB7U29hcEFwaX5NZXJnZVJlcXVlc3R8QXJyYXkuPFNvYXBBcGl+TWVyZ2VSZXF1ZXN0Pn0gbWVyZ2VSZXF1ZXN0c1xyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxTb2FwQXBpfk1lcmdlUmVzdWx0fEFycmF5LjxTb2FwQXBpfk1lcmdlUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48U29hcEFwaX5NZXJnZVJlc3VsdHxBcnJheS48U29hcEFwaX5NZXJnZVJlc3VsdD4+fVxyXG4gKi9cclxuU29hcEFwaS5wcm90b3R5cGUubWVyZ2UgPSBmdW5jdGlvbihtZXJnZVJlcXVlc3RzLCBjYWxsYmFjaykge1xyXG4gIHZhciBzY2hlbWEgPSBpc0FycmF5KG1lcmdlUmVxdWVzdHMpID8gWyBTY2hlbWFzLk1lcmdlUmVzdWx0IF0gOiBTY2hlbWFzLk1lcmdlUmVzdWx0O1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJtZXJnZVwiLCB7IG1lcmdlUmVxdWVzdHM6IG1lcmdlUmVxdWVzdHMgfSwgc2NoZW1hLCBjYWxsYmFjayk7XHJcbn07XHJcblNjaGVtYXMuTWVyZ2VSZXN1bHQgPSB7XHJcbiAgc3VjY2VzczogJ2Jvb2xlYW4nLFxyXG4gIGVycm9yczogW10sXHJcbiAgaWQ6ICdzdHJpbmcnLFxyXG4gIG1lcmdlZFJlY29yZElkczogWydzdHJpbmcnXSxcclxuICB1cGRhdGVkUmVsYXRlZElkczogWydzdHJpbmcnXVxyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpfkVtcHR5UmVjeWNsZUJpblJlc3VsdFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBpZCAtIElEIG9mIGFuIHNPYmplY3QgdGhhdCB5b3UgYXR0ZW1wdGVkIHRvIGRlbGV0ZSBmcm9tIHRoZSBSZWN5Y2xlIEJpblxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gc3VjY2VzcyAtIFdoZXRoZXIgdGhlIGNhbGwgc3VjY2VlZGVkICh0cnVlKSBvciBub3QgKGZhbHNlKSBmb3IgdGhpcyByZWNvcmRcclxuICogQHByb3Age0FycmF5LjxPYmplY3Q+fSBlcnJvcnMgLSBFcnJvcnNcclxuICovXHJcbi8qKlxyXG4gKiBEZWxldGUgcmVjb3JkcyBmcm9tIHRoZSByZWN5Y2xlIGJpbiBpbW1lZGlhdGVseVxyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSBpZHMgLSBSZWNvcmQgaWRzIHRvIGVtcHR5IGZyb20gcmVjeWNsZSBiaW5cclxuICogQHBhcmFtIHtDYWxsYmFjay48QXJyYXkuPFNvYXBBcGl+RW1wdHlSZWN5Y2xlQmluUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QXJyYXkuPFNvYXBBcGl+RW1wdHlSZWN5Y2xlQmluUmVzdWx0Pj59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5lbXB0eVJlY3ljbGVCaW4gPSBmdW5jdGlvbihpZHMsIGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImVtcHR5UmVjeWNsZUJpblwiLCB7IGlkczogaWRzIH0sIFsgU2NoZW1hcy5FbXB0eVJlY3ljbGVCaW5SZXN1bHQgXSwgY2FsbGJhY2spO1xyXG59O1xyXG5TY2hlbWFzLkVtcHR5UmVjeWNsZUJpblJlc3VsdCA9IHtcclxuICBpZDogJ3N0cmluZycsXHJcbiAgc3VjY2VzczogJ2Jvb2xlYW4nLFxyXG4gIGVycm9yczogW11cclxufTtcclxuXHJcblxyXG4vKipcclxuICogQHR5cGVkZWYgU29hcEFwaX5EZXNjcmliZVRhYlNldFJlc3VsdFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBsYWJlbCAtIFRoZSBkaXNwbGF5IGxhYmVsIGZvciB0aGlzIHN0YW5kYXJkIG9yIGN1c3RvbSBhcHBcclxuICogQHByb3Age1N0cmluZ30gbG9nb1VybCAtIEEgZnVsbHkgcXVhbGlmaWVkIFVSTCB0byB0aGUgbG9nbyBpbWFnZSBhc3NvY2lhdGVkIHdpdGggdGhlIHN0YW5kYXJkIG9yIGN1c3RvbSBhcHBcclxuICogQHByb3Age1N0cmluZ30gbmFtZXNwYWNlIC0gTmFtZXNwYWNlIG9mIGFwcGxpY2F0aW9uIHBhY2thZ2VcclxuICogQHByb3Age0Jvb2xlYW59IHNlbGVjdGVkIC0gSWYgdHJ1ZSwgdGhlbiB0aGlzIHN0YW5kYXJkIG9yIGN1c3RvbSBhcHAgaXMgdGhlIHVzZXLigJlzIGN1cnJlbnRseSBzZWxlY3RlZCBhcHBcclxuICogQHByb3Age0FycmF5LjxTb2FwQXBpfkRlc2NyaWJlVGFiPn0gdGFicyAtIEFuIGFycmF5IG9mIHRhYnMgdGhhdCBhcmUgZGlzcGxheWVkIGZvciB0aGUgc3BlY2lmaWVkIHN0YW5kYXJkIGFwcCBvciBjdXN0b20gYXBwXHJcbiAqL1xyXG4vKipcclxuICogQHR5cGVkZWYgU29hcEFwaX5EZXNjcmliZVRhYlxyXG4gKiBAcHJvcCB7QXJyYXkuPE9iamVjdD59IGNvbG9ycyAtIEFycmF5IG9mIGNvbG9yIGluZm9ybWF0aW9uIHVzZWQgZm9yIGEgdGFiXHJcbiAqIEBwcm9wIHtCb29sZWFufSBjdXN0b20gLSB0cnVlIGlmIHRoaXMgaXMgYSBjdXN0b20gdGFiXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGljb25VcmwgLSBUaGUgVVJMIGZvciB0aGUgbWFpbiAzMiB4IDMyIHBpeGVsIGljb24gZm9yIGEgdGFiXHJcbiAqIEBwcm9wIHtBcnJheS48T2JqZWN0Pn0gaWNvbnMgLSBBcnJheSBvZiBpY29uIGluZm9ybWF0aW9uIHVzZWQgZm9yIGEgdGFiXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGxhYmVsIC0gVGhlIGRpc3BsYXkgbGFiZWwgZm9yIHRoaXMgdGFiXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG1pbmlJY29uVXJsIC0gVGhlIFVSTCBmb3IgdGhlIDE2IHggMTYgcGl4ZWwgaWNvbiB0aGF0IHJlcHJlc2VudHMgYSB0YWJcclxuICogQHByb3Age1N0cmluZ30gbmFtZSAtIFRoZSBBUEkgbmFtZSBvZiB0aGUgdGFiXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHNvYmplY3ROYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHNPYmplY3QgdGhhdCBpcyBwcmltYXJpbHkgZGlzcGxheWVkIG9uIHRoaXMgdGFiXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVybCAtIEEgZnVsbHkgcXVhbGlmaWVkIFVSTCBmb3Igdmlld2luZyB0aGlzIHRhYlxyXG4gKi9cclxuLyoqXHJcbiAqIFJldHVybnMgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHN0YW5kYXJkIGFuZCBjdXN0b20gYXBwcyBhdmFpbGFibGUgdG8gdGhlIGxvZ2dlZC1pbiB1c2VyXHJcbiAqXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPEFycmF5LjxTb2FwQXBpfkRlc2NyaWJlVGFiU2V0UmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48QXJyYXkuPFNvYXBBcGl+RGVzY3JpYmVUYWJTZXRSZXN1bHQ+Pn1cclxuICovXHJcblNvYXBBcGkucHJvdG90eXBlLmRlc2NyaWJlVGFicyA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImRlc2NyaWJlVGFic1wiLCB7fSwgWyBTY2hlbWFzLkRlc2NyaWJlVGFiU2V0UmVzdWx0IF0sIGNhbGxiYWNrKTtcclxufTtcclxuU2NoZW1hcy5EZXNjcmliZVRhYlNldFJlc3VsdCA9IHtcclxuICBsYWJlbDogJ3N0cmluZycsXHJcbiAgbG9nb1VybDogJ3N0cmluZycsXHJcbiAgbmFtZXNwYWNlOiAnc3RyaW5nJyxcclxuICBzZWxlY3RlZDogJ2Jvb2xlYW4nLFxyXG4gIHRhYnM6IFt7XHJcbiAgICBjb2xvcnM6IFt7XHJcbiAgICAgIHRoZW1lOiAnc3RyaW5nJyxcclxuICAgICAgY29sb3I6ICdzdHJpbmcnLFxyXG4gICAgICBjb250ZXh0OiAnc3RyaW5nJ1xyXG4gICAgfV0sXHJcbiAgICBpY29uVXJsOiAnc3RyaW5nJyxcclxuICAgIGljb25zOiBbe1xyXG4gICAgICB0aGVtZTogJ3N0cmluZycsXHJcbiAgICAgIGhlaWdodDogJ251bWJlcicsXHJcbiAgICAgIHdpZHRoOiAnbnVtYmVyJyxcclxuICAgICAgdXJsOiAnc3RyaW5nJyxcclxuICAgICAgY29udGVudFR5cGU6ICdzdHJpbmcnXHJcbiAgICB9XSxcclxuICAgIGxhYmVsOiAnc3RyaW5nJyxcclxuICAgIGN1c3RvbTogJ2Jvb2xlYW4nLFxyXG4gICAgbWluaUljb25Vcmw6ICdzdHJpbmcnLFxyXG4gICAgbmFtZTogJ3N0cmluZycsXHJcbiAgICBzb2JqZWN0TmFtZTogJ3N0cmluZycsXHJcbiAgICB1cmw6ICdzdHJpbmcnXHJcbiAgfV1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXRyaWV2ZXMgdGhlIGN1cnJlbnQgc3lzdGVtIHRpbWVzdGFtcCAoQ29vcmRpbmF0ZWQgVW5pdmVyc2FsIFRpbWUgKFVUQykgdGltZSB6b25lKSBmcm9tIHRoZSBBUElcclxuICpcclxuICogQHR5cGVkZWYgU29hcEFwaX5TZXJ2ZXJUaW1lc3RhbXBSZXN1bHRcclxuICogQHByb3Age1N0cmluZ30gdGltZXN0YW1wIC0gVGltZXN0YW1wXHJcbiAqL1xyXG4vKipcclxuICogQHBhcmFtIHtDYWxsYmFjay48U29hcEFwaX5TZXJ2ZXJUaW1lc3RhbXBSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPFNvYXBBcGl+U2VydmVyVGltZXN0YW1wUmVzdWx0Pn1cclxuICovXHJcblNvYXBBcGkucHJvdG90eXBlLmdldFNlcnZlclRpbWVzdGFtcCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImdldFNlcnZlclRpbWVzdGFtcFwiLCB7fSwgU2NoZW1hcy5HZXRTZXJ2ZXJUaW1lc3RhbXBSZXN1bHQsIGNhbGxiYWNrKTtcclxufTtcclxuU2NoZW1hcy5HZXRTZXJ2ZXJUaW1lc3RhbXBSZXN1bHQgPSB7XHJcbiAgdGltZXN0YW1wOiAnc3RyaW5nJ1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIFNvYXBBcGl+VXNlckluZm9SZXN1bHRcclxuICogQHByb3Age0Jvb2xlYW59IGFjY2Vzc2liaWxpdHlNb2RlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGN1cnJlbmN5U3ltYm9sXHJcbiAqIEBwcm9wIHtOdW1iZXJ9IG9yZ0F0dGFjaG1lbnRGaWxlU2l6ZUxpbWl0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IG9yZ0RlZmF1bHRDdXJyZW5jeUlzb0NvZGVcclxuICogQHByb3Age1N0cmluZ30gb3JnRGlzYWxsb3dIdG1sQXR0YWNobWVudHNcclxuICogQHByb3Age0Jvb2xlYW59IG9yZ0hhc1BlcnNvbkFjY291bnRzXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG9yZ2FuaXphdGlvbklkXHJcbiAqIEBwcm9wIHtCb29sZWFufSBvcmdhbml6YXRpb25NdWx0aUN1cnJlbmN5XHJcbiAqIEBwcm9wIHtTdHJpbmd9IG9yZ2FuaXphdGlvbk5hbWVcclxuICogQHByb3Age1N0cmluZ30gcHJvZmlsZUlkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHJvbGVJZFxyXG4gKiBAcHJvcCB7TnVtYmVyfSBzZXNzaW9uU2Vjb25kc1ZhbGlkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVzZXJEZWZhdWx0Q3VycmVuY3lJc29Db2RlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVzZXJFbWFpbFxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyRnVsbE5hbWVcclxuICogQHByb3Age1N0cmluZ30gdXNlcklkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVzZXJMYW5ndWFnZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyTG9jYWxlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVzZXJOYW1lXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVzZXJUaW1lWm9uZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyVHlwZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyVWlTa2luXHJcbiAqL1xyXG4vKipcclxuICogUmV0cmlldmVzIHBlcnNvbmFsIGluZm9ybWF0aW9uIGZvciB0aGUgdXNlciBhc3NvY2lhdGVkIHdpdGggdGhlIGN1cnJlbnQgc2Vzc2lvblxyXG4gKlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxTb2FwQXBpflVzZXJJbmZvUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTb2FwQXBpflVzZXJJbmZvUmVzdWx0Pn1cclxuICovXHJcblNvYXBBcGkucHJvdG90eXBlLmdldFVzZXJJbmZvID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwiZ2V0VXNlckluZm9cIiwge30sIFNjaGVtYXMuR2V0VXNlckluZm9SZXN1bHQsIGNhbGxiYWNrKTtcclxufTtcclxuU2NoZW1hcy5HZXRVc2VySW5mb1Jlc3VsdCA9IHtcclxuICBhY2Nlc3NpYmlsaXR5TW9kZTogJ2Jvb2xlYW4nLFxyXG4gIGN1cnJlbmN5U3ltYm9sOiAnc3RyaW5nJyxcclxuICBvcmdBdHRhY2htZW50RmlsZVNpemVMaW1pdDogJ251bWJlcicsXHJcbiAgb3JnRGVmYXVsdEN1cnJlbmN5SXNvQ29kZTogJ3N0cmluZycsXHJcbiAgb3JnRGlzYWxsb3dIdG1sQXR0YWNobWVudHM6ICdib29sZWFuJyxcclxuICBvcmdIYXNQZXJzb25BY2NvdW50czogJ2Jvb2xlYW4nLFxyXG4gIG9yZ2FuaXphdGlvbklkOiAnc3RyaW5nJyxcclxuICBvcmdhbml6YXRpb25NdWx0aUN1cnJlbmN5OiAnYm9vbGVhbicsXHJcbiAgb3JnYW5pemF0aW9uTmFtZTogJ3N0cmluZycsXHJcbiAgcHJvZmlsZUlkOiAnc3RyaW5nJyxcclxuICByb2xlSWQ6ICdzdHJpbmcnLFxyXG4gIHNlc3Npb25TZWNvbmRzVmFsaWQ6ICdudW1iZXInLFxyXG4gIHVzZXJEZWZhdWx0Q3VycmVuY3lJc29Db2RlOiAnc3RyaW5nJyxcclxuICB1c2VyRW1haWw6ICdzdHJpbmcnLFxyXG4gIHVzZXJGdWxsTmFtZTogJ3N0cmluZycsXHJcbiAgdXNlcklkOiAnc3RyaW5nJyxcclxuICB1c2VyTGFuZ3VhZ2U6ICdzdHJpbmcnLFxyXG4gIHVzZXJMb2NhbGU6ICdzdHJpbmcnLFxyXG4gIHVzZXJOYW1lOiAnc3RyaW5nJyxcclxuICB1c2VyVGltZVpvbmU6ICdzdHJpbmcnLFxyXG4gIHVzZXJUeXBlOiAnc3RyaW5nJyxcclxuICB1c2VyVWlTa2luOiAnc3RyaW5nJ1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFNldHMgdGhlIHNwZWNpZmllZCB1c2Vy4oCZcyBwYXNzd29yZCB0byB0aGUgc3BlY2lmaWVkIHZhbHVlXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VySWQgLSBVc2VyIElkIHRvIHNldCBwYXNzd29yZFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzc3dvcmQgLSBOZXcgcGFzc3dvcmRcclxuICogQHBhcmFtIHtDYWxsYmFjay48U3RyaW5nPn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTdHJpbmc+fVxyXG4gKi9cclxuU29hcEFwaS5wcm90b3R5cGUuc2V0UGFzc3dvcmQgPSBmdW5jdGlvbih1c2VySWQsIHBhc3N3b3JkLCBjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJzZXRQYXNzd29yZFwiLCB7IHVzZXJJZDogdXNlcklkLCBwYXNzd29yZDogcGFzc3dvcmQgfSwgY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIFNvYXBBcGl+UmVzZXRQYXNzd29yZFJlc3VsdFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBwYXNzd29yZFxyXG4gKi9cclxuLyoqXHJcbiAqIFJlc2V0cyB0aGUgc3BlY2lmaWVkIHVzZXLigJlzIHBhc3N3b3JkXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VySWQgLSBVc2VyIElkIHRvIHNldCBwYXNzd29yZFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzc3dvcmQgLSBOZXcgcGFzc3dvcmRcclxuICogQHBhcmFtIHtDYWxsYmFjay48U29hcEFwaX5SZXNldFBhc3N3b3JkUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTb2FwQXBpflJlc2V0UGFzc3dvcmRSZXN1bHQ+fVxyXG4gKi9cclxuU29hcEFwaS5wcm90b3R5cGUucmVzZXRQYXNzd29yZCA9IGZ1bmN0aW9uKHVzZXJJZCwgY2FsbGJhY2spIHtcclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwicmVzZXRQYXNzd29yZFwiLCB7IHVzZXJJZDogdXNlcklkIH0sIGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLypcclxuICogUmVnaXN0ZXIgaG9vayBpbiBjb25uZWN0aW9uIGluc3RhbnRpYXRpb24gZm9yIGR5bmFtaWNhbGx5IGFkZGluZyB0aGlzIEFQSSBtb2R1bGUgZmVhdHVyZXNcclxuICovXHJcbmpzZm9yY2Uub24oJ2Nvbm5lY3Rpb246bmV3JywgZnVuY3Rpb24oY29ubikge1xyXG4gIGNvbm4uc29hcCA9IG5ldyBTb2FwQXBpKGNvbm4pO1xyXG59KTtcclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNvYXBBcGk7XHJcbiIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhbiBgQXJyYXlgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDAuMS4wXG4gKiBAdHlwZSB7RnVuY3Rpb259XG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCxcbiAqICBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNBcnJheShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcnJheShkb2N1bWVudC5ib2R5LmNoaWxkcmVuKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc0FycmF5KCdhYmMnKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc0FycmF5KF8ubm9vcCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheTtcbiJdfQ==
