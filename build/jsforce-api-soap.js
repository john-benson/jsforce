(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Soap = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @file Salesforce SOAP API
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var _ = window.jsforce.require('lodash/core');
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
  var schema = _.isArray(leadConverts) ? [ Schemas.LeadConvertResult ] : Schemas.LeadConvertResult;
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
  var schema = _.isArray(mergeRequests) ? [ Schemas.MergeResult ] : Schemas.MergeResult;
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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL3NvYXAuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcclxuICogQGZpbGUgU2FsZXNmb3JjZSBTT0FQIEFQSVxyXG4gKiBAYXV0aG9yIFNoaW5pY2hpIFRvbWl0YSA8c2hpbmljaGkudG9taXRhQGdtYWlsLmNvbT5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgXyA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJ2xvZGFzaC9jb3JlJyk7XHJcbnZhciBqc2ZvcmNlID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9jb3JlJyk7XHJcbnZhciBTT0FQID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnLi9zb2FwJyk7XHJcblxyXG4vKipcclxuICogQVBJIGNsYXNzIGZvciBQYXJ0bmVyIFNPQVAgY2FsbFxyXG4gKlxyXG4gKiBAY2xhc3NcclxuICogQHBhcmFtIHtDb25uZWN0aW9ufSBjb25uIC0gQ29ubmVjdGlvblxyXG4gKi9cclxudmFyIFNvYXBBcGkgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbm4pIHtcclxuICB0aGlzLl9jb25uID0gY29ubjtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYWxsIFNPQVAgQXBpIChQYXJ0bmVyKSBlbmRwb2ludFxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuU29hcEFwaS5wcm90b3R5cGUuX2ludm9rZSA9IGZ1bmN0aW9uKG1ldGhvZCwgbWVzc2FnZSwgc2NoZW1hLCBjYWxsYmFjaykge1xyXG4gIHZhciBzb2FwRW5kcG9pbnQgPSBuZXcgU09BUCh0aGlzLl9jb25uLCB7XHJcbiAgICB4bWxuczogXCJ1cm46cGFydG5lci5zb2FwLnNmb3JjZS5jb21cIixcclxuICAgIGVuZHBvaW50VXJsOiB0aGlzLl9jb25uLmluc3RhbmNlVXJsICsgXCIvc2VydmljZXMvU29hcC91L1wiICsgdGhpcy5fY29ubi52ZXJzaW9uXHJcbiAgfSk7XHJcbiAgcmV0dXJuIHNvYXBFbmRwb2ludC5pbnZva2UobWV0aG9kLCBtZXNzYWdlLCB7IHJlc3VsdDogc2NoZW1hIH0pLnRoZW4oZnVuY3Rpb24ocmVzKSB7XHJcbiAgICByZXR1cm4gcmVzLnJlc3VsdDtcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyogKi9cclxudmFyIFNjaGVtYXMgPSB7fTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpfkxlYWRDb252ZXJ0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IGNvbnZlcnRlZFN0YXR1cyAtIFN0YXR1cyBvZiBjb252ZXJ0ZWQgbGVhZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBsZWFkSWQgLSBMZWFkIHJlY29yZCBJZCB0byBjb252ZXJ0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IFthY2NvdW50SWRdIC0gQWNjb3VudCByZWNvcmQgSWQgdG8gYXNzaWduIHRoZSBjb252ZXJ0ZWQgcmVjb3JkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFtjb250YWN0SWRdIC0gQ29udGFjdCByZWNvcmQgSWQgdG8gYXNzaWduIHRoZSBjb252ZXJ0ZWQgcmVjb3JkXHJcbiAqIEBwcm9wIHtCb29sZWFufSBbZG9Ob3RDcmVhdGVPcHBvcnR1bml0eV0gLSBUcnVlIGlmIHlvdSBkb24ndCB3YW50IHRvIGNyZWF0ZSBhIG5ldyBvcHBvcnR1bml0eVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBbb3Bwb3J0dW5pdHlOYW1lXSAtIE5hbWUgb2Ygb3Bwb3J0dW5pdHkgdG8gY3JlYXRlXHJcbiAqIEBwcm9wIHtCb29sZWFufSBbb3ZlcndyaXRlTGVhZFNvdXJjZV0gLSBUcnVlIGlmIG92ZXJ3cml0aW5nIGxlYWQgc291cmNlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFtvd25lcklkXSAtIE93bmVyIElkXHJcbiAqIEBwcm9wIHtCb29sZWFufSBbc2VuZE5vdGlmaWNhdGlvbkVtYWlsXSAtIFRydWUgaWYgc2VuZCBub3RpZmljYXRpb24gZW1haWxcclxuICovXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpfkxlYWRDb252ZXJ0UmVzdWx0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IGxlYWRJZCAtIExlYWQgcmVjb3JkIElkIHRvIGNvbnZlcnRcclxuICogQHByb3Age1N0cmluZ30gW2FjY291bnRJZF0gLSBBY2NvdW50IHJlY29yZCBJZCBvZiBjb252ZXJ0ZWQgbGVhZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBbY29udGFjdElkXSAtIENvbnRhY3QgcmVjb3JkIElkIG9mIGNvbnZlcnRlZCBsZWFkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFtvcHBvcnR1bml0eUlkXSAtIE9wcG9ydHVuaXR5IHJlY29yZCBJZCBjcmVhdGVkIGluIGNvbnZlcnNpb25cclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBUcnVlIGlmIHN1Y2Nlc3NmdWxseSBjb252ZXJ0ZWRcclxuICogQHByb3Age0FycmF5LjxPYmplY3Q+fSBlcnJvcnMgLSBFcnJvclxyXG4gKi9cclxuLyoqXHJcbiAqIENvbnZlcnRzIGEgTGVhZCBpbnRvIGFuIEFjY291bnQsIENvbnRhY3QsIG9yIChvcHRpb25hbGx5KSBhbiBPcHBvcnR1bml0eS5cclxuICpcclxuICogQHBhcmFtIHtTb2FwQXBpfkxlYWRDb252ZXJ0fEFycmF5LjxTb2FwQXBpfkxlYWRDb252ZXJ0Pn0gbGVhZENvbnZlcnRzXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFNvYXBBcGl+TGVhZENvbnZlcnRSZXN1bHR8QXJyYXkuPFNvYXBBcGl+TGVhZENvbnZlcnRSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTb2FwQXBpfkxlYWRDb252ZXJ0UmVzdWx0fEFycmF5LjxTb2FwQXBpfkxlYWRDb252ZXJ0UmVzdWx0Pj59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5jb252ZXJ0TGVhZCA9IGZ1bmN0aW9uKGxlYWRDb252ZXJ0cywgY2FsbGJhY2spIHtcclxuICB2YXIgc2NoZW1hID0gXy5pc0FycmF5KGxlYWRDb252ZXJ0cykgPyBbIFNjaGVtYXMuTGVhZENvbnZlcnRSZXN1bHQgXSA6IFNjaGVtYXMuTGVhZENvbnZlcnRSZXN1bHQ7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImNvbnZlcnRMZWFkXCIsIHsgbGVhZENvbnZlcnRzOiBsZWFkQ29udmVydHMgfSwgc2NoZW1hLCBjYWxsYmFjayk7XHJcbn07XHJcblNjaGVtYXMuTGVhZENvbnZlcnRSZXN1bHQgPSB7XHJcbiAgc3VjY2VzczogJ2Jvb2xlYW4nLFxyXG4gIGVycm9yczogW10sXHJcbiAgbGVhZElkOiAnc3RyaW5nJyxcclxuICBhY2NvdW50SWQ6ICdzdHJpbmcnLFxyXG4gIGNvbnRhY3RJZDogJ3N0cmluZycsXHJcbiAgb3Bwb3J0dW5pdHlJZDogJ3N0cmluZydcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpfk1lcmdlUmVxdWVzdFxyXG4gKiBAcHJvcCB7T2JqZWN0fSBtYXN0ZXJSZWNvcmQgLSBUaGUgbWVyZ2UgZGVzdGluYXRpb24gcmVjb3JkXHJcbiAqIEBwcm9wIHtBcnJheS48U3RyaW5nPn0gcmVjb3JkVG9NZXJnZUlkcyAtIElkcyBvZiByZWNvcmRzIHRvIG1lcmdlXHJcbiAqL1xyXG4vKipcclxuICogQHR5cGVkZWYgU29hcEFwaX5NZXJnZVJlc3VsdFxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gc3VjY2VzcyAtIFRydWUgaWYgc3VjY2Vzc2Z1bGx5IG1lcmdlZFxyXG4gKiBAcHJvcCB7QXJyYXkuPE9iamVjdD59IGVycm9ycyAtIEVycm9yXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGlkIC0gSUQgb2YgdGhlIG1hc3RlciByZWNvcmRcclxuICogQHByb3Age0FycmF5LjxTdHJpbmc+fSBtZXJnZWRSZWNvcmRJZHMgLSBJRCBvZiB0aGUgcmVjb3JkcyB0aGF0IHdlcmUgbWVyZ2VkIGludG8gdGhlIG1hc3RlciByZWNvcmRcclxuICogQHByb3Age0FycmF5LjxTdHJpbmc+fSB1cGRhdGVkUmVsYXRlZElkcyAtIElEIG9mIGFsbCByZWxhdGVkIHJlY29yZHMgdGhhdCB3ZXJlIG1vdmVkIChyZS1wYXJlbnRlZCkgYXMgYSByZXN1bHQgb2YgdGhlIG1lcmdlXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIE1lcmdlIHVwIHRvIHRocmVlIHJlY29yZHMgaW50byBvbmVcclxuICpcclxuICogQHBhcmFtIHtTb2FwQXBpfk1lcmdlUmVxdWVzdHxBcnJheS48U29hcEFwaX5NZXJnZVJlcXVlc3Q+fSBtZXJnZVJlcXVlc3RzXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFNvYXBBcGl+TWVyZ2VSZXN1bHR8QXJyYXkuPFNvYXBBcGl+TWVyZ2VSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTb2FwQXBpfk1lcmdlUmVzdWx0fEFycmF5LjxTb2FwQXBpfk1lcmdlUmVzdWx0Pj59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5tZXJnZSA9IGZ1bmN0aW9uKG1lcmdlUmVxdWVzdHMsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIHNjaGVtYSA9IF8uaXNBcnJheShtZXJnZVJlcXVlc3RzKSA/IFsgU2NoZW1hcy5NZXJnZVJlc3VsdCBdIDogU2NoZW1hcy5NZXJnZVJlc3VsdDtcclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwibWVyZ2VcIiwgeyBtZXJnZVJlcXVlc3RzOiBtZXJnZVJlcXVlc3RzIH0sIHNjaGVtYSwgY2FsbGJhY2spO1xyXG59O1xyXG5TY2hlbWFzLk1lcmdlUmVzdWx0ID0ge1xyXG4gIHN1Y2Nlc3M6ICdib29sZWFuJyxcclxuICBlcnJvcnM6IFtdLFxyXG4gIGlkOiAnc3RyaW5nJyxcclxuICBtZXJnZWRSZWNvcmRJZHM6IFsnc3RyaW5nJ10sXHJcbiAgdXBkYXRlZFJlbGF0ZWRJZHM6IFsnc3RyaW5nJ11cclxufTtcclxuXHJcblxyXG4vKipcclxuICogQHR5cGVkZWYgU29hcEFwaX5FbXB0eVJlY3ljbGVCaW5SZXN1bHRcclxuICogQHByb3Age1N0cmluZ30gaWQgLSBJRCBvZiBhbiBzT2JqZWN0IHRoYXQgeW91IGF0dGVtcHRlZCB0byBkZWxldGUgZnJvbSB0aGUgUmVjeWNsZSBCaW5cclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBXaGV0aGVyIHRoZSBjYWxsIHN1Y2NlZWRlZCAodHJ1ZSkgb3Igbm90IChmYWxzZSkgZm9yIHRoaXMgcmVjb3JkXHJcbiAqIEBwcm9wIHtBcnJheS48T2JqZWN0Pn0gZXJyb3JzIC0gRXJyb3JzXHJcbiAqL1xyXG4vKipcclxuICogRGVsZXRlIHJlY29yZHMgZnJvbSB0aGUgcmVjeWNsZSBiaW4gaW1tZWRpYXRlbHlcclxuICpcclxuICogQHBhcmFtIHtBcnJheS48U3RyaW5nPn0gaWRzIC0gUmVjb3JkIGlkcyB0byBlbXB0eSBmcm9tIHJlY3ljbGUgYmluXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPEFycmF5LjxTb2FwQXBpfkVtcHR5UmVjeWNsZUJpblJlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFycmF5LjxTb2FwQXBpfkVtcHR5UmVjeWNsZUJpblJlc3VsdD4+fVxyXG4gKi9cclxuU29hcEFwaS5wcm90b3R5cGUuZW1wdHlSZWN5Y2xlQmluID0gZnVuY3Rpb24oaWRzLCBjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJlbXB0eVJlY3ljbGVCaW5cIiwgeyBpZHM6IGlkcyB9LCBbIFNjaGVtYXMuRW1wdHlSZWN5Y2xlQmluUmVzdWx0IF0sIGNhbGxiYWNrKTtcclxufTtcclxuU2NoZW1hcy5FbXB0eVJlY3ljbGVCaW5SZXN1bHQgPSB7XHJcbiAgaWQ6ICdzdHJpbmcnLFxyXG4gIHN1Y2Nlc3M6ICdib29sZWFuJyxcclxuICBlcnJvcnM6IFtdXHJcbn07XHJcblxyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIFNvYXBBcGl+RGVzY3JpYmVUYWJTZXRSZXN1bHRcclxuICogQHByb3Age1N0cmluZ30gbGFiZWwgLSBUaGUgZGlzcGxheSBsYWJlbCBmb3IgdGhpcyBzdGFuZGFyZCBvciBjdXN0b20gYXBwXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGxvZ29VcmwgLSBBIGZ1bGx5IHF1YWxpZmllZCBVUkwgdG8gdGhlIGxvZ28gaW1hZ2UgYXNzb2NpYXRlZCB3aXRoIHRoZSBzdGFuZGFyZCBvciBjdXN0b20gYXBwXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG5hbWVzcGFjZSAtIE5hbWVzcGFjZSBvZiBhcHBsaWNhdGlvbiBwYWNrYWdlXHJcbiAqIEBwcm9wIHtCb29sZWFufSBzZWxlY3RlZCAtIElmIHRydWUsIHRoZW4gdGhpcyBzdGFuZGFyZCBvciBjdXN0b20gYXBwIGlzIHRoZSB1c2Vy4oCZcyBjdXJyZW50bHkgc2VsZWN0ZWQgYXBwXHJcbiAqIEBwcm9wIHtBcnJheS48U29hcEFwaX5EZXNjcmliZVRhYj59IHRhYnMgLSBBbiBhcnJheSBvZiB0YWJzIHRoYXQgYXJlIGRpc3BsYXllZCBmb3IgdGhlIHNwZWNpZmllZCBzdGFuZGFyZCBhcHAgb3IgY3VzdG9tIGFwcFxyXG4gKi9cclxuLyoqXHJcbiAqIEB0eXBlZGVmIFNvYXBBcGl+RGVzY3JpYmVUYWJcclxuICogQHByb3Age0FycmF5LjxPYmplY3Q+fSBjb2xvcnMgLSBBcnJheSBvZiBjb2xvciBpbmZvcm1hdGlvbiB1c2VkIGZvciBhIHRhYlxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gY3VzdG9tIC0gdHJ1ZSBpZiB0aGlzIGlzIGEgY3VzdG9tIHRhYlxyXG4gKiBAcHJvcCB7U3RyaW5nfSBpY29uVXJsIC0gVGhlIFVSTCBmb3IgdGhlIG1haW4gMzIgeCAzMiBwaXhlbCBpY29uIGZvciBhIHRhYlxyXG4gKiBAcHJvcCB7QXJyYXkuPE9iamVjdD59IGljb25zIC0gQXJyYXkgb2YgaWNvbiBpbmZvcm1hdGlvbiB1c2VkIGZvciBhIHRhYlxyXG4gKiBAcHJvcCB7U3RyaW5nfSBsYWJlbCAtIFRoZSBkaXNwbGF5IGxhYmVsIGZvciB0aGlzIHRhYlxyXG4gKiBAcHJvcCB7U3RyaW5nfSBtaW5pSWNvblVybCAtIFRoZSBVUkwgZm9yIHRoZSAxNiB4IDE2IHBpeGVsIGljb24gdGhhdCByZXByZXNlbnRzIGEgdGFiXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG5hbWUgLSBUaGUgQVBJIG5hbWUgb2YgdGhlIHRhYlxyXG4gKiBAcHJvcCB7U3RyaW5nfSBzb2JqZWN0TmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBzT2JqZWN0IHRoYXQgaXMgcHJpbWFyaWx5IGRpc3BsYXllZCBvbiB0aGlzIHRhYlxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1cmwgLSBBIGZ1bGx5IHF1YWxpZmllZCBVUkwgZm9yIHZpZXdpbmcgdGhpcyB0YWJcclxuICovXHJcbi8qKlxyXG4gKiBSZXR1cm5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSBzdGFuZGFyZCBhbmQgY3VzdG9tIGFwcHMgYXZhaWxhYmxlIHRvIHRoZSBsb2dnZWQtaW4gdXNlclxyXG4gKlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxBcnJheS48U29hcEFwaX5EZXNjcmliZVRhYlNldFJlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFycmF5LjxTb2FwQXBpfkRlc2NyaWJlVGFiU2V0UmVzdWx0Pj59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5kZXNjcmliZVRhYnMgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJkZXNjcmliZVRhYnNcIiwge30sIFsgU2NoZW1hcy5EZXNjcmliZVRhYlNldFJlc3VsdCBdLCBjYWxsYmFjayk7XHJcbn07XHJcblNjaGVtYXMuRGVzY3JpYmVUYWJTZXRSZXN1bHQgPSB7XHJcbiAgbGFiZWw6ICdzdHJpbmcnLFxyXG4gIGxvZ29Vcmw6ICdzdHJpbmcnLFxyXG4gIG5hbWVzcGFjZTogJ3N0cmluZycsXHJcbiAgc2VsZWN0ZWQ6ICdib29sZWFuJyxcclxuICB0YWJzOiBbe1xyXG4gICAgY29sb3JzOiBbe1xyXG4gICAgICB0aGVtZTogJ3N0cmluZycsXHJcbiAgICAgIGNvbG9yOiAnc3RyaW5nJyxcclxuICAgICAgY29udGV4dDogJ3N0cmluZydcclxuICAgIH1dLFxyXG4gICAgaWNvblVybDogJ3N0cmluZycsXHJcbiAgICBpY29uczogW3tcclxuICAgICAgdGhlbWU6ICdzdHJpbmcnLFxyXG4gICAgICBoZWlnaHQ6ICdudW1iZXInLFxyXG4gICAgICB3aWR0aDogJ251bWJlcicsXHJcbiAgICAgIHVybDogJ3N0cmluZycsXHJcbiAgICAgIGNvbnRlbnRUeXBlOiAnc3RyaW5nJ1xyXG4gICAgfV0sXHJcbiAgICBsYWJlbDogJ3N0cmluZycsXHJcbiAgICBjdXN0b206ICdib29sZWFuJyxcclxuICAgIG1pbmlJY29uVXJsOiAnc3RyaW5nJyxcclxuICAgIG5hbWU6ICdzdHJpbmcnLFxyXG4gICAgc29iamVjdE5hbWU6ICdzdHJpbmcnLFxyXG4gICAgdXJsOiAnc3RyaW5nJ1xyXG4gIH1dXHJcbn07XHJcblxyXG4vKipcclxuICogUmV0cmlldmVzIHRoZSBjdXJyZW50IHN5c3RlbSB0aW1lc3RhbXAgKENvb3JkaW5hdGVkIFVuaXZlcnNhbCBUaW1lIChVVEMpIHRpbWUgem9uZSkgZnJvbSB0aGUgQVBJXHJcbiAqXHJcbiAqIEB0eXBlZGVmIFNvYXBBcGl+U2VydmVyVGltZXN0YW1wUmVzdWx0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IHRpbWVzdGFtcCAtIFRpbWVzdGFtcFxyXG4gKi9cclxuLyoqXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFNvYXBBcGl+U2VydmVyVGltZXN0YW1wUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxTb2FwQXBpflNlcnZlclRpbWVzdGFtcFJlc3VsdD59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5nZXRTZXJ2ZXJUaW1lc3RhbXAgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJnZXRTZXJ2ZXJUaW1lc3RhbXBcIiwge30sIFNjaGVtYXMuR2V0U2VydmVyVGltZXN0YW1wUmVzdWx0LCBjYWxsYmFjayk7XHJcbn07XHJcblNjaGVtYXMuR2V0U2VydmVyVGltZXN0YW1wUmVzdWx0ID0ge1xyXG4gIHRpbWVzdGFtcDogJ3N0cmluZydcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpflVzZXJJbmZvUmVzdWx0XHJcbiAqIEBwcm9wIHtCb29sZWFufSBhY2Nlc3NpYmlsaXR5TW9kZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBjdXJyZW5jeVN5bWJvbFxyXG4gKiBAcHJvcCB7TnVtYmVyfSBvcmdBdHRhY2htZW50RmlsZVNpemVMaW1pdFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBvcmdEZWZhdWx0Q3VycmVuY3lJc29Db2RlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG9yZ0Rpc2FsbG93SHRtbEF0dGFjaG1lbnRzXHJcbiAqIEBwcm9wIHtCb29sZWFufSBvcmdIYXNQZXJzb25BY2NvdW50c1xyXG4gKiBAcHJvcCB7U3RyaW5nfSBvcmdhbml6YXRpb25JZFxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gb3JnYW5pemF0aW9uTXVsdGlDdXJyZW5jeVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBvcmdhbml6YXRpb25OYW1lXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHByb2ZpbGVJZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSByb2xlSWRcclxuICogQHByb3Age051bWJlcn0gc2Vzc2lvblNlY29uZHNWYWxpZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyRGVmYXVsdEN1cnJlbmN5SXNvQ29kZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyRW1haWxcclxuICogQHByb3Age1N0cmluZ30gdXNlckZ1bGxOYW1lXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHVzZXJJZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyTGFuZ3VhZ2VcclxuICogQHByb3Age1N0cmluZ30gdXNlckxvY2FsZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyTmFtZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSB1c2VyVGltZVpvbmVcclxuICogQHByb3Age1N0cmluZ30gdXNlclR5cGVcclxuICogQHByb3Age1N0cmluZ30gdXNlclVpU2tpblxyXG4gKi9cclxuLyoqXHJcbiAqIFJldHJpZXZlcyBwZXJzb25hbCBpbmZvcm1hdGlvbiBmb3IgdGhlIHVzZXIgYXNzb2NpYXRlZCB3aXRoIHRoZSBjdXJyZW50IHNlc3Npb25cclxuICpcclxuICogQHBhcmFtIHtDYWxsYmFjay48U29hcEFwaX5Vc2VySW5mb1Jlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48U29hcEFwaX5Vc2VySW5mb1Jlc3VsdD59XHJcbiAqL1xyXG5Tb2FwQXBpLnByb3RvdHlwZS5nZXRVc2VySW5mbyA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImdldFVzZXJJbmZvXCIsIHt9LCBTY2hlbWFzLkdldFVzZXJJbmZvUmVzdWx0LCBjYWxsYmFjayk7XHJcbn07XHJcblNjaGVtYXMuR2V0VXNlckluZm9SZXN1bHQgPSB7XHJcbiAgYWNjZXNzaWJpbGl0eU1vZGU6ICdib29sZWFuJyxcclxuICBjdXJyZW5jeVN5bWJvbDogJ3N0cmluZycsXHJcbiAgb3JnQXR0YWNobWVudEZpbGVTaXplTGltaXQ6ICdudW1iZXInLFxyXG4gIG9yZ0RlZmF1bHRDdXJyZW5jeUlzb0NvZGU6ICdzdHJpbmcnLFxyXG4gIG9yZ0Rpc2FsbG93SHRtbEF0dGFjaG1lbnRzOiAnYm9vbGVhbicsXHJcbiAgb3JnSGFzUGVyc29uQWNjb3VudHM6ICdib29sZWFuJyxcclxuICBvcmdhbml6YXRpb25JZDogJ3N0cmluZycsXHJcbiAgb3JnYW5pemF0aW9uTXVsdGlDdXJyZW5jeTogJ2Jvb2xlYW4nLFxyXG4gIG9yZ2FuaXphdGlvbk5hbWU6ICdzdHJpbmcnLFxyXG4gIHByb2ZpbGVJZDogJ3N0cmluZycsXHJcbiAgcm9sZUlkOiAnc3RyaW5nJyxcclxuICBzZXNzaW9uU2Vjb25kc1ZhbGlkOiAnbnVtYmVyJyxcclxuICB1c2VyRGVmYXVsdEN1cnJlbmN5SXNvQ29kZTogJ3N0cmluZycsXHJcbiAgdXNlckVtYWlsOiAnc3RyaW5nJyxcclxuICB1c2VyRnVsbE5hbWU6ICdzdHJpbmcnLFxyXG4gIHVzZXJJZDogJ3N0cmluZycsXHJcbiAgdXNlckxhbmd1YWdlOiAnc3RyaW5nJyxcclxuICB1c2VyTG9jYWxlOiAnc3RyaW5nJyxcclxuICB1c2VyTmFtZTogJ3N0cmluZycsXHJcbiAgdXNlclRpbWVab25lOiAnc3RyaW5nJyxcclxuICB1c2VyVHlwZTogJ3N0cmluZycsXHJcbiAgdXNlclVpU2tpbjogJ3N0cmluZydcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTZXRzIHRoZSBzcGVjaWZpZWQgdXNlcuKAmXMgcGFzc3dvcmQgdG8gdGhlIHNwZWNpZmllZCB2YWx1ZVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIC0gVXNlciBJZCB0byBzZXQgcGFzc3dvcmRcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3N3b3JkIC0gTmV3IHBhc3N3b3JkXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFN0cmluZz59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48U3RyaW5nPn1cclxuICovXHJcblNvYXBBcGkucHJvdG90eXBlLnNldFBhc3N3b3JkID0gZnVuY3Rpb24odXNlcklkLCBwYXNzd29yZCwgY2FsbGJhY2spIHtcclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwic2V0UGFzc3dvcmRcIiwgeyB1c2VySWQ6IHVzZXJJZCwgcGFzc3dvcmQ6IHBhc3N3b3JkIH0sIGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiBTb2FwQXBpflJlc2V0UGFzc3dvcmRSZXN1bHRcclxuICogQHByb3Age1N0cmluZ30gcGFzc3dvcmRcclxuICovXHJcbi8qKlxyXG4gKiBSZXNldHMgdGhlIHNwZWNpZmllZCB1c2Vy4oCZcyBwYXNzd29yZFxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIC0gVXNlciBJZCB0byBzZXQgcGFzc3dvcmRcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3N3b3JkIC0gTmV3IHBhc3N3b3JkXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPFNvYXBBcGl+UmVzZXRQYXNzd29yZFJlc3VsdD59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48U29hcEFwaX5SZXNldFBhc3N3b3JkUmVzdWx0Pn1cclxuICovXHJcblNvYXBBcGkucHJvdG90eXBlLnJlc2V0UGFzc3dvcmQgPSBmdW5jdGlvbih1c2VySWQsIGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcInJlc2V0UGFzc3dvcmRcIiwgeyB1c2VySWQ6IHVzZXJJZCB9LCBjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbi8qXHJcbiAqIFJlZ2lzdGVyIGhvb2sgaW4gY29ubmVjdGlvbiBpbnN0YW50aWF0aW9uIGZvciBkeW5hbWljYWxseSBhZGRpbmcgdGhpcyBBUEkgbW9kdWxlIGZlYXR1cmVzXHJcbiAqL1xyXG5qc2ZvcmNlLm9uKCdjb25uZWN0aW9uOm5ldycsIGZ1bmN0aW9uKGNvbm4pIHtcclxuICBjb25uLnNvYXAgPSBuZXcgU29hcEFwaShjb25uKTtcclxufSk7XHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTb2FwQXBpO1xyXG4iXX0=
