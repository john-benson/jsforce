(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.jsforce||(g.jsforce = {}));g=(g.modules||(g.modules = {}));g=(g.api||(g.api = {}));g.Metadata = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,Buffer){
/*global process, Buffer */
/**
 * @file Manages Salesforce Metadata API
 * @author Shinichi Tomita <shinichi.tomita@gmail.com>
 */

'use strict';

var inherits = window.jsforce.require('inherits'),
    events  = window.jsforce.require('events'),
    stream  = window.jsforce.require('readable-stream'),
    _       = window.jsforce.require('lodash/core'),
    jsforce = window.jsforce.require('./core'),
    Promise = window.jsforce.require('./promise'),
    SOAP    = window.jsforce.require('./soap');

/*--------------------------------------------*/
/**
 * Class for Salesforce Metadata API
 *
 * @class
 * @param {Connection} conn - Connection object
 */
var Metadata = module.exports = function(conn) {
  this._conn = conn;
};


/**
 * Polling interval in milliseconds
 * @type {Number}
 */
Metadata.prototype.pollInterval = 1000;

/**
 * Polling timeout in milliseconds
 * @type {Number}
 */
Metadata.prototype.pollTimeout = 10000;


/**
 * Call Metadata API SOAP endpoint
 *
 * @private
 */
Metadata.prototype._invoke = function(method, message, callback) {
  var soapEndpoint = new SOAP(this._conn, {
    xmlns: "http://soap.sforce.com/2006/04/metadata",
    endpointUrl: this._conn.instanceUrl + "/services/Soap/m/" + this._conn.version
  });
  return soapEndpoint.invoke(method, message).then(function(res) {
    return res.result;
  }).thenCall(callback);
};


/**
 * @typedef {Object} Metadata~MetadataInfo
 * @prop {String} fullName - The name of the component
 */

/**
 * Asynchronously adds one or more new metadata components to the organization.
 *
 * @param {String} type - The type of metadata to create
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} metadata - Metadata to create
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Metadata~AsyncResultLocator}
 */
Metadata.prototype.createAsync = function(type, metadata, callback) {
  if (Number(this._conn.version) > 30) {
    throw new Error("Async metadata CRUD calls are not supported on ver 31.0 or later.");
  }
  var convert = function(md) {
    md["@xsi:type"] = type;
    return md;
  };
  var isArray = _.isArray(metadata);
  metadata = isArray ? _.map(metadata, convert) : convert(metadata);
  var res = this._invoke("create", { metadata: metadata });
  return new AsyncResultLocator(this, res, isArray).thenCall(callback);
};

/**
 * @typedef {Object} Metadata~SaveResult
 * @prop {Boolean} success - True if metadata is successfully saved
 * @prop {String} fullName - Full name of metadata object
 */

/**
 * @private
 */
function convertToSaveResult(result) {
  var saveResult = _.clone(result);
  saveResult.success = saveResult.success === 'true';
  return saveResult;
}

/**
 * @typedef {Object} Metadata~UpsertResult
 * @prop {Boolean} success - True if metadata is successfully saved
 * @prop {String} fullName - Full name of metadata object
 * @prop {Boolean} created - True if metadata is newly created
 */

/**
 * @private
 */
function convertToUpsertResult(result) {
  var upsertResult = convertToSaveResult(result);
  upsertResult.created = upsertResult.created === 'true';
  return upsertResult;
}

/**
 * Synonym of Metadata#create().
 *
 * @method Metadata#createSync
 * @param {String} type - The type of metadata to create
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} metadata - Metadata to create
 * @param {Callback.<Metadata~SaveResult|Array.<Metadata~SaveResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult|Array.<Metadata~SaveResult>>}
 */
/**
 * Synchronously adds one or more new metadata components to the organization.
 *
 * @method Metadata#create
 * @param {String} type - The type of metadata to create
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} metadata - Metadata to create
 * @param {Callback.<Metadata~SaveResult|Array.<Metadata~SaveResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult|Array.<Metadata~SaveResult>>}
 */
Metadata.prototype.createSync =
Metadata.prototype.create = function(type, metadata, callback) {
  var convert = function(md) {
    md["@xsi:type"] = type;
    return md;
  };
  var isArray = _.isArray(metadata);
  metadata = isArray ? _.map(metadata, convert) : convert(metadata);
  return this._invoke("createMetadata", { metadata: metadata }).then(function(results) {
    return _.isArray(results) ? _.map(results, convertToSaveResult) : convertToSaveResult(results);
  }).thenCall(callback);
};

/**
 * @private
 */
function convertToMetadataInfo(rec) {
  var metadataInfo = _.clone(rec);
  delete metadataInfo.$;
  return metadataInfo;
}

/**
 * Synonym of Metadata#read()
 *
 * @method Metadata#readSync
 * @param {String} type - The type of metadata to read
 * @param {String|Array.<String>} fullNames - full name(s) of metadata objects to read
 * @param {Callback.<Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>>} [callback] - Callback function
 * @returns {Promise.<Array.<Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>>>}
 */
/**
 * Synchronously read specified metadata components in the organization.
 *
 * @method Metadata#read
 * @param {String} type - The type of metadata to read
 * @param {String|Array.<String>} fullNames - full name(s) of metadata objects to read
 * @param {Callback.<Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>>} [callback] - Callback function
 * @returns {Promise.<Array.<Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>>>}
 */
Metadata.prototype.readSync =
Metadata.prototype.read = function(type, fullNames, callback) {
  return this._invoke("readMetadata", { type: type, fullNames: fullNames }).then(function(res) {
    return _.isArray(res.records) ? _.map(res.records, convertToMetadataInfo) : convertToMetadataInfo(res.records);
  }).thenCall(callback);
};

/**
 * @typedef {Object} Metadata~UpdateMetadataInfo
 * @prop {String} currentName - The API name of the component or field before the update
 * @prop {Metadata~MetadataInfo} metadata - Full specification of the component or field you wish to update
 */

/**
 * Asynchronously updates one or more metadata components in the organization.
 *
 * @param {String} type - The type of metadata to update
 * @param {Metadata~UpdateMetadataInfo|Array.<Metadata~UpdateMetadataInfo>} updateMetadata - Updating metadata
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Metadata~AsyncResultLocator}
 */
Metadata.prototype.updateAsync = function(type, updateMetadata, callback) {
  if (Number(this._conn.version) > 30) {
    throw new Error("Async metadata CRUD calls are not supported on ver 31.0 or later.");
  }
  var convert = function(umd) {
    umd.metadata["@xsi:type"] = type;
    return umd;
  };
  var isArray = _.isArray(updateMetadata);
  updateMetadata = isArray ? _.map(updateMetadata, convert) : convert(updateMetadata);
  var res = this._invoke("update", { updateMetadata: updateMetadata });
  return new AsyncResultLocator(this, res, isArray).thenCall(callback);
};

/**
 * Synonym of Metadata#update().
 *
 * @method Metadata#updateSync
 * @param {String} type - The type of metadata to update
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} updateMetadata - Updating metadata
 * @param {Callback.<Metadata~SaveResult|Array.<Metadata~SaveResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult|Array.<Metadata~SaveResult>>}
 */
/**
 * Synchronously updates one or more metadata components in the organization.
 *
 * @method Metadata#update
 * @param {String} type - The type of metadata to update
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} updateMetadata - Updating metadata
 * @param {Callback.<Metadata~SaveResult|Array.<Metadata~SaveResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult|Array.<Metadata~SaveResult>>}
 */
Metadata.prototype.updateSync =
Metadata.prototype.update = function(type, metadata, callback) {
  var convert = function(md) {
    md["@xsi:type"] = type;
    return md;
  };
  var isArray = _.isArray(metadata);
  metadata = isArray ? _.map(metadata, convert) : convert(metadata);
  return this._invoke("updateMetadata", { metadata: metadata }).then(function(results) {
    return _.isArray(results) ? _.map(results, convertToSaveResult) : convertToSaveResult(results);
  }).thenCall(callback);
};

/**
 * Synonym of Metadata#upsert().
 *
 * @method Metadata#upsertSync
 * @param {String} type - The type of metadata to upsert
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} metadata - Upserting metadata
 * @param {Callback.<Metadata~UpsertResult|Array.<Metadata~UpsertResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~UpsertResult|Array.<Metadata~UpsertResult>>}
 */
/**
 * Upserts one or more components in your organization's data.
 *
 * @method Metadata#upsert
 * @param {String} type - The type of metadata to upsert
 * @param {Metadata~MetadataInfo|Array.<Metadata~MetadataInfo>} metadata - Upserting metadata
 * @param {Callback.<Metadata~UpsertResult|Array.<Metadata~UpsertResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~UpsertResult|Array.<Metadata~UpsertResult>>}
 */
Metadata.prototype.upsertSync =
Metadata.prototype.upsert = function(type, metadata, callback) {
  var convert = function(md) {
    md["@xsi:type"] = type;
    return md;
  };
  var isArray = _.isArray(metadata);
  metadata = isArray ? _.map(metadata, convert) : convert(metadata);
  return this._invoke("upsertMetadata", { metadata: metadata }).then(function(results) {
    return _.isArray(results) ? _.map(results, convertToUpsertResult) : convertToUpsertResult(results);
  }).thenCall(callback);
};

/**
 * Asynchronously deletes specified metadata components in the organization.
 *
 * @param {String} type - The type of metadata to delete
 * @param {String|Metadata~MetadataInfo|Array.<String>|Array.<Metadata~MetadataInfo>} metadata - The fullName of metadata or metadata info to delete. If it is passed in fullName, the type parameter should not be empty.
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Metadata~AsyncResultLocator}
 */
Metadata.prototype.deleteAsync = function(type, metadata, callback) {
  if (Number(this._conn.version) > 30) {
    throw new Error("Async metadata CRUD calls are not supported on ver 31.0 or later.");
  }
  var convert = function(md) {
    if (_.isString(md)) {
      md = { fullName : md };
    }
    md["@xsi:type"] = type;
    return md;
  };
  var isArray = _.isArray(metadata);
  metadata = isArray ? _.map(metadata, convert) : convert(metadata);
  var res = this._invoke("delete", { metadata: metadata });
  return new AsyncResultLocator(this, res, isArray).thenCall(callback);
};

/**
 * Synonym of Metadata#delete().
 *
 * @deprecated
 * @method Metadata#del
 * @param {String} [type] - The type of metadata to delete
 * @param {String|Metadata~MetadataInfo|Array.<String>|Array.<Metadata~MetadataInfo>} metadata - The fullName of metadata or metadata info to delete. If it is passed in fullName, the type parameter should not be empty.
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Metadata~AsyncResultLocator}
 */
/**
 * Synonym of Metadata#delete().
 *
 * @method Metadata#deleteSync
 * @param {String} type - The type of metadata to delete
 * @param {String|Array.<String>} fullNames - The fullName of metadata to delete.
 * @param {Callback.<Metadata~SaveResult|Array.<Metadata~SaveResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult|Array.<Metadata~SaveResult>>}
 */

/**
 * Synchronously deletes specified metadata components in the organization.
 *
 * @method Metadata#delete
 * @param {String} type - The type of metadata to delete
 * @param {String|Array.<String>} fullNames - The fullName of metadata to delete.
 * @param {Callback.<Metadata~SaveResult|Array.<Metadata~SaveResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult|Array.<Metadata~SaveResult>>}
 */
Metadata.prototype.del =
Metadata.prototype.deleteSync =
Metadata.prototype["delete"] = function(type, fullNames, callback) {
  return this._invoke("deleteMetadata", { type: type, fullNames: fullNames }).then(function(results) {
    return _.isArray(results) ? _.map(results, convertToSaveResult) : convertToSaveResult(results);
  }).thenCall(callback);
};

/**
 * Rename fullname of a metadata component in the organization
 *
 * @param {String} type - The type of metadata to delete
 * @param {String} oldFullName - The original fullName of metadata
 * @param {String} newFullName - The new fullName of metadata
 * @param {Callback.<Metadata~SaveResult>} [callback] - Callback function
 * @returns {Promise.<Metadata~SaveResult>}
 */
Metadata.prototype.rename = function(type, oldFullName, newFullName, callback) {
  return this._invoke("renameMetadata", { type: type, oldFullName: oldFullName, newFullName: newFullName }).then(function(result) {
    return convertToSaveResult(result);
  }).thenCall(callback);
};

/**
 * Checks the status of asynchronous metadata calls
 *
 * @param {String|Array.<String>} ids - The asynchronous process ID(s)
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Metadata~AsyncResultLocator}
 */
Metadata.prototype.checkStatus = function(ids, callback) {
  var isArray = _.isArray(ids);
  var res = this._invoke("checkStatus", { asyncProcessId: ids });
  return new AsyncResultLocator(this, res, isArray).thenCall(callback);
};

/**
 * @typedef {Object} Metadata~DescribeMetadataResult
 * @prop {Array.<Object>} metadataObjects - One or more metadata components and their attributes
 * @prop {Array.<String>} metadataObjects.childXmlNames - List of child sub-components for this component
 * @prop {String} metadataObjects.directoryName - The name of the directory in the .zip file that contains this component
 * @prop {Boolean} metadataObjects.inFolder - Indicates whether the component is in a folder or not
 * @prop {Boolean} metadataObjects.metaFile - Indicates whether the component requires an accompanying metadata file
 * @prop {String} metadataObjects.suffix - The file suffix for this component
 * @prop {String} metadataObjects.xmlName - The name of the root element in the metadata file for this component
 * @prop {String} organizationNamespace - The namespace of the organization
 * @prop {Boolean} partialSaveAllowed - Indicates whether rollbackOnError is allowed or not
 * @prop {Boolean} testRequired - Indicates whether tests are required or not
 */

/**
 * Retrieves the metadata which describes your organization, including Apex classes and triggers,
 * custom objects, custom fields on standard objects, tab sets that define an app,
 * and many other components.
 *
 * @param {String} [version] - The API version for which you want metadata; for example, 29.0
 * @param {Callback.<Metadata~DescribeMetadataResult>} [callback] - Callback function
 * @returns {Promise.<Metadata~DescribeMetadataResult>}
 */
Metadata.prototype.describe = function(version, callback) {
  if (!_.isString(version)) {
    callback = version;
    version = this._conn.version;
  }
  return this._invoke("describeMetadata", { asOfVersion: version }).then(function(res) {
    res.metadataObjects = _.isArray(res.metadataObjects) ? res.metadataObjects : [ res.metadataObjects ];
    res.metadataObjects = _.map(res.metadataObjects, function(mo) {
      if (mo.childXmlNames) {
        mo.childXmlNames = _.isArray(mo.childXmlNames) ? mo.childXmlNames: [ mo.childXmlNames ];
      }
      mo.inFolder = mo.inFolder === 'true';
      mo.metaFile = mo.metaFile === 'true';
      return mo;
    });
    res.partialSaveAllowed = res.partialSaveAllowed === 'true';
    res.testRequired = res.testRequired === 'true';
    return res;
  }).thenCall(callback);
};

/**
 * @typedef {Object} Metadata~ListMetadataQuery
 * @prop {String} type - The metadata type, such as CustomObject, CustomField, or ApexClass
 * @prop {String} [folder] - The folder associated with the component.
 */

/**
 * @typedef {Object} Metadata~FileProperties
 * @prop {String} type - The metadata type, such as CustomObject, CustomField, or ApexClass
 * @prop {String} createdById - ID of the user who created the file
 * @prop {String} createdByName - Name of the user who created the file
 * @prop {String} createdDate - Date and time when the file was created
 * @prop {String} fileName - Name of the file
 * @prop {String} fullName - The file developer name used as a unique identifier for API access
 * @prop {String} id - ID of the file
 * @prop {String} lastModifiedById - ID of the user who last modified the file
 * @prop {String} lastModifiedByName - Name of the user who last modified the file
 * @prop {String} lastModifiedDate - Date and time that the file was last modified
 * @prop {String} [manageableState] - Indicates the manageable state of the specified component if it is contained in a package
 * @prop {String} [namespacePrefix] - The namespace prefix of the component
 */

/**
 * Retrieves property information about metadata components in your organization
 *
 * @param {Metadata~ListMetadataQuery|Array.<Metadata~ListMetadataQuery>} queries - The criteria object(s) specifing metadata to list
 * @param {String} [version] - The API version for which you want metadata; for example, 29.0
 * @param {Callback.<Array.<Metadata~FileProperties>>} [callback] - Callback function
 * @returns {Promise.<Array.<Metadata~FileProperties>>}
 */
Metadata.prototype.list = function(queries, version, callback) {
  if (!_.isString(version)) {
    callback = version;
    version = this._conn.version;
  }
  if (!_.isArray(queries)) {
    queries = [ queries ];
  }
  return this._invoke("listMetadata", { queries: queries, asOfVersion: version }, callback);
};

/**
 * @typedef {Object} Metadata~RetrieveRequest
 */

/**
 * Retrieves XML file representations of components in an organization
 *
 * @param {Metadata~RetrieveRequest} request - Options for determining which packages or files are retrieved
 * @param {Callback.<Metadata~AsyncResult>} [callback] - Callback function
 * @returns {Metadata~RetrieveResultLocator}
 */
Metadata.prototype.retrieve = function(request, callback) {
  var res = this._invoke("retrieve", { request: request });
  return new RetrieveResultLocator(this, res).thenCall(callback);
};

/**
 * Checks the status of declarative metadata call retrieve() and returns the zip file contents
 *
 * @param {String} id - Async process id returned from previous retrieve request
 * @param {Callback.<Metadata~RetrieveResult>} [callback] - Callback function
 * @returns {Promise.<Metadata~RetrieveResult>}
 */
Metadata.prototype.checkRetrieveStatus = function(id, callback) {
  return this._invoke("checkRetrieveStatus", { asyncProcessId: id }, callback);
};

/**
 * Deploy components into an organization using zipped file representations
 *
 * @param {stream.Stream|Buffer|String} zipInput - Zipped file input source in readable stream, binary buffer or Base64-encoded string
 * @param {Object} [options] - Options used in deployment
 * @param {Boolean} [options.allowMissingFiles] - Specifies whether a deploy succeeds even if files that are specified in package.xml but are not in the .zip file or not.
 * @param {Boolean} [options.autoUpdatePackage] - If a file is in the .zip file but not specified in package.xml, specifies whether the file should be automatically added to the package or not.
 * @param {Boolean} [options.checkOnly] - Indicates whether Apex classes and triggers are saved to the organization as part of the deployment (false) or not (true).
 * @param {Boolean} [options.ignoreWarnings] - Indicates whether a warning should allow a deployment to complete successfully (true) or not (false). Defaults to false.
 * @param {Boolean} [options.performRetrieve] - Indicates whether a retrieve() call is performed immediately after the deployment (true) or not (false).
 * @param {Boolean} [options.purgeOnDelete] - If true, the deleted components in the destructiveChanges.xml manifest file aren't stored in the Recycle Bin.
 * @param {Boolean} [options.rollbackOnError] - Indicates whether any failure causes a complete rollback (true) or not (false).
 * @param {Boolean} [options.runAllTests] - If true, all Apex tests defined in the organization are run.
 * @param {Array.<String>} [options.runTests] - A list of Apex tests to be run during deployment.
 * @param {Boolean} [options.singlePackage] - Indicates whether the specified .zip file points to a directory structure with a single package (true) or a set of packages (false).
 * @param {Callback.<Metadata~AsyncResult>} [callback] - Callback function
 * @returns {Metadata~DeployResultLocator}
 */
Metadata.prototype.deploy = function(zipInput, options, callback) {
  if (!options || _.isFunction(options)) {
    callback = options;
    options = {};
  }
  var deferred = Promise.defer();
  if (_.isObject(zipInput) && _.isFunction(zipInput.pipe)) {
    var bufs = [];
    zipInput.on('data', function(d) {
      bufs.push(d);
    });
    zipInput.on('end', function() {
      deferred.resolve(Buffer.concat(bufs).toString('base64'));
    });
    // zipInput.resume();
  } else if (zipInput instanceof Buffer) {
    deferred.resolve(zipInput.toString('base64'));
  } else if (zipInput instanceof String || typeof zipInput === 'string') {
    deferred.resolve(zipInput);
  } else {
    throw "Unexpected zipInput type";
  }

  var self = this;
  var res = deferred.promise.then(function(zipContentB64) {
    return self._invoke("deploy", {
      ZipFile: zipContentB64,
      DeployOptions: options
    }, callback);
  });
  return new DeployResultLocator(this, res).thenCall(callback);
};

/**
 * Checks the status of declarative metadata call deploy()
 *
 * @param {String} id - Async process id returned from previous deploy request
 * @param {Boolean} [includeDetails] - Sets the DeployResult object to include details information (default: false)
 * @param {Callback.<Metadata~DeployResult>} [callback] - Callback function
 * @returns {Promise.<Metadata~DeployResult>}
 */
Metadata.prototype.checkDeployStatus = function(id, includeDetails, callback) {
  if (_.isObject(includeDetails) || _.isBoolean(includeDetails)) {
    includeDetails = !!includeDetails;
  } else {
    callback = includeDetails;
    includeDetails = false;
  }
  return this._invoke("checkDeployStatus", {
    asyncProcessId: id,
    includeDetails : includeDetails
  }).then(function(res) {
    res.done = res.done === 'true';
    res.success = res.success === 'true';
    res.checkOnly = res.checkOnly === 'true';
    if (res.ignoreWarnings) {
      res.ignoreWarnings = res.ignoreWarnings === 'true';
    }
    if (res.rollbackOnError) {
      res.rollbackOnError = res.rollbackOnError === 'true';
    }
    res.numberComponentErrors = Number(res.numberComponentErrors);
    res.numberComponentsDeployed = Number(res.numberComponentsDeployed);
    res.numberComponentsTotal = Number(res.numberComponentsTotal);
    res.numberTestErrors = Number(res.numberTestErrors);
    res.numberTestsCompleted = Number(res.numberTestsCompleted);
    res.numberTestsTotal = Number(res.numberTestsTotal);

    return res;
  }).thenCall(callback);
};


/*--------------------------------------------*/

/**
 * @typedef {Object} Metadata~AsyncResult
 * @prop {Boolean} done - Indicates whether the call has completed or not
 * @prop {String} id - ID of the component being created, updated, deleted, deployed, or retrieved
 * @prop {String} state - The state four possible values: Queued, InProgress, Completed, and Error.
 * @prop {String} [statusCode] - If an error occurred during the create(), update(), or delete() call, a status code is returned
 * @prop {String} [message] - Message corresponding to the statusCode field returned
 */

/**
 * The locator class for Metadata API asynchronous call result
 *
 * @protected
 * @class Metadata~AsyncResultLocator
 * @extends events.EventEmitter
 * @implements Promise.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>
 * @param {Metadata} meta - Metadata API object
 * @param {Promise.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} results - Promise object for async result info
 * @param {Boolean} [isArray] - Indicates whether the async request is given in array or single object
 */
var AsyncResultLocator = function(meta, results, isArray) {
  this._meta = meta;
  this._results = results;
  this._isArray = isArray;
};

inherits(AsyncResultLocator, events.EventEmitter);

/**
 * Promise/A+ interface
 * http://promises-aplus.github.io/promises-spec/
 *
 * Delegate to deferred promise, return promise instance for batch result
 *
 * @method Metadata~AsyncResultLocator#then
 */
AsyncResultLocator.prototype.then = function(onResolve, onReject) {
  var self = this;
  return this._results.then(function(results) {
    var convertType = function(res) {
      if (res.$ && res.$["xsi:nil"] === 'true') {
        return null;
      }
      res.done = res.done === 'true';
      return res;
    };
    results = _.isArray(results) ? _.map(results, convertType) : convertType(results);
    if (self._isArray && !_.isArray(results)) {
      results = [ results ];
    }
    return onResolve(results);
  }, onReject);
};

/**
 * Promise/A+ extension
 * Call "then" using given node-style callback function
 *
 * @method Metadata~AsyncResultLocator#thenCall
 */
AsyncResultLocator.prototype.thenCall = function(callback) {
  return _.isFunction(callback) ? this.then(function(res) {
    process.nextTick(function() {
      callback(null, res);
    });
  }, function(err) {
    process.nextTick(function() {
      callback(err);
    });
  }) : this;
};

/**
 * Check the status of async request
 *
 * @method Metadata~AsyncResultLocator#check
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>}
 */
AsyncResultLocator.prototype.check = function(callback) {
  var self = this;
  var meta = this._meta;
  return this.then(function(results) {
    var ids = _.isArray(results) ? _.map(results, function(res){ return res.id; }) : results.id;
    self._ids = ids;
    return meta.checkStatus(ids);
  }).thenCall(callback);
};

/**
 * Polling until async call status becomes complete or error
 *
 * @method Metadata~AsyncResultLocator#poll
 * @param {Number} interval - Polling interval in milliseconds
 * @param {Number} timeout - Polling timeout in milliseconds
 */
AsyncResultLocator.prototype.poll = function(interval, timeout) {
  var self = this;
  var startTime = new Date().getTime();
  var poll = function() {
    var now = new Date().getTime();
    if (startTime + timeout < now) {
      var errMsg = "Polling time out.";
      if (self._ids) {
        errMsg += " Process Id = " + self._ids;
      }
      self.emit('error', new Error(errMsg));
      return;
    }
    self.check().then(function(results) {
      var done = true;
      var resultArr = _.isArray(results) ? results : [ results ];
      for (var i=0, len=resultArr.length; i<len; i++) {
        var result = resultArr[i];
        if (result && !result.done) {
          self.emit('progress', result);
          done = false;
        }
      }
      if (done) {
        self.emit('complete', results);
      } else {
        setTimeout(poll, interval);
      }
    }, function(err) {
      self.emit('error', err);
    });
  };
  setTimeout(poll, interval);
};

/**
 * Check and wait until the async requests become in completed status
 *
 * @method Metadata~AsyncResultLocator#complete
 * @param {Callback.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>} [callback] - Callback function
 * @returns {Promise.<Metadata~AsyncResult|Array.<Metadata~AsyncResult>>}
 */
AsyncResultLocator.prototype.complete = function(callback) {
  var deferred = Promise.defer();
  this.on('complete', function(results) {
    deferred.resolve(results);
  });
  this.on('error', function(err) {
    deferred.reject(err);
  });
  var meta = this._meta;
  this.poll(meta.pollInterval, meta.pollTimeout);
  return deferred.promise.thenCall(callback);
};

/*--------------------------------------------*/
/**
 * The locator class to track retreive() Metadata API call result
 *
 * @protected
 * @class Metadata~RetrieveResultLocator
 * @extends Metadata~AsyncResultLocator
 * @param {Metadata} meta - Metadata API object
 * @param {Promise.<Metadata~AsyncResult>} result - Promise object for async result of retrieve call()
 */
var RetrieveResultLocator = function(meta, result) {
  RetrieveResultLocator.super_.call(this, meta, result);
};

inherits(RetrieveResultLocator, AsyncResultLocator);

/**
 * @typedef {Object} Metadata~RetrieveResult
 * @prop {Array.<Metadata~FileProperties>} fileProperties - Contains information about the properties of each component in the .zip file, and the manifest file package.xml
 * @prop {String} id - ID of the component being retrieved
 * @prop {Array.<Object>} messages - Contains information about the success or failure of the retrieve() call
 * @prop {String} zipFile - The zip file returned by the retrieve request. Base 64-encoded binary data
 */

/**
 * Check and wait until the async request becomes in completed status,
 * and retrieve the result data.
 *
 * @memthod Metadata~RetrieveResultLocator#complete
 * @param {Callback.<Metadata~RetrieveResult>} [callback] - Callback function
 * @returns {Promise.<Metadata~RetrieveResult>}
 */
RetrieveResultLocator.prototype.complete = function(callback) {
  var meta = this._meta;
  return RetrieveResultLocator.super_.prototype.complete.call(this).then(function(result) {
    return meta.checkRetrieveStatus(result.id);
  }).thenCall(callback);
};

/**
 * Change the retrieved result to Node.js readable stream
 *
 * @method Metadata~RetrieveResultLocator#stream
 * @returns {stream.Readable}
 */
RetrieveResultLocator.prototype.stream = function() {
  var self = this;
  var resultStream = new stream.Readable();
  var reading = false;
  resultStream._read = function() {
    if (reading) { return; }
    reading = true;
    self.complete(function(err, result) {
      if (err) {
        resultStream.emit('error', err);
      } else {
        resultStream.push(new Buffer(result.zipFile, 'base64'));
        resultStream.push(null);
      }
    });
  };
  return resultStream;
};

/*--------------------------------------------*/
/**
 * The locator class to track deploy() Metadata API call result
 *
 * @protected
 * @class Metadata~DeployResultLocator
 * @extends Metadata~AsyncResultLocator
 * @param {Metadata} meta - Metadata API object
 * @param {Promise.<Metadata~AsyncResult>} result - Promise object for async result of deploy() call
 */
var DeployResultLocator = function(meta, result) {
  DeployResultLocator.super_.call(this, meta, result);
};

inherits(DeployResultLocator, AsyncResultLocator);

/**
 * @typedef {Object} Metadata~DeployResult
 * @prop {String} id - ID of the component being deployed
 * @prop {Boolean} checkOnly - Indicates whether this deployment is being used to check the validity of the deployed files without making any changes in the organization or not
 * @prop {String} completedDate - Timestamp for when the deployment process ended
 * @prop {String} createdDate - Timestamp for when the deploy() call was received
 * @prop {Array.<Object>} [details] - Provides the details of a deployment that is in-progress or ended, if includeDetails is set to true in checkDeployStatus() call
 * @prop {Boolean} done - Indicates whether the server finished processing the deploy() call for the specified id
 * @prop {String} [errorMessage] - Message corresponding to the values in the errorStatusCode field
 * @prop {String} [errorStatusCode] - If an error occurred during the deploy() call, a status code is returned, and the message corresponding to the status code is returned in the errorMessagefield
 * @prop {Boolean} [ignoreWarnings] - Specifies whether a deployment should continue even if the deployment generates warnings
 * @prop {String} lastModifiedDate - Timestamp of the last update for the deployment process
 * @prop {Number} numberComponentErrors - The number of components that generated errors during this deployment
 * @prop {Number} numberComponentsDeployed - The number of components deployed in the deployment process
 * @prop {Number} numberComponentsTotal - The total number of components in the deployment
 * @prop {Number} numberTestErrors - The number of Apex tests that have generated errors during this deployment
 * @prop {Number} numberTestsCompleted - The number of completedApex tests for this deployment
 * @prop {Number} numberTestsTotal - The total number of Apex tests for this deployment
 * @prop {Boolean} [rollbackOnError] - Indicates whether any failure causes a complete rollback or not. Default is true.
 * @prop {String} startDate - Timestamp for when the deployment process began
 * @prop {String} status - Indicates the current state of the deployment
 * @prop {Boolean} success - Indicates whether the deployment was successful or not
 */

/**
 * Check and wait until the async request becomes in completed status,
 * and retrieve the result data.
 *
 * @method Metadata~DeployResultLocator#complete
 * @param {Callback.<Metadata~DeployResult>} [callback] - Callback function
 * @returns {Promise.<Metadata~DeployResult>}
 */
DeployResultLocator.prototype.complete = function(includeDetails, callback) {
  if (_.isFunction(includeDetails)) {
    callback = includeDetails;
    includeDetails = false;
  }
  var meta = this._meta;
  return DeployResultLocator.super_.prototype.complete.call(this).then(function(result) {
    return meta.checkDeployStatus(result.id, includeDetails);
  }).thenCall(callback);
};


/*--------------------------------------------*/
/*
 * Register hook in connection instantiation for dynamically adding this API module features
 */
jsforce.on('connection:new', function(conn) {
  conn.metadata = new Metadata(conn);
});

}).call(this,require('_process'),require("buffer").Buffer)

},{"_process":6,"buffer":3}],2:[function(require,module,exports){
'use strict'

exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

function init () {
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i]
    revLookup[code.charCodeAt(i)] = i
  }

  revLookup['-'.charCodeAt(0)] = 62
  revLookup['_'.charCodeAt(0)] = 63
}

init()

function toByteArray (b64) {
  var i, j, l, tmp, placeHolders, arr
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],3:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

/*
 * Export kMaxLength after typed array support is determined.
 */
exports.kMaxLength = kMaxLength()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length)
    }
    that.length = length
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192 // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
}

function allocUnsafe (that, size) {
  assertSize(size)
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; i++) {
      that[i] = 0
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  that = createBuffer(that, length)

  that.write(string, encoding)
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = createBuffer(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (length === undefined) {
    array = new Uint8Array(array, byteOffset)
  } else {
    array = new Uint8Array(array, byteOffset, length)
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array)
  }
  return that
}

function fromObject (that, obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    that = createBuffer(that, len)

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len)
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

function arrayIndexOf (arr, val, byteOffset, encoding) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var foundIndex = -1
  for (var i = 0; byteOffset + i < arrLength; i++) {
    if (read(arr, byteOffset + i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
      if (foundIndex === -1) foundIndex = i
      if (i - foundIndex + 1 === valLength) return (byteOffset + foundIndex) * indexSize
    } else {
      if (foundIndex !== -1) i -= i - foundIndex
      foundIndex = -1
    }
  }
  return -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  if (Buffer.isBuffer(val)) {
    // special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(this, val, byteOffset, encoding)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset, encoding)
  }

  throw new TypeError('val must be string, number or Buffer')
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; i++) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString())
    var len = bytes.length
    for (i = 0; i < end - start; i++) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"base64-js":2,"ieee754":4,"isarray":5}],4:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],5:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],6:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYXBpL21ldGFkYXRhLmpzIiwibm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWIvYjY0LmpzIiwibm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2lzYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMvMEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzdHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDL3FEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKmdsb2JhbCBwcm9jZXNzLCBCdWZmZXIgKi9cclxuLyoqXHJcbiAqIEBmaWxlIE1hbmFnZXMgU2FsZXNmb3JjZSBNZXRhZGF0YSBBUElcclxuICogQGF1dGhvciBTaGluaWNoaSBUb21pdGEgPHNoaW5pY2hpLnRvbWl0YUBnbWFpbC5jb20+XHJcbiAqL1xyXG5cclxuJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGluaGVyaXRzID0gd2luZG93LmpzZm9yY2UucmVxdWlyZSgnaW5oZXJpdHMnKSxcclxuICAgIGV2ZW50cyAgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCdldmVudHMnKSxcclxuICAgIHN0cmVhbSAgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCdyZWFkYWJsZS1zdHJlYW0nKSxcclxuICAgIF8gICAgICAgPSB3aW5kb3cuanNmb3JjZS5yZXF1aXJlKCdsb2Rhc2gvY29yZScpLFxyXG4gICAganNmb3JjZSA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJy4vY29yZScpLFxyXG4gICAgUHJvbWlzZSA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJy4vcHJvbWlzZScpLFxyXG4gICAgU09BUCAgICA9IHdpbmRvdy5qc2ZvcmNlLnJlcXVpcmUoJy4vc29hcCcpO1xyXG5cclxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcbi8qKlxyXG4gKiBDbGFzcyBmb3IgU2FsZXNmb3JjZSBNZXRhZGF0YSBBUElcclxuICpcclxuICogQGNsYXNzXHJcbiAqIEBwYXJhbSB7Q29ubmVjdGlvbn0gY29ubiAtIENvbm5lY3Rpb24gb2JqZWN0XHJcbiAqL1xyXG52YXIgTWV0YWRhdGEgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbm4pIHtcclxuICB0aGlzLl9jb25uID0gY29ubjtcclxufTtcclxuXHJcblxyXG4vKipcclxuICogUG9sbGluZyBpbnRlcnZhbCBpbiBtaWxsaXNlY29uZHNcclxuICogQHR5cGUge051bWJlcn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5wb2xsSW50ZXJ2YWwgPSAxMDAwO1xyXG5cclxuLyoqXHJcbiAqIFBvbGxpbmcgdGltZW91dCBpbiBtaWxsaXNlY29uZHNcclxuICogQHR5cGUge051bWJlcn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5wb2xsVGltZW91dCA9IDEwMDAwO1xyXG5cclxuXHJcbi8qKlxyXG4gKiBDYWxsIE1ldGFkYXRhIEFQSSBTT0FQIGVuZHBvaW50XHJcbiAqXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuX2ludm9rZSA9IGZ1bmN0aW9uKG1ldGhvZCwgbWVzc2FnZSwgY2FsbGJhY2spIHtcclxuICB2YXIgc29hcEVuZHBvaW50ID0gbmV3IFNPQVAodGhpcy5fY29ubiwge1xyXG4gICAgeG1sbnM6IFwiaHR0cDovL3NvYXAuc2ZvcmNlLmNvbS8yMDA2LzA0L21ldGFkYXRhXCIsXHJcbiAgICBlbmRwb2ludFVybDogdGhpcy5fY29ubi5pbnN0YW5jZVVybCArIFwiL3NlcnZpY2VzL1NvYXAvbS9cIiArIHRoaXMuX2Nvbm4udmVyc2lvblxyXG4gIH0pO1xyXG4gIHJldHVybiBzb2FwRW5kcG9pbnQuaW52b2tlKG1ldGhvZCwgbWVzc2FnZSkudGhlbihmdW5jdGlvbihyZXMpIHtcclxuICAgIHJldHVybiByZXMucmVzdWx0O1xyXG4gIH0pLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gTWV0YWRhdGF+TWV0YWRhdGFJbmZvXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGZ1bGxOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIGNvbXBvbmVudFxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBBc3luY2hyb25vdXNseSBhZGRzIG9uZSBvciBtb3JlIG5ldyBtZXRhZGF0YSBjb21wb25lbnRzIHRvIHRoZSBvcmdhbml6YXRpb24uXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gY3JlYXRlXHJcbiAqIEBwYXJhbSB7TWV0YWRhdGF+TWV0YWRhdGFJbmZvfEFycmF5LjxNZXRhZGF0YX5NZXRhZGF0YUluZm8+fSBtZXRhZGF0YSAtIE1ldGFkYXRhIHRvIGNyZWF0ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5Bc3luY1Jlc3VsdHxBcnJheS48TWV0YWRhdGF+QXN5bmNSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3J9XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuY3JlYXRlQXN5bmMgPSBmdW5jdGlvbih0eXBlLCBtZXRhZGF0YSwgY2FsbGJhY2spIHtcclxuICBpZiAoTnVtYmVyKHRoaXMuX2Nvbm4udmVyc2lvbikgPiAzMCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQXN5bmMgbWV0YWRhdGEgQ1JVRCBjYWxscyBhcmUgbm90IHN1cHBvcnRlZCBvbiB2ZXIgMzEuMCBvciBsYXRlci5cIik7XHJcbiAgfVxyXG4gIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24obWQpIHtcclxuICAgIG1kW1wiQHhzaTp0eXBlXCJdID0gdHlwZTtcclxuICAgIHJldHVybiBtZDtcclxuICB9O1xyXG4gIHZhciBpc0FycmF5ID0gXy5pc0FycmF5KG1ldGFkYXRhKTtcclxuICBtZXRhZGF0YSA9IGlzQXJyYXkgPyBfLm1hcChtZXRhZGF0YSwgY29udmVydCkgOiBjb252ZXJ0KG1ldGFkYXRhKTtcclxuICB2YXIgcmVzID0gdGhpcy5faW52b2tlKFwiY3JlYXRlXCIsIHsgbWV0YWRhdGE6IG1ldGFkYXRhIH0pO1xyXG4gIHJldHVybiBuZXcgQXN5bmNSZXN1bHRMb2NhdG9yKHRoaXMsIHJlcywgaXNBcnJheSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IE1ldGFkYXRhflNhdmVSZXN1bHRcclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBUcnVlIGlmIG1ldGFkYXRhIGlzIHN1Y2Nlc3NmdWxseSBzYXZlZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBmdWxsTmFtZSAtIEZ1bGwgbmFtZSBvZiBtZXRhZGF0YSBvYmplY3RcclxuICovXHJcblxyXG4vKipcclxuICogQHByaXZhdGVcclxuICovXHJcbmZ1bmN0aW9uIGNvbnZlcnRUb1NhdmVSZXN1bHQocmVzdWx0KSB7XHJcbiAgdmFyIHNhdmVSZXN1bHQgPSBfLmNsb25lKHJlc3VsdCk7XHJcbiAgc2F2ZVJlc3VsdC5zdWNjZXNzID0gc2F2ZVJlc3VsdC5zdWNjZXNzID09PSAndHJ1ZSc7XHJcbiAgcmV0dXJuIHNhdmVSZXN1bHQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBNZXRhZGF0YX5VcHNlcnRSZXN1bHRcclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBUcnVlIGlmIG1ldGFkYXRhIGlzIHN1Y2Nlc3NmdWxseSBzYXZlZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBmdWxsTmFtZSAtIEZ1bGwgbmFtZSBvZiBtZXRhZGF0YSBvYmplY3RcclxuICogQHByb3Age0Jvb2xlYW59IGNyZWF0ZWQgLSBUcnVlIGlmIG1ldGFkYXRhIGlzIG5ld2x5IGNyZWF0ZWRcclxuICovXHJcblxyXG4vKipcclxuICogQHByaXZhdGVcclxuICovXHJcbmZ1bmN0aW9uIGNvbnZlcnRUb1Vwc2VydFJlc3VsdChyZXN1bHQpIHtcclxuICB2YXIgdXBzZXJ0UmVzdWx0ID0gY29udmVydFRvU2F2ZVJlc3VsdChyZXN1bHQpO1xyXG4gIHVwc2VydFJlc3VsdC5jcmVhdGVkID0gdXBzZXJ0UmVzdWx0LmNyZWF0ZWQgPT09ICd0cnVlJztcclxuICByZXR1cm4gdXBzZXJ0UmVzdWx0O1xyXG59XHJcblxyXG4vKipcclxuICogU3lub255bSBvZiBNZXRhZGF0YSNjcmVhdGUoKS5cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YSNjcmVhdGVTeW5jXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gY3JlYXRlXHJcbiAqIEBwYXJhbSB7TWV0YWRhdGF+TWV0YWRhdGFJbmZvfEFycmF5LjxNZXRhZGF0YX5NZXRhZGF0YUluZm8+fSBtZXRhZGF0YSAtIE1ldGFkYXRhIHRvIGNyZWF0ZVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5TYXZlUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5TYXZlUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48TWV0YWRhdGF+U2F2ZVJlc3VsdHxBcnJheS48TWV0YWRhdGF+U2F2ZVJlc3VsdD4+fVxyXG4gKi9cclxuLyoqXHJcbiAqIFN5bmNocm9ub3VzbHkgYWRkcyBvbmUgb3IgbW9yZSBuZXcgbWV0YWRhdGEgY29tcG9uZW50cyB0byB0aGUgb3JnYW5pemF0aW9uLlxyXG4gKlxyXG4gKiBAbWV0aG9kIE1ldGFkYXRhI2NyZWF0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIG1ldGFkYXRhIHRvIGNyZWF0ZVxyXG4gKiBAcGFyYW0ge01ldGFkYXRhfk1ldGFkYXRhSW5mb3xBcnJheS48TWV0YWRhdGF+TWV0YWRhdGFJbmZvPn0gbWV0YWRhdGEgLSBNZXRhZGF0YSB0byBjcmVhdGVcclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+U2F2ZVJlc3VsdHxBcnJheS48TWV0YWRhdGF+U2F2ZVJlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPE1ldGFkYXRhflNhdmVSZXN1bHR8QXJyYXkuPE1ldGFkYXRhflNhdmVSZXN1bHQ+Pn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5jcmVhdGVTeW5jID1cclxuTWV0YWRhdGEucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKHR5cGUsIG1ldGFkYXRhLCBjYWxsYmFjaykge1xyXG4gIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24obWQpIHtcclxuICAgIG1kW1wiQHhzaTp0eXBlXCJdID0gdHlwZTtcclxuICAgIHJldHVybiBtZDtcclxuICB9O1xyXG4gIHZhciBpc0FycmF5ID0gXy5pc0FycmF5KG1ldGFkYXRhKTtcclxuICBtZXRhZGF0YSA9IGlzQXJyYXkgPyBfLm1hcChtZXRhZGF0YSwgY29udmVydCkgOiBjb252ZXJ0KG1ldGFkYXRhKTtcclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwiY3JlYXRlTWV0YWRhdGFcIiwgeyBtZXRhZGF0YTogbWV0YWRhdGEgfSkudGhlbihmdW5jdGlvbihyZXN1bHRzKSB7XHJcbiAgICByZXR1cm4gXy5pc0FycmF5KHJlc3VsdHMpID8gXy5tYXAocmVzdWx0cywgY29udmVydFRvU2F2ZVJlc3VsdCkgOiBjb252ZXJ0VG9TYXZlUmVzdWx0KHJlc3VsdHMpO1xyXG4gIH0pLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuZnVuY3Rpb24gY29udmVydFRvTWV0YWRhdGFJbmZvKHJlYykge1xyXG4gIHZhciBtZXRhZGF0YUluZm8gPSBfLmNsb25lKHJlYyk7XHJcbiAgZGVsZXRlIG1ldGFkYXRhSW5mby4kO1xyXG4gIHJldHVybiBtZXRhZGF0YUluZm87XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTeW5vbnltIG9mIE1ldGFkYXRhI3JlYWQoKVxyXG4gKlxyXG4gKiBAbWV0aG9kIE1ldGFkYXRhI3JlYWRTeW5jXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gcmVhZFxyXG4gKiBAcGFyYW0ge1N0cmluZ3xBcnJheS48U3RyaW5nPn0gZnVsbE5hbWVzIC0gZnVsbCBuYW1lKHMpIG9mIG1ldGFkYXRhIG9iamVjdHMgdG8gcmVhZFxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFycmF5LjxNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz4+Pn1cclxuICovXHJcbi8qKlxyXG4gKiBTeW5jaHJvbm91c2x5IHJlYWQgc3BlY2lmaWVkIG1ldGFkYXRhIGNvbXBvbmVudHMgaW4gdGhlIG9yZ2FuaXphdGlvbi5cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YSNyZWFkXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gcmVhZFxyXG4gKiBAcGFyYW0ge1N0cmluZ3xBcnJheS48U3RyaW5nPn0gZnVsbE5hbWVzIC0gZnVsbCBuYW1lKHMpIG9mIG1ldGFkYXRhIG9iamVjdHMgdG8gcmVhZFxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFycmF5LjxNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz4+Pn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5yZWFkU3luYyA9XHJcbk1ldGFkYXRhLnByb3RvdHlwZS5yZWFkID0gZnVuY3Rpb24odHlwZSwgZnVsbE5hbWVzLCBjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJyZWFkTWV0YWRhdGFcIiwgeyB0eXBlOiB0eXBlLCBmdWxsTmFtZXM6IGZ1bGxOYW1lcyB9KS50aGVuKGZ1bmN0aW9uKHJlcykge1xyXG4gICAgcmV0dXJuIF8uaXNBcnJheShyZXMucmVjb3JkcykgPyBfLm1hcChyZXMucmVjb3JkcywgY29udmVydFRvTWV0YWRhdGFJbmZvKSA6IGNvbnZlcnRUb01ldGFkYXRhSW5mbyhyZXMucmVjb3Jkcyk7XHJcbiAgfSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IE1ldGFkYXRhflVwZGF0ZU1ldGFkYXRhSW5mb1xyXG4gKiBAcHJvcCB7U3RyaW5nfSBjdXJyZW50TmFtZSAtIFRoZSBBUEkgbmFtZSBvZiB0aGUgY29tcG9uZW50IG9yIGZpZWxkIGJlZm9yZSB0aGUgdXBkYXRlXHJcbiAqIEBwcm9wIHtNZXRhZGF0YX5NZXRhZGF0YUluZm99IG1ldGFkYXRhIC0gRnVsbCBzcGVjaWZpY2F0aW9uIG9mIHRoZSBjb21wb25lbnQgb3IgZmllbGQgeW91IHdpc2ggdG8gdXBkYXRlXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIEFzeW5jaHJvbm91c2x5IHVwZGF0ZXMgb25lIG9yIG1vcmUgbWV0YWRhdGEgY29tcG9uZW50cyBpbiB0aGUgb3JnYW5pemF0aW9uLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIG1ldGFkYXRhIHRvIHVwZGF0ZVxyXG4gKiBAcGFyYW0ge01ldGFkYXRhflVwZGF0ZU1ldGFkYXRhSW5mb3xBcnJheS48TWV0YWRhdGF+VXBkYXRlTWV0YWRhdGFJbmZvPn0gdXBkYXRlTWV0YWRhdGEgLSBVcGRhdGluZyBtZXRhZGF0YVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5Bc3luY1Jlc3VsdHxBcnJheS48TWV0YWRhdGF+QXN5bmNSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3J9XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUudXBkYXRlQXN5bmMgPSBmdW5jdGlvbih0eXBlLCB1cGRhdGVNZXRhZGF0YSwgY2FsbGJhY2spIHtcclxuICBpZiAoTnVtYmVyKHRoaXMuX2Nvbm4udmVyc2lvbikgPiAzMCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQXN5bmMgbWV0YWRhdGEgQ1JVRCBjYWxscyBhcmUgbm90IHN1cHBvcnRlZCBvbiB2ZXIgMzEuMCBvciBsYXRlci5cIik7XHJcbiAgfVxyXG4gIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24odW1kKSB7XHJcbiAgICB1bWQubWV0YWRhdGFbXCJAeHNpOnR5cGVcIl0gPSB0eXBlO1xyXG4gICAgcmV0dXJuIHVtZDtcclxuICB9O1xyXG4gIHZhciBpc0FycmF5ID0gXy5pc0FycmF5KHVwZGF0ZU1ldGFkYXRhKTtcclxuICB1cGRhdGVNZXRhZGF0YSA9IGlzQXJyYXkgPyBfLm1hcCh1cGRhdGVNZXRhZGF0YSwgY29udmVydCkgOiBjb252ZXJ0KHVwZGF0ZU1ldGFkYXRhKTtcclxuICB2YXIgcmVzID0gdGhpcy5faW52b2tlKFwidXBkYXRlXCIsIHsgdXBkYXRlTWV0YWRhdGE6IHVwZGF0ZU1ldGFkYXRhIH0pO1xyXG4gIHJldHVybiBuZXcgQXN5bmNSZXN1bHRMb2NhdG9yKHRoaXMsIHJlcywgaXNBcnJheSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFN5bm9ueW0gb2YgTWV0YWRhdGEjdXBkYXRlKCkuXHJcbiAqXHJcbiAqIEBtZXRob2QgTWV0YWRhdGEjdXBkYXRlU3luY1xyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIG1ldGFkYXRhIHRvIHVwZGF0ZVxyXG4gKiBAcGFyYW0ge01ldGFkYXRhfk1ldGFkYXRhSW5mb3xBcnJheS48TWV0YWRhdGF+TWV0YWRhdGFJbmZvPn0gdXBkYXRlTWV0YWRhdGEgLSBVcGRhdGluZyBtZXRhZGF0YVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5TYXZlUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5TYXZlUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48TWV0YWRhdGF+U2F2ZVJlc3VsdHxBcnJheS48TWV0YWRhdGF+U2F2ZVJlc3VsdD4+fVxyXG4gKi9cclxuLyoqXHJcbiAqIFN5bmNocm9ub3VzbHkgdXBkYXRlcyBvbmUgb3IgbW9yZSBtZXRhZGF0YSBjb21wb25lbnRzIGluIHRoZSBvcmdhbml6YXRpb24uXHJcbiAqXHJcbiAqIEBtZXRob2QgTWV0YWRhdGEjdXBkYXRlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gdXBkYXRlXHJcbiAqIEBwYXJhbSB7TWV0YWRhdGF+TWV0YWRhdGFJbmZvfEFycmF5LjxNZXRhZGF0YX5NZXRhZGF0YUluZm8+fSB1cGRhdGVNZXRhZGF0YSAtIFVwZGF0aW5nIG1ldGFkYXRhXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE1ldGFkYXRhflNhdmVSZXN1bHR8QXJyYXkuPE1ldGFkYXRhflNhdmVSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxNZXRhZGF0YX5TYXZlUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5TYXZlUmVzdWx0Pj59XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUudXBkYXRlU3luYyA9XHJcbk1ldGFkYXRhLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbih0eXBlLCBtZXRhZGF0YSwgY2FsbGJhY2spIHtcclxuICB2YXIgY29udmVydCA9IGZ1bmN0aW9uKG1kKSB7XHJcbiAgICBtZFtcIkB4c2k6dHlwZVwiXSA9IHR5cGU7XHJcbiAgICByZXR1cm4gbWQ7XHJcbiAgfTtcclxuICB2YXIgaXNBcnJheSA9IF8uaXNBcnJheShtZXRhZGF0YSk7XHJcbiAgbWV0YWRhdGEgPSBpc0FycmF5ID8gXy5tYXAobWV0YWRhdGEsIGNvbnZlcnQpIDogY29udmVydChtZXRhZGF0YSk7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcInVwZGF0ZU1ldGFkYXRhXCIsIHsgbWV0YWRhdGE6IG1ldGFkYXRhIH0pLnRoZW4oZnVuY3Rpb24ocmVzdWx0cykge1xyXG4gICAgcmV0dXJuIF8uaXNBcnJheShyZXN1bHRzKSA/IF8ubWFwKHJlc3VsdHMsIGNvbnZlcnRUb1NhdmVSZXN1bHQpIDogY29udmVydFRvU2F2ZVJlc3VsdChyZXN1bHRzKTtcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogU3lub255bSBvZiBNZXRhZGF0YSN1cHNlcnQoKS5cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YSN1cHNlcnRTeW5jXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gdXBzZXJ0XHJcbiAqIEBwYXJhbSB7TWV0YWRhdGF+TWV0YWRhdGFJbmZvfEFycmF5LjxNZXRhZGF0YX5NZXRhZGF0YUluZm8+fSBtZXRhZGF0YSAtIFVwc2VydGluZyBtZXRhZGF0YVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5VcHNlcnRSZXN1bHR8QXJyYXkuPE1ldGFkYXRhflVwc2VydFJlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPE1ldGFkYXRhflVwc2VydFJlc3VsdHxBcnJheS48TWV0YWRhdGF+VXBzZXJ0UmVzdWx0Pj59XHJcbiAqL1xyXG4vKipcclxuICogVXBzZXJ0cyBvbmUgb3IgbW9yZSBjb21wb25lbnRzIGluIHlvdXIgb3JnYW5pemF0aW9uJ3MgZGF0YS5cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YSN1cHNlcnRcclxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgLSBUaGUgdHlwZSBvZiBtZXRhZGF0YSB0byB1cHNlcnRcclxuICogQHBhcmFtIHtNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz59IG1ldGFkYXRhIC0gVXBzZXJ0aW5nIG1ldGFkYXRhXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE1ldGFkYXRhflVwc2VydFJlc3VsdHxBcnJheS48TWV0YWRhdGF+VXBzZXJ0UmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48TWV0YWRhdGF+VXBzZXJ0UmVzdWx0fEFycmF5LjxNZXRhZGF0YX5VcHNlcnRSZXN1bHQ+Pn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS51cHNlcnRTeW5jID1cclxuTWV0YWRhdGEucHJvdG90eXBlLnVwc2VydCA9IGZ1bmN0aW9uKHR5cGUsIG1ldGFkYXRhLCBjYWxsYmFjaykge1xyXG4gIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24obWQpIHtcclxuICAgIG1kW1wiQHhzaTp0eXBlXCJdID0gdHlwZTtcclxuICAgIHJldHVybiBtZDtcclxuICB9O1xyXG4gIHZhciBpc0FycmF5ID0gXy5pc0FycmF5KG1ldGFkYXRhKTtcclxuICBtZXRhZGF0YSA9IGlzQXJyYXkgPyBfLm1hcChtZXRhZGF0YSwgY29udmVydCkgOiBjb252ZXJ0KG1ldGFkYXRhKTtcclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwidXBzZXJ0TWV0YWRhdGFcIiwgeyBtZXRhZGF0YTogbWV0YWRhdGEgfSkudGhlbihmdW5jdGlvbihyZXN1bHRzKSB7XHJcbiAgICByZXR1cm4gXy5pc0FycmF5KHJlc3VsdHMpID8gXy5tYXAocmVzdWx0cywgY29udmVydFRvVXBzZXJ0UmVzdWx0KSA6IGNvbnZlcnRUb1Vwc2VydFJlc3VsdChyZXN1bHRzKTtcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogQXN5bmNocm9ub3VzbHkgZGVsZXRlcyBzcGVjaWZpZWQgbWV0YWRhdGEgY29tcG9uZW50cyBpbiB0aGUgb3JnYW5pemF0aW9uLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIG1ldGFkYXRhIHRvIGRlbGV0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ3xNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPFN0cmluZz58QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz59IG1ldGFkYXRhIC0gVGhlIGZ1bGxOYW1lIG9mIG1ldGFkYXRhIG9yIG1ldGFkYXRhIGluZm8gdG8gZGVsZXRlLiBJZiBpdCBpcyBwYXNzZWQgaW4gZnVsbE5hbWUsIHRoZSB0eXBlIHBhcmFtZXRlciBzaG91bGQgbm90IGJlIGVtcHR5LlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5Bc3luY1Jlc3VsdHxBcnJheS48TWV0YWRhdGF+QXN5bmNSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3J9XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuZGVsZXRlQXN5bmMgPSBmdW5jdGlvbih0eXBlLCBtZXRhZGF0YSwgY2FsbGJhY2spIHtcclxuICBpZiAoTnVtYmVyKHRoaXMuX2Nvbm4udmVyc2lvbikgPiAzMCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQXN5bmMgbWV0YWRhdGEgQ1JVRCBjYWxscyBhcmUgbm90IHN1cHBvcnRlZCBvbiB2ZXIgMzEuMCBvciBsYXRlci5cIik7XHJcbiAgfVxyXG4gIHZhciBjb252ZXJ0ID0gZnVuY3Rpb24obWQpIHtcclxuICAgIGlmIChfLmlzU3RyaW5nKG1kKSkge1xyXG4gICAgICBtZCA9IHsgZnVsbE5hbWUgOiBtZCB9O1xyXG4gICAgfVxyXG4gICAgbWRbXCJAeHNpOnR5cGVcIl0gPSB0eXBlO1xyXG4gICAgcmV0dXJuIG1kO1xyXG4gIH07XHJcbiAgdmFyIGlzQXJyYXkgPSBfLmlzQXJyYXkobWV0YWRhdGEpO1xyXG4gIG1ldGFkYXRhID0gaXNBcnJheSA/IF8ubWFwKG1ldGFkYXRhLCBjb252ZXJ0KSA6IGNvbnZlcnQobWV0YWRhdGEpO1xyXG4gIHZhciByZXMgPSB0aGlzLl9pbnZva2UoXCJkZWxldGVcIiwgeyBtZXRhZGF0YTogbWV0YWRhdGEgfSk7XHJcbiAgcmV0dXJuIG5ldyBBc3luY1Jlc3VsdExvY2F0b3IodGhpcywgcmVzLCBpc0FycmF5KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogU3lub255bSBvZiBNZXRhZGF0YSNkZWxldGUoKS5cclxuICpcclxuICogQGRlcHJlY2F0ZWRcclxuICogQG1ldGhvZCBNZXRhZGF0YSNkZWxcclxuICogQHBhcmFtIHtTdHJpbmd9IFt0eXBlXSAtIFRoZSB0eXBlIG9mIG1ldGFkYXRhIHRvIGRlbGV0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ3xNZXRhZGF0YX5NZXRhZGF0YUluZm98QXJyYXkuPFN0cmluZz58QXJyYXkuPE1ldGFkYXRhfk1ldGFkYXRhSW5mbz59IG1ldGFkYXRhIC0gVGhlIGZ1bGxOYW1lIG9mIG1ldGFkYXRhIG9yIG1ldGFkYXRhIGluZm8gdG8gZGVsZXRlLiBJZiBpdCBpcyBwYXNzZWQgaW4gZnVsbE5hbWUsIHRoZSB0eXBlIHBhcmFtZXRlciBzaG91bGQgbm90IGJlIGVtcHR5LlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5Bc3luY1Jlc3VsdHxBcnJheS48TWV0YWRhdGF+QXN5bmNSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3J9XHJcbiAqL1xyXG4vKipcclxuICogU3lub255bSBvZiBNZXRhZGF0YSNkZWxldGUoKS5cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YSNkZWxldGVTeW5jXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIC0gVGhlIHR5cGUgb2YgbWV0YWRhdGEgdG8gZGVsZXRlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfEFycmF5LjxTdHJpbmc+fSBmdWxsTmFtZXMgLSBUaGUgZnVsbE5hbWUgb2YgbWV0YWRhdGEgdG8gZGVsZXRlLlxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5TYXZlUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5TYXZlUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48TWV0YWRhdGF+U2F2ZVJlc3VsdHxBcnJheS48TWV0YWRhdGF+U2F2ZVJlc3VsdD4+fVxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBTeW5jaHJvbm91c2x5IGRlbGV0ZXMgc3BlY2lmaWVkIG1ldGFkYXRhIGNvbXBvbmVudHMgaW4gdGhlIG9yZ2FuaXphdGlvbi5cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YSNkZWxldGVcclxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgLSBUaGUgdHlwZSBvZiBtZXRhZGF0YSB0byBkZWxldGVcclxuICogQHBhcmFtIHtTdHJpbmd8QXJyYXkuPFN0cmluZz59IGZ1bGxOYW1lcyAtIFRoZSBmdWxsTmFtZSBvZiBtZXRhZGF0YSB0byBkZWxldGUuXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE1ldGFkYXRhflNhdmVSZXN1bHR8QXJyYXkuPE1ldGFkYXRhflNhdmVSZXN1bHQ+Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxNZXRhZGF0YX5TYXZlUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5TYXZlUmVzdWx0Pj59XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuZGVsID1cclxuTWV0YWRhdGEucHJvdG90eXBlLmRlbGV0ZVN5bmMgPVxyXG5NZXRhZGF0YS5wcm90b3R5cGVbXCJkZWxldGVcIl0gPSBmdW5jdGlvbih0eXBlLCBmdWxsTmFtZXMsIGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImRlbGV0ZU1ldGFkYXRhXCIsIHsgdHlwZTogdHlwZSwgZnVsbE5hbWVzOiBmdWxsTmFtZXMgfSkudGhlbihmdW5jdGlvbihyZXN1bHRzKSB7XHJcbiAgICByZXR1cm4gXy5pc0FycmF5KHJlc3VsdHMpID8gXy5tYXAocmVzdWx0cywgY29udmVydFRvU2F2ZVJlc3VsdCkgOiBjb252ZXJ0VG9TYXZlUmVzdWx0KHJlc3VsdHMpO1xyXG4gIH0pLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5hbWUgZnVsbG5hbWUgb2YgYSBtZXRhZGF0YSBjb21wb25lbnQgaW4gdGhlIG9yZ2FuaXphdGlvblxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtIFRoZSB0eXBlIG9mIG1ldGFkYXRhIHRvIGRlbGV0ZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gb2xkRnVsbE5hbWUgLSBUaGUgb3JpZ2luYWwgZnVsbE5hbWUgb2YgbWV0YWRhdGFcclxuICogQHBhcmFtIHtTdHJpbmd9IG5ld0Z1bGxOYW1lIC0gVGhlIG5ldyBmdWxsTmFtZSBvZiBtZXRhZGF0YVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5TYXZlUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxNZXRhZGF0YX5TYXZlUmVzdWx0Pn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5yZW5hbWUgPSBmdW5jdGlvbih0eXBlLCBvbGRGdWxsTmFtZSwgbmV3RnVsbE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcInJlbmFtZU1ldGFkYXRhXCIsIHsgdHlwZTogdHlwZSwgb2xkRnVsbE5hbWU6IG9sZEZ1bGxOYW1lLCBuZXdGdWxsTmFtZTogbmV3RnVsbE5hbWUgfSkudGhlbihmdW5jdGlvbihyZXN1bHQpIHtcclxuICAgIHJldHVybiBjb252ZXJ0VG9TYXZlUmVzdWx0KHJlc3VsdCk7XHJcbiAgfSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENoZWNrcyB0aGUgc3RhdHVzIG9mIGFzeW5jaHJvbm91cyBtZXRhZGF0YSBjYWxsc1xyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ3xBcnJheS48U3RyaW5nPn0gaWRzIC0gVGhlIGFzeW5jaHJvbm91cyBwcm9jZXNzIElEKHMpXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE1ldGFkYXRhfkFzeW5jUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5Bc3luY1Jlc3VsdD4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge01ldGFkYXRhfkFzeW5jUmVzdWx0TG9jYXRvcn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5jaGVja1N0YXR1cyA9IGZ1bmN0aW9uKGlkcywgY2FsbGJhY2spIHtcclxuICB2YXIgaXNBcnJheSA9IF8uaXNBcnJheShpZHMpO1xyXG4gIHZhciByZXMgPSB0aGlzLl9pbnZva2UoXCJjaGVja1N0YXR1c1wiLCB7IGFzeW5jUHJvY2Vzc0lkOiBpZHMgfSk7XHJcbiAgcmV0dXJuIG5ldyBBc3luY1Jlc3VsdExvY2F0b3IodGhpcywgcmVzLCBpc0FycmF5KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gTWV0YWRhdGF+RGVzY3JpYmVNZXRhZGF0YVJlc3VsdFxyXG4gKiBAcHJvcCB7QXJyYXkuPE9iamVjdD59IG1ldGFkYXRhT2JqZWN0cyAtIE9uZSBvciBtb3JlIG1ldGFkYXRhIGNvbXBvbmVudHMgYW5kIHRoZWlyIGF0dHJpYnV0ZXNcclxuICogQHByb3Age0FycmF5LjxTdHJpbmc+fSBtZXRhZGF0YU9iamVjdHMuY2hpbGRYbWxOYW1lcyAtIExpc3Qgb2YgY2hpbGQgc3ViLWNvbXBvbmVudHMgZm9yIHRoaXMgY29tcG9uZW50XHJcbiAqIEBwcm9wIHtTdHJpbmd9IG1ldGFkYXRhT2JqZWN0cy5kaXJlY3RvcnlOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIGRpcmVjdG9yeSBpbiB0aGUgLnppcCBmaWxlIHRoYXQgY29udGFpbnMgdGhpcyBjb21wb25lbnRcclxuICogQHByb3Age0Jvb2xlYW59IG1ldGFkYXRhT2JqZWN0cy5pbkZvbGRlciAtIEluZGljYXRlcyB3aGV0aGVyIHRoZSBjb21wb25lbnQgaXMgaW4gYSBmb2xkZXIgb3Igbm90XHJcbiAqIEBwcm9wIHtCb29sZWFufSBtZXRhZGF0YU9iamVjdHMubWV0YUZpbGUgLSBJbmRpY2F0ZXMgd2hldGhlciB0aGUgY29tcG9uZW50IHJlcXVpcmVzIGFuIGFjY29tcGFueWluZyBtZXRhZGF0YSBmaWxlXHJcbiAqIEBwcm9wIHtTdHJpbmd9IG1ldGFkYXRhT2JqZWN0cy5zdWZmaXggLSBUaGUgZmlsZSBzdWZmaXggZm9yIHRoaXMgY29tcG9uZW50XHJcbiAqIEBwcm9wIHtTdHJpbmd9IG1ldGFkYXRhT2JqZWN0cy54bWxOYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHJvb3QgZWxlbWVudCBpbiB0aGUgbWV0YWRhdGEgZmlsZSBmb3IgdGhpcyBjb21wb25lbnRcclxuICogQHByb3Age1N0cmluZ30gb3JnYW5pemF0aW9uTmFtZXNwYWNlIC0gVGhlIG5hbWVzcGFjZSBvZiB0aGUgb3JnYW5pemF0aW9uXHJcbiAqIEBwcm9wIHtCb29sZWFufSBwYXJ0aWFsU2F2ZUFsbG93ZWQgLSBJbmRpY2F0ZXMgd2hldGhlciByb2xsYmFja09uRXJyb3IgaXMgYWxsb3dlZCBvciBub3RcclxuICogQHByb3Age0Jvb2xlYW59IHRlc3RSZXF1aXJlZCAtIEluZGljYXRlcyB3aGV0aGVyIHRlc3RzIGFyZSByZXF1aXJlZCBvciBub3RcclxuICovXHJcblxyXG4vKipcclxuICogUmV0cmlldmVzIHRoZSBtZXRhZGF0YSB3aGljaCBkZXNjcmliZXMgeW91ciBvcmdhbml6YXRpb24sIGluY2x1ZGluZyBBcGV4IGNsYXNzZXMgYW5kIHRyaWdnZXJzLFxyXG4gKiBjdXN0b20gb2JqZWN0cywgY3VzdG9tIGZpZWxkcyBvbiBzdGFuZGFyZCBvYmplY3RzLCB0YWIgc2V0cyB0aGF0IGRlZmluZSBhbiBhcHAsXHJcbiAqIGFuZCBtYW55IG90aGVyIGNvbXBvbmVudHMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBbdmVyc2lvbl0gLSBUaGUgQVBJIHZlcnNpb24gZm9yIHdoaWNoIHlvdSB3YW50IG1ldGFkYXRhOyBmb3IgZXhhbXBsZSwgMjkuMFxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5EZXNjcmliZU1ldGFkYXRhUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxNZXRhZGF0YX5EZXNjcmliZU1ldGFkYXRhUmVzdWx0Pn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5kZXNjcmliZSA9IGZ1bmN0aW9uKHZlcnNpb24sIGNhbGxiYWNrKSB7XHJcbiAgaWYgKCFfLmlzU3RyaW5nKHZlcnNpb24pKSB7XHJcbiAgICBjYWxsYmFjayA9IHZlcnNpb247XHJcbiAgICB2ZXJzaW9uID0gdGhpcy5fY29ubi52ZXJzaW9uO1xyXG4gIH1cclxuICByZXR1cm4gdGhpcy5faW52b2tlKFwiZGVzY3JpYmVNZXRhZGF0YVwiLCB7IGFzT2ZWZXJzaW9uOiB2ZXJzaW9uIH0pLnRoZW4oZnVuY3Rpb24ocmVzKSB7XHJcbiAgICByZXMubWV0YWRhdGFPYmplY3RzID0gXy5pc0FycmF5KHJlcy5tZXRhZGF0YU9iamVjdHMpID8gcmVzLm1ldGFkYXRhT2JqZWN0cyA6IFsgcmVzLm1ldGFkYXRhT2JqZWN0cyBdO1xyXG4gICAgcmVzLm1ldGFkYXRhT2JqZWN0cyA9IF8ubWFwKHJlcy5tZXRhZGF0YU9iamVjdHMsIGZ1bmN0aW9uKG1vKSB7XHJcbiAgICAgIGlmIChtby5jaGlsZFhtbE5hbWVzKSB7XHJcbiAgICAgICAgbW8uY2hpbGRYbWxOYW1lcyA9IF8uaXNBcnJheShtby5jaGlsZFhtbE5hbWVzKSA/IG1vLmNoaWxkWG1sTmFtZXM6IFsgbW8uY2hpbGRYbWxOYW1lcyBdO1xyXG4gICAgICB9XHJcbiAgICAgIG1vLmluRm9sZGVyID0gbW8uaW5Gb2xkZXIgPT09ICd0cnVlJztcclxuICAgICAgbW8ubWV0YUZpbGUgPSBtby5tZXRhRmlsZSA9PT0gJ3RydWUnO1xyXG4gICAgICByZXR1cm4gbW87XHJcbiAgICB9KTtcclxuICAgIHJlcy5wYXJ0aWFsU2F2ZUFsbG93ZWQgPSByZXMucGFydGlhbFNhdmVBbGxvd2VkID09PSAndHJ1ZSc7XHJcbiAgICByZXMudGVzdFJlcXVpcmVkID0gcmVzLnRlc3RSZXF1aXJlZCA9PT0gJ3RydWUnO1xyXG4gICAgcmV0dXJuIHJlcztcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gTWV0YWRhdGF+TGlzdE1ldGFkYXRhUXVlcnlcclxuICogQHByb3Age1N0cmluZ30gdHlwZSAtIFRoZSBtZXRhZGF0YSB0eXBlLCBzdWNoIGFzIEN1c3RvbU9iamVjdCwgQ3VzdG9tRmllbGQsIG9yIEFwZXhDbGFzc1xyXG4gKiBAcHJvcCB7U3RyaW5nfSBbZm9sZGVyXSAtIFRoZSBmb2xkZXIgYXNzb2NpYXRlZCB3aXRoIHRoZSBjb21wb25lbnQuXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIEB0eXBlZGVmIHtPYmplY3R9IE1ldGFkYXRhfkZpbGVQcm9wZXJ0aWVzXHJcbiAqIEBwcm9wIHtTdHJpbmd9IHR5cGUgLSBUaGUgbWV0YWRhdGEgdHlwZSwgc3VjaCBhcyBDdXN0b21PYmplY3QsIEN1c3RvbUZpZWxkLCBvciBBcGV4Q2xhc3NcclxuICogQHByb3Age1N0cmluZ30gY3JlYXRlZEJ5SWQgLSBJRCBvZiB0aGUgdXNlciB3aG8gY3JlYXRlZCB0aGUgZmlsZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBjcmVhdGVkQnlOYW1lIC0gTmFtZSBvZiB0aGUgdXNlciB3aG8gY3JlYXRlZCB0aGUgZmlsZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBjcmVhdGVkRGF0ZSAtIERhdGUgYW5kIHRpbWUgd2hlbiB0aGUgZmlsZSB3YXMgY3JlYXRlZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBmaWxlTmFtZSAtIE5hbWUgb2YgdGhlIGZpbGVcclxuICogQHByb3Age1N0cmluZ30gZnVsbE5hbWUgLSBUaGUgZmlsZSBkZXZlbG9wZXIgbmFtZSB1c2VkIGFzIGEgdW5pcXVlIGlkZW50aWZpZXIgZm9yIEFQSSBhY2Nlc3NcclxuICogQHByb3Age1N0cmluZ30gaWQgLSBJRCBvZiB0aGUgZmlsZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBsYXN0TW9kaWZpZWRCeUlkIC0gSUQgb2YgdGhlIHVzZXIgd2hvIGxhc3QgbW9kaWZpZWQgdGhlIGZpbGVcclxuICogQHByb3Age1N0cmluZ30gbGFzdE1vZGlmaWVkQnlOYW1lIC0gTmFtZSBvZiB0aGUgdXNlciB3aG8gbGFzdCBtb2RpZmllZCB0aGUgZmlsZVxyXG4gKiBAcHJvcCB7U3RyaW5nfSBsYXN0TW9kaWZpZWREYXRlIC0gRGF0ZSBhbmQgdGltZSB0aGF0IHRoZSBmaWxlIHdhcyBsYXN0IG1vZGlmaWVkXHJcbiAqIEBwcm9wIHtTdHJpbmd9IFttYW5hZ2VhYmxlU3RhdGVdIC0gSW5kaWNhdGVzIHRoZSBtYW5hZ2VhYmxlIHN0YXRlIG9mIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50IGlmIGl0IGlzIGNvbnRhaW5lZCBpbiBhIHBhY2thZ2VcclxuICogQHByb3Age1N0cmluZ30gW25hbWVzcGFjZVByZWZpeF0gLSBUaGUgbmFtZXNwYWNlIHByZWZpeCBvZiB0aGUgY29tcG9uZW50XHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIFJldHJpZXZlcyBwcm9wZXJ0eSBpbmZvcm1hdGlvbiBhYm91dCBtZXRhZGF0YSBjb21wb25lbnRzIGluIHlvdXIgb3JnYW5pemF0aW9uXHJcbiAqXHJcbiAqIEBwYXJhbSB7TWV0YWRhdGF+TGlzdE1ldGFkYXRhUXVlcnl8QXJyYXkuPE1ldGFkYXRhfkxpc3RNZXRhZGF0YVF1ZXJ5Pn0gcXVlcmllcyAtIFRoZSBjcml0ZXJpYSBvYmplY3Qocykgc3BlY2lmaW5nIG1ldGFkYXRhIHRvIGxpc3RcclxuICogQHBhcmFtIHtTdHJpbmd9IFt2ZXJzaW9uXSAtIFRoZSBBUEkgdmVyc2lvbiBmb3Igd2hpY2ggeW91IHdhbnQgbWV0YWRhdGE7IGZvciBleGFtcGxlLCAyOS4wXHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPEFycmF5LjxNZXRhZGF0YX5GaWxlUHJvcGVydGllcz4+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPEFycmF5LjxNZXRhZGF0YX5GaWxlUHJvcGVydGllcz4+fVxyXG4gKi9cclxuTWV0YWRhdGEucHJvdG90eXBlLmxpc3QgPSBmdW5jdGlvbihxdWVyaWVzLCB2ZXJzaW9uLCBjYWxsYmFjaykge1xyXG4gIGlmICghXy5pc1N0cmluZyh2ZXJzaW9uKSkge1xyXG4gICAgY2FsbGJhY2sgPSB2ZXJzaW9uO1xyXG4gICAgdmVyc2lvbiA9IHRoaXMuX2Nvbm4udmVyc2lvbjtcclxuICB9XHJcbiAgaWYgKCFfLmlzQXJyYXkocXVlcmllcykpIHtcclxuICAgIHF1ZXJpZXMgPSBbIHF1ZXJpZXMgXTtcclxuICB9XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImxpc3RNZXRhZGF0YVwiLCB7IHF1ZXJpZXM6IHF1ZXJpZXMsIGFzT2ZWZXJzaW9uOiB2ZXJzaW9uIH0sIGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBNZXRhZGF0YX5SZXRyaWV2ZVJlcXVlc3RcclxuICovXHJcblxyXG4vKipcclxuICogUmV0cmlldmVzIFhNTCBmaWxlIHJlcHJlc2VudGF0aW9ucyBvZiBjb21wb25lbnRzIGluIGFuIG9yZ2FuaXphdGlvblxyXG4gKlxyXG4gKiBAcGFyYW0ge01ldGFkYXRhflJldHJpZXZlUmVxdWVzdH0gcmVxdWVzdCAtIE9wdGlvbnMgZm9yIGRldGVybWluaW5nIHdoaWNoIHBhY2thZ2VzIG9yIGZpbGVzIGFyZSByZXRyaWV2ZWRcclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+QXN5bmNSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge01ldGFkYXRhflJldHJpZXZlUmVzdWx0TG9jYXRvcn1cclxuICovXHJcbk1ldGFkYXRhLnByb3RvdHlwZS5yZXRyaWV2ZSA9IGZ1bmN0aW9uKHJlcXVlc3QsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIHJlcyA9IHRoaXMuX2ludm9rZShcInJldHJpZXZlXCIsIHsgcmVxdWVzdDogcmVxdWVzdCB9KTtcclxuICByZXR1cm4gbmV3IFJldHJpZXZlUmVzdWx0TG9jYXRvcih0aGlzLCByZXMpLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDaGVja3MgdGhlIHN0YXR1cyBvZiBkZWNsYXJhdGl2ZSBtZXRhZGF0YSBjYWxsIHJldHJpZXZlKCkgYW5kIHJldHVybnMgdGhlIHppcCBmaWxlIGNvbnRlbnRzXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBpZCAtIEFzeW5jIHByb2Nlc3MgaWQgcmV0dXJuZWQgZnJvbSBwcmV2aW91cyByZXRyaWV2ZSByZXF1ZXN0XHJcbiAqIEBwYXJhbSB7Q2FsbGJhY2suPE1ldGFkYXRhflJldHJpZXZlUmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxNZXRhZGF0YX5SZXRyaWV2ZVJlc3VsdD59XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuY2hlY2tSZXRyaWV2ZVN0YXR1cyA9IGZ1bmN0aW9uKGlkLCBjYWxsYmFjaykge1xyXG4gIHJldHVybiB0aGlzLl9pbnZva2UoXCJjaGVja1JldHJpZXZlU3RhdHVzXCIsIHsgYXN5bmNQcm9jZXNzSWQ6IGlkIH0sIGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBEZXBsb3kgY29tcG9uZW50cyBpbnRvIGFuIG9yZ2FuaXphdGlvbiB1c2luZyB6aXBwZWQgZmlsZSByZXByZXNlbnRhdGlvbnNcclxuICpcclxuICogQHBhcmFtIHtzdHJlYW0uU3RyZWFtfEJ1ZmZlcnxTdHJpbmd9IHppcElucHV0IC0gWmlwcGVkIGZpbGUgaW5wdXQgc291cmNlIGluIHJlYWRhYmxlIHN0cmVhbSwgYmluYXJ5IGJ1ZmZlciBvciBCYXNlNjQtZW5jb2RlZCBzdHJpbmdcclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSAtIE9wdGlvbnMgdXNlZCBpbiBkZXBsb3ltZW50XHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuYWxsb3dNaXNzaW5nRmlsZXNdIC0gU3BlY2lmaWVzIHdoZXRoZXIgYSBkZXBsb3kgc3VjY2VlZHMgZXZlbiBpZiBmaWxlcyB0aGF0IGFyZSBzcGVjaWZpZWQgaW4gcGFja2FnZS54bWwgYnV0IGFyZSBub3QgaW4gdGhlIC56aXAgZmlsZSBvciBub3QuXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuYXV0b1VwZGF0ZVBhY2thZ2VdIC0gSWYgYSBmaWxlIGlzIGluIHRoZSAuemlwIGZpbGUgYnV0IG5vdCBzcGVjaWZpZWQgaW4gcGFja2FnZS54bWwsIHNwZWNpZmllcyB3aGV0aGVyIHRoZSBmaWxlIHNob3VsZCBiZSBhdXRvbWF0aWNhbGx5IGFkZGVkIHRvIHRoZSBwYWNrYWdlIG9yIG5vdC5cclxuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5jaGVja09ubHldIC0gSW5kaWNhdGVzIHdoZXRoZXIgQXBleCBjbGFzc2VzIGFuZCB0cmlnZ2VycyBhcmUgc2F2ZWQgdG8gdGhlIG9yZ2FuaXphdGlvbiBhcyBwYXJ0IG9mIHRoZSBkZXBsb3ltZW50IChmYWxzZSkgb3Igbm90ICh0cnVlKS5cclxuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5pZ25vcmVXYXJuaW5nc10gLSBJbmRpY2F0ZXMgd2hldGhlciBhIHdhcm5pbmcgc2hvdWxkIGFsbG93IGEgZGVwbG95bWVudCB0byBjb21wbGV0ZSBzdWNjZXNzZnVsbHkgKHRydWUpIG9yIG5vdCAoZmFsc2UpLiBEZWZhdWx0cyB0byBmYWxzZS5cclxuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5wZXJmb3JtUmV0cmlldmVdIC0gSW5kaWNhdGVzIHdoZXRoZXIgYSByZXRyaWV2ZSgpIGNhbGwgaXMgcGVyZm9ybWVkIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBkZXBsb3ltZW50ICh0cnVlKSBvciBub3QgKGZhbHNlKS5cclxuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5wdXJnZU9uRGVsZXRlXSAtIElmIHRydWUsIHRoZSBkZWxldGVkIGNvbXBvbmVudHMgaW4gdGhlIGRlc3RydWN0aXZlQ2hhbmdlcy54bWwgbWFuaWZlc3QgZmlsZSBhcmVuJ3Qgc3RvcmVkIGluIHRoZSBSZWN5Y2xlIEJpbi5cclxuICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5yb2xsYmFja09uRXJyb3JdIC0gSW5kaWNhdGVzIHdoZXRoZXIgYW55IGZhaWx1cmUgY2F1c2VzIGEgY29tcGxldGUgcm9sbGJhY2sgKHRydWUpIG9yIG5vdCAoZmFsc2UpLlxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLnJ1bkFsbFRlc3RzXSAtIElmIHRydWUsIGFsbCBBcGV4IHRlc3RzIGRlZmluZWQgaW4gdGhlIG9yZ2FuaXphdGlvbiBhcmUgcnVuLlxyXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSBbb3B0aW9ucy5ydW5UZXN0c10gLSBBIGxpc3Qgb2YgQXBleCB0ZXN0cyB0byBiZSBydW4gZHVyaW5nIGRlcGxveW1lbnQuXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuc2luZ2xlUGFja2FnZV0gLSBJbmRpY2F0ZXMgd2hldGhlciB0aGUgc3BlY2lmaWVkIC56aXAgZmlsZSBwb2ludHMgdG8gYSBkaXJlY3Rvcnkgc3RydWN0dXJlIHdpdGggYSBzaW5nbGUgcGFja2FnZSAodHJ1ZSkgb3IgYSBzZXQgb2YgcGFja2FnZXMgKGZhbHNlKS5cclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+QXN5bmNSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge01ldGFkYXRhfkRlcGxveVJlc3VsdExvY2F0b3J9XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuZGVwbG95ID0gZnVuY3Rpb24oemlwSW5wdXQsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgaWYgKCFvcHRpb25zIHx8IF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xyXG4gICAgY2FsbGJhY2sgPSBvcHRpb25zO1xyXG4gICAgb3B0aW9ucyA9IHt9O1xyXG4gIH1cclxuICB2YXIgZGVmZXJyZWQgPSBQcm9taXNlLmRlZmVyKCk7XHJcbiAgaWYgKF8uaXNPYmplY3QoemlwSW5wdXQpICYmIF8uaXNGdW5jdGlvbih6aXBJbnB1dC5waXBlKSkge1xyXG4gICAgdmFyIGJ1ZnMgPSBbXTtcclxuICAgIHppcElucHV0Lm9uKCdkYXRhJywgZnVuY3Rpb24oZCkge1xyXG4gICAgICBidWZzLnB1c2goZCk7XHJcbiAgICB9KTtcclxuICAgIHppcElucHV0Lm9uKCdlbmQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgZGVmZXJyZWQucmVzb2x2ZShCdWZmZXIuY29uY2F0KGJ1ZnMpLnRvU3RyaW5nKCdiYXNlNjQnKSk7XHJcbiAgICB9KTtcclxuICAgIC8vIHppcElucHV0LnJlc3VtZSgpO1xyXG4gIH0gZWxzZSBpZiAoemlwSW5wdXQgaW5zdGFuY2VvZiBCdWZmZXIpIHtcclxuICAgIGRlZmVycmVkLnJlc29sdmUoemlwSW5wdXQudG9TdHJpbmcoJ2Jhc2U2NCcpKTtcclxuICB9IGVsc2UgaWYgKHppcElucHV0IGluc3RhbmNlb2YgU3RyaW5nIHx8IHR5cGVvZiB6aXBJbnB1dCA9PT0gJ3N0cmluZycpIHtcclxuICAgIGRlZmVycmVkLnJlc29sdmUoemlwSW5wdXQpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICB0aHJvdyBcIlVuZXhwZWN0ZWQgemlwSW5wdXQgdHlwZVwiO1xyXG4gIH1cclxuXHJcbiAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gIHZhciByZXMgPSBkZWZlcnJlZC5wcm9taXNlLnRoZW4oZnVuY3Rpb24oemlwQ29udGVudEI2NCkge1xyXG4gICAgcmV0dXJuIHNlbGYuX2ludm9rZShcImRlcGxveVwiLCB7XHJcbiAgICAgIFppcEZpbGU6IHppcENvbnRlbnRCNjQsXHJcbiAgICAgIERlcGxveU9wdGlvbnM6IG9wdGlvbnNcclxuICAgIH0sIGNhbGxiYWNrKTtcclxuICB9KTtcclxuICByZXR1cm4gbmV3IERlcGxveVJlc3VsdExvY2F0b3IodGhpcywgcmVzKS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKipcclxuICogQ2hlY2tzIHRoZSBzdGF0dXMgb2YgZGVjbGFyYXRpdmUgbWV0YWRhdGEgY2FsbCBkZXBsb3koKVxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaWQgLSBBc3luYyBwcm9jZXNzIGlkIHJldHVybmVkIGZyb20gcHJldmlvdXMgZGVwbG95IHJlcXVlc3RcclxuICogQHBhcmFtIHtCb29sZWFufSBbaW5jbHVkZURldGFpbHNdIC0gU2V0cyB0aGUgRGVwbG95UmVzdWx0IG9iamVjdCB0byBpbmNsdWRlIGRldGFpbHMgaW5mb3JtYXRpb24gKGRlZmF1bHQ6IGZhbHNlKVxyXG4gKiBAcGFyYW0ge0NhbGxiYWNrLjxNZXRhZGF0YX5EZXBsb3lSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPE1ldGFkYXRhfkRlcGxveVJlc3VsdD59XHJcbiAqL1xyXG5NZXRhZGF0YS5wcm90b3R5cGUuY2hlY2tEZXBsb3lTdGF0dXMgPSBmdW5jdGlvbihpZCwgaW5jbHVkZURldGFpbHMsIGNhbGxiYWNrKSB7XHJcbiAgaWYgKF8uaXNPYmplY3QoaW5jbHVkZURldGFpbHMpIHx8IF8uaXNCb29sZWFuKGluY2x1ZGVEZXRhaWxzKSkge1xyXG4gICAgaW5jbHVkZURldGFpbHMgPSAhIWluY2x1ZGVEZXRhaWxzO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBjYWxsYmFjayA9IGluY2x1ZGVEZXRhaWxzO1xyXG4gICAgaW5jbHVkZURldGFpbHMgPSBmYWxzZTtcclxuICB9XHJcbiAgcmV0dXJuIHRoaXMuX2ludm9rZShcImNoZWNrRGVwbG95U3RhdHVzXCIsIHtcclxuICAgIGFzeW5jUHJvY2Vzc0lkOiBpZCxcclxuICAgIGluY2x1ZGVEZXRhaWxzIDogaW5jbHVkZURldGFpbHNcclxuICB9KS50aGVuKGZ1bmN0aW9uKHJlcykge1xyXG4gICAgcmVzLmRvbmUgPSByZXMuZG9uZSA9PT0gJ3RydWUnO1xyXG4gICAgcmVzLnN1Y2Nlc3MgPSByZXMuc3VjY2VzcyA9PT0gJ3RydWUnO1xyXG4gICAgcmVzLmNoZWNrT25seSA9IHJlcy5jaGVja09ubHkgPT09ICd0cnVlJztcclxuICAgIGlmIChyZXMuaWdub3JlV2FybmluZ3MpIHtcclxuICAgICAgcmVzLmlnbm9yZVdhcm5pbmdzID0gcmVzLmlnbm9yZVdhcm5pbmdzID09PSAndHJ1ZSc7XHJcbiAgICB9XHJcbiAgICBpZiAocmVzLnJvbGxiYWNrT25FcnJvcikge1xyXG4gICAgICByZXMucm9sbGJhY2tPbkVycm9yID0gcmVzLnJvbGxiYWNrT25FcnJvciA9PT0gJ3RydWUnO1xyXG4gICAgfVxyXG4gICAgcmVzLm51bWJlckNvbXBvbmVudEVycm9ycyA9IE51bWJlcihyZXMubnVtYmVyQ29tcG9uZW50RXJyb3JzKTtcclxuICAgIHJlcy5udW1iZXJDb21wb25lbnRzRGVwbG95ZWQgPSBOdW1iZXIocmVzLm51bWJlckNvbXBvbmVudHNEZXBsb3llZCk7XHJcbiAgICByZXMubnVtYmVyQ29tcG9uZW50c1RvdGFsID0gTnVtYmVyKHJlcy5udW1iZXJDb21wb25lbnRzVG90YWwpO1xyXG4gICAgcmVzLm51bWJlclRlc3RFcnJvcnMgPSBOdW1iZXIocmVzLm51bWJlclRlc3RFcnJvcnMpO1xyXG4gICAgcmVzLm51bWJlclRlc3RzQ29tcGxldGVkID0gTnVtYmVyKHJlcy5udW1iZXJUZXN0c0NvbXBsZXRlZCk7XHJcbiAgICByZXMubnVtYmVyVGVzdHNUb3RhbCA9IE51bWJlcihyZXMubnVtYmVyVGVzdHNUb3RhbCk7XHJcblxyXG4gICAgcmV0dXJuIHJlcztcclxuICB9KS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5cclxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gTWV0YWRhdGF+QXN5bmNSZXN1bHRcclxuICogQHByb3Age0Jvb2xlYW59IGRvbmUgLSBJbmRpY2F0ZXMgd2hldGhlciB0aGUgY2FsbCBoYXMgY29tcGxldGVkIG9yIG5vdFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBpZCAtIElEIG9mIHRoZSBjb21wb25lbnQgYmVpbmcgY3JlYXRlZCwgdXBkYXRlZCwgZGVsZXRlZCwgZGVwbG95ZWQsIG9yIHJldHJpZXZlZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBzdGF0ZSAtIFRoZSBzdGF0ZSBmb3VyIHBvc3NpYmxlIHZhbHVlczogUXVldWVkLCBJblByb2dyZXNzLCBDb21wbGV0ZWQsIGFuZCBFcnJvci5cclxuICogQHByb3Age1N0cmluZ30gW3N0YXR1c0NvZGVdIC0gSWYgYW4gZXJyb3Igb2NjdXJyZWQgZHVyaW5nIHRoZSBjcmVhdGUoKSwgdXBkYXRlKCksIG9yIGRlbGV0ZSgpIGNhbGwsIGEgc3RhdHVzIGNvZGUgaXMgcmV0dXJuZWRcclxuICogQHByb3Age1N0cmluZ30gW21lc3NhZ2VdIC0gTWVzc2FnZSBjb3JyZXNwb25kaW5nIHRvIHRoZSBzdGF0dXNDb2RlIGZpZWxkIHJldHVybmVkXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIFRoZSBsb2NhdG9yIGNsYXNzIGZvciBNZXRhZGF0YSBBUEkgYXN5bmNocm9ub3VzIGNhbGwgcmVzdWx0XHJcbiAqXHJcbiAqIEBwcm90ZWN0ZWRcclxuICogQGNsYXNzIE1ldGFkYXRhfkFzeW5jUmVzdWx0TG9jYXRvclxyXG4gKiBAZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyXHJcbiAqIEBpbXBsZW1lbnRzIFByb21pc2UuPE1ldGFkYXRhfkFzeW5jUmVzdWx0fEFycmF5LjxNZXRhZGF0YX5Bc3luY1Jlc3VsdD4+XHJcbiAqIEBwYXJhbSB7TWV0YWRhdGF9IG1ldGEgLSBNZXRhZGF0YSBBUEkgb2JqZWN0XHJcbiAqIEBwYXJhbSB7UHJvbWlzZS48TWV0YWRhdGF+QXN5bmNSZXN1bHR8QXJyYXkuPE1ldGFkYXRhfkFzeW5jUmVzdWx0Pj59IHJlc3VsdHMgLSBQcm9taXNlIG9iamVjdCBmb3IgYXN5bmMgcmVzdWx0IGluZm9cclxuICogQHBhcmFtIHtCb29sZWFufSBbaXNBcnJheV0gLSBJbmRpY2F0ZXMgd2hldGhlciB0aGUgYXN5bmMgcmVxdWVzdCBpcyBnaXZlbiBpbiBhcnJheSBvciBzaW5nbGUgb2JqZWN0XHJcbiAqL1xyXG52YXIgQXN5bmNSZXN1bHRMb2NhdG9yID0gZnVuY3Rpb24obWV0YSwgcmVzdWx0cywgaXNBcnJheSkge1xyXG4gIHRoaXMuX21ldGEgPSBtZXRhO1xyXG4gIHRoaXMuX3Jlc3VsdHMgPSByZXN1bHRzO1xyXG4gIHRoaXMuX2lzQXJyYXkgPSBpc0FycmF5O1xyXG59O1xyXG5cclxuaW5oZXJpdHMoQXN5bmNSZXN1bHRMb2NhdG9yLCBldmVudHMuRXZlbnRFbWl0dGVyKTtcclxuXHJcbi8qKlxyXG4gKiBQcm9taXNlL0ErIGludGVyZmFjZVxyXG4gKiBodHRwOi8vcHJvbWlzZXMtYXBsdXMuZ2l0aHViLmlvL3Byb21pc2VzLXNwZWMvXHJcbiAqXHJcbiAqIERlbGVnYXRlIHRvIGRlZmVycmVkIHByb21pc2UsIHJldHVybiBwcm9taXNlIGluc3RhbmNlIGZvciBiYXRjaCByZXN1bHRcclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3IjdGhlblxyXG4gKi9cclxuQXN5bmNSZXN1bHRMb2NhdG9yLnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24ob25SZXNvbHZlLCBvblJlamVjdCkge1xyXG4gIHZhciBzZWxmID0gdGhpcztcclxuICByZXR1cm4gdGhpcy5fcmVzdWx0cy50aGVuKGZ1bmN0aW9uKHJlc3VsdHMpIHtcclxuICAgIHZhciBjb252ZXJ0VHlwZSA9IGZ1bmN0aW9uKHJlcykge1xyXG4gICAgICBpZiAocmVzLiQgJiYgcmVzLiRbXCJ4c2k6bmlsXCJdID09PSAndHJ1ZScpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICByZXMuZG9uZSA9IHJlcy5kb25lID09PSAndHJ1ZSc7XHJcbiAgICAgIHJldHVybiByZXM7XHJcbiAgICB9O1xyXG4gICAgcmVzdWx0cyA9IF8uaXNBcnJheShyZXN1bHRzKSA/IF8ubWFwKHJlc3VsdHMsIGNvbnZlcnRUeXBlKSA6IGNvbnZlcnRUeXBlKHJlc3VsdHMpO1xyXG4gICAgaWYgKHNlbGYuX2lzQXJyYXkgJiYgIV8uaXNBcnJheShyZXN1bHRzKSkge1xyXG4gICAgICByZXN1bHRzID0gWyByZXN1bHRzIF07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gb25SZXNvbHZlKHJlc3VsdHMpO1xyXG4gIH0sIG9uUmVqZWN0KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQcm9taXNlL0ErIGV4dGVuc2lvblxyXG4gKiBDYWxsIFwidGhlblwiIHVzaW5nIGdpdmVuIG5vZGUtc3R5bGUgY2FsbGJhY2sgZnVuY3Rpb25cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3IjdGhlbkNhbGxcclxuICovXHJcbkFzeW5jUmVzdWx0TG9jYXRvci5wcm90b3R5cGUudGhlbkNhbGwgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHJldHVybiBfLmlzRnVuY3Rpb24oY2FsbGJhY2spID8gdGhpcy50aGVuKGZ1bmN0aW9uKHJlcykge1xyXG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcclxuICAgICAgY2FsbGJhY2sobnVsbCwgcmVzKTtcclxuICAgIH0pO1xyXG4gIH0sIGZ1bmN0aW9uKGVycikge1xyXG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcclxuICAgICAgY2FsbGJhY2soZXJyKTtcclxuICAgIH0pO1xyXG4gIH0pIDogdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDaGVjayB0aGUgc3RhdHVzIG9mIGFzeW5jIHJlcXVlc3RcclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3IjY2hlY2tcclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+QXN5bmNSZXN1bHR8QXJyYXkuPE1ldGFkYXRhfkFzeW5jUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48TWV0YWRhdGF+QXN5bmNSZXN1bHR8QXJyYXkuPE1ldGFkYXRhfkFzeW5jUmVzdWx0Pj59XHJcbiAqL1xyXG5Bc3luY1Jlc3VsdExvY2F0b3IucHJvdG90eXBlLmNoZWNrID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgdmFyIG1ldGEgPSB0aGlzLl9tZXRhO1xyXG4gIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24ocmVzdWx0cykge1xyXG4gICAgdmFyIGlkcyA9IF8uaXNBcnJheShyZXN1bHRzKSA/IF8ubWFwKHJlc3VsdHMsIGZ1bmN0aW9uKHJlcyl7IHJldHVybiByZXMuaWQ7IH0pIDogcmVzdWx0cy5pZDtcclxuICAgIHNlbGYuX2lkcyA9IGlkcztcclxuICAgIHJldHVybiBtZXRhLmNoZWNrU3RhdHVzKGlkcyk7XHJcbiAgfSkudGhlbkNhbGwoY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFBvbGxpbmcgdW50aWwgYXN5bmMgY2FsbCBzdGF0dXMgYmVjb21lcyBjb21wbGV0ZSBvciBlcnJvclxyXG4gKlxyXG4gKiBAbWV0aG9kIE1ldGFkYXRhfkFzeW5jUmVzdWx0TG9jYXRvciNwb2xsXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBpbnRlcnZhbCAtIFBvbGxpbmcgaW50ZXJ2YWwgaW4gbWlsbGlzZWNvbmRzXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lb3V0IC0gUG9sbGluZyB0aW1lb3V0IGluIG1pbGxpc2Vjb25kc1xyXG4gKi9cclxuQXN5bmNSZXN1bHRMb2NhdG9yLnByb3RvdHlwZS5wb2xsID0gZnVuY3Rpb24oaW50ZXJ2YWwsIHRpbWVvdXQpIHtcclxuICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgdmFyIHN0YXJ0VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gIHZhciBwb2xsID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XHJcbiAgICBpZiAoc3RhcnRUaW1lICsgdGltZW91dCA8IG5vdykge1xyXG4gICAgICB2YXIgZXJyTXNnID0gXCJQb2xsaW5nIHRpbWUgb3V0LlwiO1xyXG4gICAgICBpZiAoc2VsZi5faWRzKSB7XHJcbiAgICAgICAgZXJyTXNnICs9IFwiIFByb2Nlc3MgSWQgPSBcIiArIHNlbGYuX2lkcztcclxuICAgICAgfVxyXG4gICAgICBzZWxmLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKGVyck1zZykpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBzZWxmLmNoZWNrKCkudGhlbihmdW5jdGlvbihyZXN1bHRzKSB7XHJcbiAgICAgIHZhciBkb25lID0gdHJ1ZTtcclxuICAgICAgdmFyIHJlc3VsdEFyciA9IF8uaXNBcnJheShyZXN1bHRzKSA/IHJlc3VsdHMgOiBbIHJlc3VsdHMgXTtcclxuICAgICAgZm9yICh2YXIgaT0wLCBsZW49cmVzdWx0QXJyLmxlbmd0aDsgaTxsZW47IGkrKykge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSByZXN1bHRBcnJbaV07XHJcbiAgICAgICAgaWYgKHJlc3VsdCAmJiAhcmVzdWx0LmRvbmUpIHtcclxuICAgICAgICAgIHNlbGYuZW1pdCgncHJvZ3Jlc3MnLCByZXN1bHQpO1xyXG4gICAgICAgICAgZG9uZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAoZG9uZSkge1xyXG4gICAgICAgIHNlbGYuZW1pdCgnY29tcGxldGUnLCByZXN1bHRzKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBzZXRUaW1lb3V0KHBvbGwsIGludGVydmFsKTtcclxuICAgICAgfVxyXG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XHJcbiAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgfSk7XHJcbiAgfTtcclxuICBzZXRUaW1lb3V0KHBvbGwsIGludGVydmFsKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDaGVjayBhbmQgd2FpdCB1bnRpbCB0aGUgYXN5bmMgcmVxdWVzdHMgYmVjb21lIGluIGNvbXBsZXRlZCBzdGF0dXNcclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3IjY29tcGxldGVcclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+QXN5bmNSZXN1bHR8QXJyYXkuPE1ldGFkYXRhfkFzeW5jUmVzdWx0Pj59IFtjYWxsYmFja10gLSBDYWxsYmFjayBmdW5jdGlvblxyXG4gKiBAcmV0dXJucyB7UHJvbWlzZS48TWV0YWRhdGF+QXN5bmNSZXN1bHR8QXJyYXkuPE1ldGFkYXRhfkFzeW5jUmVzdWx0Pj59XHJcbiAqL1xyXG5Bc3luY1Jlc3VsdExvY2F0b3IucHJvdG90eXBlLmNvbXBsZXRlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcclxuICB2YXIgZGVmZXJyZWQgPSBQcm9taXNlLmRlZmVyKCk7XHJcbiAgdGhpcy5vbignY29tcGxldGUnLCBmdW5jdGlvbihyZXN1bHRzKSB7XHJcbiAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdHMpO1xyXG4gIH0pO1xyXG4gIHRoaXMub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKSB7XHJcbiAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcclxuICB9KTtcclxuICB2YXIgbWV0YSA9IHRoaXMuX21ldGE7XHJcbiAgdGhpcy5wb2xsKG1ldGEucG9sbEludGVydmFsLCBtZXRhLnBvbGxUaW1lb3V0KTtcclxuICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZS50aGVuQ2FsbChjYWxsYmFjayk7XHJcbn07XHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLyoqXHJcbiAqIFRoZSBsb2NhdG9yIGNsYXNzIHRvIHRyYWNrIHJldHJlaXZlKCkgTWV0YWRhdGEgQVBJIGNhbGwgcmVzdWx0XHJcbiAqXHJcbiAqIEBwcm90ZWN0ZWRcclxuICogQGNsYXNzIE1ldGFkYXRhflJldHJpZXZlUmVzdWx0TG9jYXRvclxyXG4gKiBAZXh0ZW5kcyBNZXRhZGF0YX5Bc3luY1Jlc3VsdExvY2F0b3JcclxuICogQHBhcmFtIHtNZXRhZGF0YX0gbWV0YSAtIE1ldGFkYXRhIEFQSSBvYmplY3RcclxuICogQHBhcmFtIHtQcm9taXNlLjxNZXRhZGF0YX5Bc3luY1Jlc3VsdD59IHJlc3VsdCAtIFByb21pc2Ugb2JqZWN0IGZvciBhc3luYyByZXN1bHQgb2YgcmV0cmlldmUgY2FsbCgpXHJcbiAqL1xyXG52YXIgUmV0cmlldmVSZXN1bHRMb2NhdG9yID0gZnVuY3Rpb24obWV0YSwgcmVzdWx0KSB7XHJcbiAgUmV0cmlldmVSZXN1bHRMb2NhdG9yLnN1cGVyXy5jYWxsKHRoaXMsIG1ldGEsIHJlc3VsdCk7XHJcbn07XHJcblxyXG5pbmhlcml0cyhSZXRyaWV2ZVJlc3VsdExvY2F0b3IsIEFzeW5jUmVzdWx0TG9jYXRvcik7XHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gTWV0YWRhdGF+UmV0cmlldmVSZXN1bHRcclxuICogQHByb3Age0FycmF5LjxNZXRhZGF0YX5GaWxlUHJvcGVydGllcz59IGZpbGVQcm9wZXJ0aWVzIC0gQ29udGFpbnMgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHByb3BlcnRpZXMgb2YgZWFjaCBjb21wb25lbnQgaW4gdGhlIC56aXAgZmlsZSwgYW5kIHRoZSBtYW5pZmVzdCBmaWxlIHBhY2thZ2UueG1sXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGlkIC0gSUQgb2YgdGhlIGNvbXBvbmVudCBiZWluZyByZXRyaWV2ZWRcclxuICogQHByb3Age0FycmF5LjxPYmplY3Q+fSBtZXNzYWdlcyAtIENvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSBzdWNjZXNzIG9yIGZhaWx1cmUgb2YgdGhlIHJldHJpZXZlKCkgY2FsbFxyXG4gKiBAcHJvcCB7U3RyaW5nfSB6aXBGaWxlIC0gVGhlIHppcCBmaWxlIHJldHVybmVkIGJ5IHRoZSByZXRyaWV2ZSByZXF1ZXN0LiBCYXNlIDY0LWVuY29kZWQgYmluYXJ5IGRhdGFcclxuICovXHJcblxyXG4vKipcclxuICogQ2hlY2sgYW5kIHdhaXQgdW50aWwgdGhlIGFzeW5jIHJlcXVlc3QgYmVjb21lcyBpbiBjb21wbGV0ZWQgc3RhdHVzLFxyXG4gKiBhbmQgcmV0cmlldmUgdGhlIHJlc3VsdCBkYXRhLlxyXG4gKlxyXG4gKiBAbWVtdGhvZCBNZXRhZGF0YX5SZXRyaWV2ZVJlc3VsdExvY2F0b3IjY29tcGxldGVcclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+UmV0cmlldmVSZXN1bHQ+fSBbY2FsbGJhY2tdIC0gQ2FsbGJhY2sgZnVuY3Rpb25cclxuICogQHJldHVybnMge1Byb21pc2UuPE1ldGFkYXRhflJldHJpZXZlUmVzdWx0Pn1cclxuICovXHJcblJldHJpZXZlUmVzdWx0TG9jYXRvci5wcm90b3R5cGUuY29tcGxldGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gIHZhciBtZXRhID0gdGhpcy5fbWV0YTtcclxuICByZXR1cm4gUmV0cmlldmVSZXN1bHRMb2NhdG9yLnN1cGVyXy5wcm90b3R5cGUuY29tcGxldGUuY2FsbCh0aGlzKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCkge1xyXG4gICAgcmV0dXJuIG1ldGEuY2hlY2tSZXRyaWV2ZVN0YXR1cyhyZXN1bHQuaWQpO1xyXG4gIH0pLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDaGFuZ2UgdGhlIHJldHJpZXZlZCByZXN1bHQgdG8gTm9kZS5qcyByZWFkYWJsZSBzdHJlYW1cclxuICpcclxuICogQG1ldGhvZCBNZXRhZGF0YX5SZXRyaWV2ZVJlc3VsdExvY2F0b3Ijc3RyZWFtXHJcbiAqIEByZXR1cm5zIHtzdHJlYW0uUmVhZGFibGV9XHJcbiAqL1xyXG5SZXRyaWV2ZVJlc3VsdExvY2F0b3IucHJvdG90eXBlLnN0cmVhbSA9IGZ1bmN0aW9uKCkge1xyXG4gIHZhciBzZWxmID0gdGhpcztcclxuICB2YXIgcmVzdWx0U3RyZWFtID0gbmV3IHN0cmVhbS5SZWFkYWJsZSgpO1xyXG4gIHZhciByZWFkaW5nID0gZmFsc2U7XHJcbiAgcmVzdWx0U3RyZWFtLl9yZWFkID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAocmVhZGluZykgeyByZXR1cm47IH1cclxuICAgIHJlYWRpbmcgPSB0cnVlO1xyXG4gICAgc2VsZi5jb21wbGV0ZShmdW5jdGlvbihlcnIsIHJlc3VsdCkge1xyXG4gICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgcmVzdWx0U3RyZWFtLmVtaXQoJ2Vycm9yJywgZXJyKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXN1bHRTdHJlYW0ucHVzaChuZXcgQnVmZmVyKHJlc3VsdC56aXBGaWxlLCAnYmFzZTY0JykpO1xyXG4gICAgICAgIHJlc3VsdFN0cmVhbS5wdXNoKG51bGwpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9O1xyXG4gIHJldHVybiByZXN1bHRTdHJlYW07XHJcbn07XHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLyoqXHJcbiAqIFRoZSBsb2NhdG9yIGNsYXNzIHRvIHRyYWNrIGRlcGxveSgpIE1ldGFkYXRhIEFQSSBjYWxsIHJlc3VsdFxyXG4gKlxyXG4gKiBAcHJvdGVjdGVkXHJcbiAqIEBjbGFzcyBNZXRhZGF0YX5EZXBsb3lSZXN1bHRMb2NhdG9yXHJcbiAqIEBleHRlbmRzIE1ldGFkYXRhfkFzeW5jUmVzdWx0TG9jYXRvclxyXG4gKiBAcGFyYW0ge01ldGFkYXRhfSBtZXRhIC0gTWV0YWRhdGEgQVBJIG9iamVjdFxyXG4gKiBAcGFyYW0ge1Byb21pc2UuPE1ldGFkYXRhfkFzeW5jUmVzdWx0Pn0gcmVzdWx0IC0gUHJvbWlzZSBvYmplY3QgZm9yIGFzeW5jIHJlc3VsdCBvZiBkZXBsb3koKSBjYWxsXHJcbiAqL1xyXG52YXIgRGVwbG95UmVzdWx0TG9jYXRvciA9IGZ1bmN0aW9uKG1ldGEsIHJlc3VsdCkge1xyXG4gIERlcGxveVJlc3VsdExvY2F0b3Iuc3VwZXJfLmNhbGwodGhpcywgbWV0YSwgcmVzdWx0KTtcclxufTtcclxuXHJcbmluaGVyaXRzKERlcGxveVJlc3VsdExvY2F0b3IsIEFzeW5jUmVzdWx0TG9jYXRvcik7XHJcblxyXG4vKipcclxuICogQHR5cGVkZWYge09iamVjdH0gTWV0YWRhdGF+RGVwbG95UmVzdWx0XHJcbiAqIEBwcm9wIHtTdHJpbmd9IGlkIC0gSUQgb2YgdGhlIGNvbXBvbmVudCBiZWluZyBkZXBsb3llZFxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gY2hlY2tPbmx5IC0gSW5kaWNhdGVzIHdoZXRoZXIgdGhpcyBkZXBsb3ltZW50IGlzIGJlaW5nIHVzZWQgdG8gY2hlY2sgdGhlIHZhbGlkaXR5IG9mIHRoZSBkZXBsb3llZCBmaWxlcyB3aXRob3V0IG1ha2luZyBhbnkgY2hhbmdlcyBpbiB0aGUgb3JnYW5pemF0aW9uIG9yIG5vdFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBjb21wbGV0ZWREYXRlIC0gVGltZXN0YW1wIGZvciB3aGVuIHRoZSBkZXBsb3ltZW50IHByb2Nlc3MgZW5kZWRcclxuICogQHByb3Age1N0cmluZ30gY3JlYXRlZERhdGUgLSBUaW1lc3RhbXAgZm9yIHdoZW4gdGhlIGRlcGxveSgpIGNhbGwgd2FzIHJlY2VpdmVkXHJcbiAqIEBwcm9wIHtBcnJheS48T2JqZWN0Pn0gW2RldGFpbHNdIC0gUHJvdmlkZXMgdGhlIGRldGFpbHMgb2YgYSBkZXBsb3ltZW50IHRoYXQgaXMgaW4tcHJvZ3Jlc3Mgb3IgZW5kZWQsIGlmIGluY2x1ZGVEZXRhaWxzIGlzIHNldCB0byB0cnVlIGluIGNoZWNrRGVwbG95U3RhdHVzKCkgY2FsbFxyXG4gKiBAcHJvcCB7Qm9vbGVhbn0gZG9uZSAtIEluZGljYXRlcyB3aGV0aGVyIHRoZSBzZXJ2ZXIgZmluaXNoZWQgcHJvY2Vzc2luZyB0aGUgZGVwbG95KCkgY2FsbCBmb3IgdGhlIHNwZWNpZmllZCBpZFxyXG4gKiBAcHJvcCB7U3RyaW5nfSBbZXJyb3JNZXNzYWdlXSAtIE1lc3NhZ2UgY29ycmVzcG9uZGluZyB0byB0aGUgdmFsdWVzIGluIHRoZSBlcnJvclN0YXR1c0NvZGUgZmllbGRcclxuICogQHByb3Age1N0cmluZ30gW2Vycm9yU3RhdHVzQ29kZV0gLSBJZiBhbiBlcnJvciBvY2N1cnJlZCBkdXJpbmcgdGhlIGRlcGxveSgpIGNhbGwsIGEgc3RhdHVzIGNvZGUgaXMgcmV0dXJuZWQsIGFuZCB0aGUgbWVzc2FnZSBjb3JyZXNwb25kaW5nIHRvIHRoZSBzdGF0dXMgY29kZSBpcyByZXR1cm5lZCBpbiB0aGUgZXJyb3JNZXNzYWdlZmllbGRcclxuICogQHByb3Age0Jvb2xlYW59IFtpZ25vcmVXYXJuaW5nc10gLSBTcGVjaWZpZXMgd2hldGhlciBhIGRlcGxveW1lbnQgc2hvdWxkIGNvbnRpbnVlIGV2ZW4gaWYgdGhlIGRlcGxveW1lbnQgZ2VuZXJhdGVzIHdhcm5pbmdzXHJcbiAqIEBwcm9wIHtTdHJpbmd9IGxhc3RNb2RpZmllZERhdGUgLSBUaW1lc3RhbXAgb2YgdGhlIGxhc3QgdXBkYXRlIGZvciB0aGUgZGVwbG95bWVudCBwcm9jZXNzXHJcbiAqIEBwcm9wIHtOdW1iZXJ9IG51bWJlckNvbXBvbmVudEVycm9ycyAtIFRoZSBudW1iZXIgb2YgY29tcG9uZW50cyB0aGF0IGdlbmVyYXRlZCBlcnJvcnMgZHVyaW5nIHRoaXMgZGVwbG95bWVudFxyXG4gKiBAcHJvcCB7TnVtYmVyfSBudW1iZXJDb21wb25lbnRzRGVwbG95ZWQgLSBUaGUgbnVtYmVyIG9mIGNvbXBvbmVudHMgZGVwbG95ZWQgaW4gdGhlIGRlcGxveW1lbnQgcHJvY2Vzc1xyXG4gKiBAcHJvcCB7TnVtYmVyfSBudW1iZXJDb21wb25lbnRzVG90YWwgLSBUaGUgdG90YWwgbnVtYmVyIG9mIGNvbXBvbmVudHMgaW4gdGhlIGRlcGxveW1lbnRcclxuICogQHByb3Age051bWJlcn0gbnVtYmVyVGVzdEVycm9ycyAtIFRoZSBudW1iZXIgb2YgQXBleCB0ZXN0cyB0aGF0IGhhdmUgZ2VuZXJhdGVkIGVycm9ycyBkdXJpbmcgdGhpcyBkZXBsb3ltZW50XHJcbiAqIEBwcm9wIHtOdW1iZXJ9IG51bWJlclRlc3RzQ29tcGxldGVkIC0gVGhlIG51bWJlciBvZiBjb21wbGV0ZWRBcGV4IHRlc3RzIGZvciB0aGlzIGRlcGxveW1lbnRcclxuICogQHByb3Age051bWJlcn0gbnVtYmVyVGVzdHNUb3RhbCAtIFRoZSB0b3RhbCBudW1iZXIgb2YgQXBleCB0ZXN0cyBmb3IgdGhpcyBkZXBsb3ltZW50XHJcbiAqIEBwcm9wIHtCb29sZWFufSBbcm9sbGJhY2tPbkVycm9yXSAtIEluZGljYXRlcyB3aGV0aGVyIGFueSBmYWlsdXJlIGNhdXNlcyBhIGNvbXBsZXRlIHJvbGxiYWNrIG9yIG5vdC4gRGVmYXVsdCBpcyB0cnVlLlxyXG4gKiBAcHJvcCB7U3RyaW5nfSBzdGFydERhdGUgLSBUaW1lc3RhbXAgZm9yIHdoZW4gdGhlIGRlcGxveW1lbnQgcHJvY2VzcyBiZWdhblxyXG4gKiBAcHJvcCB7U3RyaW5nfSBzdGF0dXMgLSBJbmRpY2F0ZXMgdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIGRlcGxveW1lbnRcclxuICogQHByb3Age0Jvb2xlYW59IHN1Y2Nlc3MgLSBJbmRpY2F0ZXMgd2hldGhlciB0aGUgZGVwbG95bWVudCB3YXMgc3VjY2Vzc2Z1bCBvciBub3RcclxuICovXHJcblxyXG4vKipcclxuICogQ2hlY2sgYW5kIHdhaXQgdW50aWwgdGhlIGFzeW5jIHJlcXVlc3QgYmVjb21lcyBpbiBjb21wbGV0ZWQgc3RhdHVzLFxyXG4gKiBhbmQgcmV0cmlldmUgdGhlIHJlc3VsdCBkYXRhLlxyXG4gKlxyXG4gKiBAbWV0aG9kIE1ldGFkYXRhfkRlcGxveVJlc3VsdExvY2F0b3IjY29tcGxldGVcclxuICogQHBhcmFtIHtDYWxsYmFjay48TWV0YWRhdGF+RGVwbG95UmVzdWx0Pn0gW2NhbGxiYWNrXSAtIENhbGxiYWNrIGZ1bmN0aW9uXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlLjxNZXRhZGF0YX5EZXBsb3lSZXN1bHQ+fVxyXG4gKi9cclxuRGVwbG95UmVzdWx0TG9jYXRvci5wcm90b3R5cGUuY29tcGxldGUgPSBmdW5jdGlvbihpbmNsdWRlRGV0YWlscywgY2FsbGJhY2spIHtcclxuICBpZiAoXy5pc0Z1bmN0aW9uKGluY2x1ZGVEZXRhaWxzKSkge1xyXG4gICAgY2FsbGJhY2sgPSBpbmNsdWRlRGV0YWlscztcclxuICAgIGluY2x1ZGVEZXRhaWxzID0gZmFsc2U7XHJcbiAgfVxyXG4gIHZhciBtZXRhID0gdGhpcy5fbWV0YTtcclxuICByZXR1cm4gRGVwbG95UmVzdWx0TG9jYXRvci5zdXBlcl8ucHJvdG90eXBlLmNvbXBsZXRlLmNhbGwodGhpcykudGhlbihmdW5jdGlvbihyZXN1bHQpIHtcclxuICAgIHJldHVybiBtZXRhLmNoZWNrRGVwbG95U3RhdHVzKHJlc3VsdC5pZCwgaW5jbHVkZURldGFpbHMpO1xyXG4gIH0pLnRoZW5DYWxsKGNhbGxiYWNrKTtcclxufTtcclxuXHJcblxyXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuLypcclxuICogUmVnaXN0ZXIgaG9vayBpbiBjb25uZWN0aW9uIGluc3RhbnRpYXRpb24gZm9yIGR5bmFtaWNhbGx5IGFkZGluZyB0aGlzIEFQSSBtb2R1bGUgZmVhdHVyZXNcclxuICovXHJcbmpzZm9yY2Uub24oJ2Nvbm5lY3Rpb246bmV3JywgZnVuY3Rpb24oY29ubikge1xyXG4gIGNvbm4ubWV0YWRhdGEgPSBuZXcgTWV0YWRhdGEoY29ubik7XHJcbn0pO1xyXG4iLCIndXNlIHN0cmljdCdcblxuZXhwb3J0cy50b0J5dGVBcnJheSA9IHRvQnl0ZUFycmF5XG5leHBvcnRzLmZyb21CeXRlQXJyYXkgPSBmcm9tQnl0ZUFycmF5XG5cbnZhciBsb29rdXAgPSBbXVxudmFyIHJldkxvb2t1cCA9IFtdXG52YXIgQXJyID0gdHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnID8gVWludDhBcnJheSA6IEFycmF5XG5cbmZ1bmN0aW9uIGluaXQgKCkge1xuICB2YXIgY29kZSA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJ1xuICBmb3IgKHZhciBpID0gMCwgbGVuID0gY29kZS5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGxvb2t1cFtpXSA9IGNvZGVbaV1cbiAgICByZXZMb29rdXBbY29kZS5jaGFyQ29kZUF0KGkpXSA9IGlcbiAgfVxuXG4gIHJldkxvb2t1cFsnLScuY2hhckNvZGVBdCgwKV0gPSA2MlxuICByZXZMb29rdXBbJ18nLmNoYXJDb2RlQXQoMCldID0gNjNcbn1cblxuaW5pdCgpXG5cbmZ1bmN0aW9uIHRvQnl0ZUFycmF5IChiNjQpIHtcbiAgdmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcbiAgdmFyIGxlbiA9IGI2NC5sZW5ndGhcblxuICBpZiAobGVuICUgNCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuICB9XG5cbiAgLy8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcbiAgLy8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuICAvLyByZXByZXNlbnQgb25lIGJ5dGVcbiAgLy8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG4gIC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2VcbiAgcGxhY2VIb2xkZXJzID0gYjY0W2xlbiAtIDJdID09PSAnPScgPyAyIDogYjY0W2xlbiAtIDFdID09PSAnPScgPyAxIDogMFxuXG4gIC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuICBhcnIgPSBuZXcgQXJyKGxlbiAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG4gIC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcbiAgbCA9IHBsYWNlSG9sZGVycyA+IDAgPyBsZW4gLSA0IDogbGVuXG5cbiAgdmFyIEwgPSAwXG5cbiAgZm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuICAgIHRtcCA9IChyZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSldIDw8IDE4KSB8IChyZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSArIDEpXSA8PCAxMikgfCAocmV2TG9va3VwW2I2NC5jaGFyQ29kZUF0KGkgKyAyKV0gPDwgNikgfCByZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSArIDMpXVxuICAgIGFycltMKytdID0gKHRtcCA+PiAxNikgJiAweEZGXG4gICAgYXJyW0wrK10gPSAodG1wID4+IDgpICYgMHhGRlxuICAgIGFycltMKytdID0gdG1wICYgMHhGRlxuICB9XG5cbiAgaWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuICAgIHRtcCA9IChyZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSldIDw8IDIpIHwgKHJldkxvb2t1cFtiNjQuY2hhckNvZGVBdChpICsgMSldID4+IDQpXG4gICAgYXJyW0wrK10gPSB0bXAgJiAweEZGXG4gIH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG4gICAgdG1wID0gKHJldkxvb2t1cFtiNjQuY2hhckNvZGVBdChpKV0gPDwgMTApIHwgKHJldkxvb2t1cFtiNjQuY2hhckNvZGVBdChpICsgMSldIDw8IDQpIHwgKHJldkxvb2t1cFtiNjQuY2hhckNvZGVBdChpICsgMildID4+IDIpXG4gICAgYXJyW0wrK10gPSAodG1wID4+IDgpICYgMHhGRlxuICAgIGFycltMKytdID0gdG1wICYgMHhGRlxuICB9XG5cbiAgcmV0dXJuIGFyclxufVxuXG5mdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuICByZXR1cm4gbG9va3VwW251bSA+PiAxOCAmIDB4M0ZdICsgbG9va3VwW251bSA+PiAxMiAmIDB4M0ZdICsgbG9va3VwW251bSA+PiA2ICYgMHgzRl0gKyBsb29rdXBbbnVtICYgMHgzRl1cbn1cblxuZnVuY3Rpb24gZW5jb2RlQ2h1bmsgKHVpbnQ4LCBzdGFydCwgZW5kKSB7XG4gIHZhciB0bXBcbiAgdmFyIG91dHB1dCA9IFtdXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSArPSAzKSB7XG4gICAgdG1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuICAgIG91dHB1dC5wdXNoKHRyaXBsZXRUb0Jhc2U2NCh0bXApKVxuICB9XG4gIHJldHVybiBvdXRwdXQuam9pbignJylcbn1cblxuZnVuY3Rpb24gZnJvbUJ5dGVBcnJheSAodWludDgpIHtcbiAgdmFyIHRtcFxuICB2YXIgbGVuID0gdWludDgubGVuZ3RoXG4gIHZhciBleHRyYUJ5dGVzID0gbGVuICUgMyAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuICB2YXIgb3V0cHV0ID0gJydcbiAgdmFyIHBhcnRzID0gW11cbiAgdmFyIG1heENodW5rTGVuZ3RoID0gMTYzODMgLy8gbXVzdCBiZSBtdWx0aXBsZSBvZiAzXG5cbiAgLy8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuICBmb3IgKHZhciBpID0gMCwgbGVuMiA9IGxlbiAtIGV4dHJhQnl0ZXM7IGkgPCBsZW4yOyBpICs9IG1heENodW5rTGVuZ3RoKSB7XG4gICAgcGFydHMucHVzaChlbmNvZGVDaHVuayh1aW50OCwgaSwgKGkgKyBtYXhDaHVua0xlbmd0aCkgPiBsZW4yID8gbGVuMiA6IChpICsgbWF4Q2h1bmtMZW5ndGgpKSlcbiAgfVxuXG4gIC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcbiAgaWYgKGV4dHJhQnl0ZXMgPT09IDEpIHtcbiAgICB0bXAgPSB1aW50OFtsZW4gLSAxXVxuICAgIG91dHB1dCArPSBsb29rdXBbdG1wID4+IDJdXG4gICAgb3V0cHV0ICs9IGxvb2t1cFsodG1wIDw8IDQpICYgMHgzRl1cbiAgICBvdXRwdXQgKz0gJz09J1xuICB9IGVsc2UgaWYgKGV4dHJhQnl0ZXMgPT09IDIpIHtcbiAgICB0bXAgPSAodWludDhbbGVuIC0gMl0gPDwgOCkgKyAodWludDhbbGVuIC0gMV0pXG4gICAgb3V0cHV0ICs9IGxvb2t1cFt0bXAgPj4gMTBdXG4gICAgb3V0cHV0ICs9IGxvb2t1cFsodG1wID4+IDQpICYgMHgzRl1cbiAgICBvdXRwdXQgKz0gbG9va3VwWyh0bXAgPDwgMikgJiAweDNGXVxuICAgIG91dHB1dCArPSAnPSdcbiAgfVxuXG4gIHBhcnRzLnB1c2gob3V0cHV0KVxuXG4gIHJldHVybiBwYXJ0cy5qb2luKCcnKVxufVxuIiwiLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuLyogZXNsaW50LWRpc2FibGUgbm8tcHJvdG8gKi9cblxuJ3VzZSBzdHJpY3QnXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXNhcnJheScpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBTbG93QnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcblxuLyoqXG4gKiBJZiBgQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAobW9zdCBjb21wYXRpYmxlLCBldmVuIElFNilcbiAqXG4gKiBCcm93c2VycyB0aGF0IHN1cHBvcnQgdHlwZWQgYXJyYXlzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssXG4gKiBPcGVyYSAxMS42KywgaU9TIDQuMisuXG4gKlxuICogRHVlIHRvIHZhcmlvdXMgYnJvd3NlciBidWdzLCBzb21ldGltZXMgdGhlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiB3aWxsIGJlIHVzZWQgZXZlblxuICogd2hlbiB0aGUgYnJvd3NlciBzdXBwb3J0cyB0eXBlZCBhcnJheXMuXG4gKlxuICogTm90ZTpcbiAqXG4gKiAgIC0gRmlyZWZveCA0LTI5IGxhY2tzIHN1cHBvcnQgZm9yIGFkZGluZyBuZXcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLFxuICogICAgIFNlZTogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4LlxuICpcbiAqICAgLSBDaHJvbWUgOS0xMCBpcyBtaXNzaW5nIHRoZSBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uLlxuICpcbiAqICAgLSBJRTEwIGhhcyBhIGJyb2tlbiBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uIHdoaWNoIHJldHVybnMgYXJyYXlzIG9mXG4gKiAgICAgaW5jb3JyZWN0IGxlbmd0aCBpbiBzb21lIHNpdHVhdGlvbnMuXG5cbiAqIFdlIGRldGVjdCB0aGVzZSBidWdneSBicm93c2VycyBhbmQgc2V0IGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGAgdG8gYGZhbHNlYCBzbyB0aGV5XG4gKiBnZXQgdGhlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiwgd2hpY2ggaXMgc2xvd2VyIGJ1dCBiZWhhdmVzIGNvcnJlY3RseS5cbiAqL1xuQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgPSBnbG9iYWwuVFlQRURfQVJSQVlfU1VQUE9SVCAhPT0gdW5kZWZpbmVkXG4gID8gZ2xvYmFsLlRZUEVEX0FSUkFZX1NVUFBPUlRcbiAgOiB0eXBlZEFycmF5U3VwcG9ydCgpXG5cbi8qXG4gKiBFeHBvcnQga01heExlbmd0aCBhZnRlciB0eXBlZCBhcnJheSBzdXBwb3J0IGlzIGRldGVybWluZWQuXG4gKi9cbmV4cG9ydHMua01heExlbmd0aCA9IGtNYXhMZW5ndGgoKVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5U3VwcG9ydCAoKSB7XG4gIHRyeSB7XG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KDEpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gYXJyLmZvbygpID09PSA0MiAmJiAvLyB0eXBlZCBhcnJheSBpbnN0YW5jZXMgY2FuIGJlIGF1Z21lbnRlZFxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nICYmIC8vIGNocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICAgICAgICBhcnIuc3ViYXJyYXkoMSwgMSkuYnl0ZUxlbmd0aCA9PT0gMCAvLyBpZTEwIGhhcyBicm9rZW4gYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuZnVuY3Rpb24ga01heExlbmd0aCAoKSB7XG4gIHJldHVybiBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVFxuICAgID8gMHg3ZmZmZmZmZlxuICAgIDogMHgzZmZmZmZmZlxufVxuXG5mdW5jdGlvbiBjcmVhdGVCdWZmZXIgKHRoYXQsIGxlbmd0aCkge1xuICBpZiAoa01heExlbmd0aCgpIDwgbGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgdHlwZWQgYXJyYXkgbGVuZ3RoJylcbiAgfVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAvLyBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSwgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICB0aGF0ID0gbmV3IFVpbnQ4QXJyYXkobGVuZ3RoKVxuICAgIHRoYXQuX19wcm90b19fID0gQnVmZmVyLnByb3RvdHlwZVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gYW4gb2JqZWN0IGluc3RhbmNlIG9mIHRoZSBCdWZmZXIgY2xhc3NcbiAgICBpZiAodGhhdCA9PT0gbnVsbCkge1xuICAgICAgdGhhdCA9IG5ldyBCdWZmZXIobGVuZ3RoKVxuICAgIH1cbiAgICB0aGF0Lmxlbmd0aCA9IGxlbmd0aFxuICB9XG5cbiAgcmV0dXJuIHRoYXRcbn1cblxuLyoqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGhhdmUgdGhlaXJcbiAqIHByb3RvdHlwZSBjaGFuZ2VkIHRvIGBCdWZmZXIucHJvdG90eXBlYC4gRnVydGhlcm1vcmUsIGBCdWZmZXJgIGlzIGEgc3ViY2xhc3Mgb2ZcbiAqIGBVaW50OEFycmF5YCwgc28gdGhlIHJldHVybmVkIGluc3RhbmNlcyB3aWxsIGhhdmUgYWxsIHRoZSBub2RlIGBCdWZmZXJgIG1ldGhvZHNcbiAqIGFuZCB0aGUgYFVpbnQ4QXJyYXlgIG1ldGhvZHMuIFNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0XG4gKiByZXR1cm5zIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIFRoZSBgVWludDhBcnJheWAgcHJvdG90eXBlIHJlbWFpbnMgdW5tb2RpZmllZC5cbiAqL1xuXG5mdW5jdGlvbiBCdWZmZXIgKGFyZywgZW5jb2RpbmdPck9mZnNldCwgbGVuZ3RoKSB7XG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgJiYgISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKGFyZywgZW5jb2RpbmdPck9mZnNldCwgbGVuZ3RoKVxuICB9XG5cbiAgLy8gQ29tbW9uIGNhc2UuXG4gIGlmICh0eXBlb2YgYXJnID09PSAnbnVtYmVyJykge1xuICAgIGlmICh0eXBlb2YgZW5jb2RpbmdPck9mZnNldCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0lmIGVuY29kaW5nIGlzIHNwZWNpZmllZCB0aGVuIHRoZSBmaXJzdCBhcmd1bWVudCBtdXN0IGJlIGEgc3RyaW5nJ1xuICAgICAgKVxuICAgIH1cbiAgICByZXR1cm4gYWxsb2NVbnNhZmUodGhpcywgYXJnKVxuICB9XG4gIHJldHVybiBmcm9tKHRoaXMsIGFyZywgZW5jb2RpbmdPck9mZnNldCwgbGVuZ3RoKVxufVxuXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyIC8vIG5vdCB1c2VkIGJ5IHRoaXMgaW1wbGVtZW50YXRpb25cblxuLy8gVE9ETzogTGVnYWN5LCBub3QgbmVlZGVkIGFueW1vcmUuIFJlbW92ZSBpbiBuZXh0IG1ham9yIHZlcnNpb24uXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5fX3Byb3RvX18gPSBCdWZmZXIucHJvdG90eXBlXG4gIHJldHVybiBhcnJcbn1cblxuZnVuY3Rpb24gZnJvbSAodGhhdCwgdmFsdWUsIGVuY29kaW5nT3JPZmZzZXQsIGxlbmd0aCkge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1widmFsdWVcIiBhcmd1bWVudCBtdXN0IG5vdCBiZSBhIG51bWJlcicpXG4gIH1cblxuICBpZiAodHlwZW9mIEFycmF5QnVmZmVyICE9PSAndW5kZWZpbmVkJyAmJiB2YWx1ZSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIGZyb21BcnJheUJ1ZmZlcih0aGF0LCB2YWx1ZSwgZW5jb2RpbmdPck9mZnNldCwgbGVuZ3RoKVxuICB9XG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZnJvbVN0cmluZyh0aGF0LCB2YWx1ZSwgZW5jb2RpbmdPck9mZnNldClcbiAgfVxuXG4gIHJldHVybiBmcm9tT2JqZWN0KHRoYXQsIHZhbHVlKVxufVxuXG4vKipcbiAqIEZ1bmN0aW9uYWxseSBlcXVpdmFsZW50IHRvIEJ1ZmZlcihhcmcsIGVuY29kaW5nKSBidXQgdGhyb3dzIGEgVHlwZUVycm9yXG4gKiBpZiB2YWx1ZSBpcyBhIG51bWJlci5cbiAqIEJ1ZmZlci5mcm9tKHN0clssIGVuY29kaW5nXSlcbiAqIEJ1ZmZlci5mcm9tKGFycmF5KVxuICogQnVmZmVyLmZyb20oYnVmZmVyKVxuICogQnVmZmVyLmZyb20oYXJyYXlCdWZmZXJbLCBieXRlT2Zmc2V0WywgbGVuZ3RoXV0pXG4gKiovXG5CdWZmZXIuZnJvbSA9IGZ1bmN0aW9uICh2YWx1ZSwgZW5jb2RpbmdPck9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBmcm9tKG51bGwsIHZhbHVlLCBlbmNvZGluZ09yT2Zmc2V0LCBsZW5ndGgpXG59XG5cbmlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICBCdWZmZXIucHJvdG90eXBlLl9fcHJvdG9fXyA9IFVpbnQ4QXJyYXkucHJvdG90eXBlXG4gIEJ1ZmZlci5fX3Byb3RvX18gPSBVaW50OEFycmF5XG4gIGlmICh0eXBlb2YgU3ltYm9sICE9PSAndW5kZWZpbmVkJyAmJiBTeW1ib2wuc3BlY2llcyAmJlxuICAgICAgQnVmZmVyW1N5bWJvbC5zcGVjaWVzXSA9PT0gQnVmZmVyKSB7XG4gICAgLy8gRml4IHN1YmFycmF5KCkgaW4gRVMyMDE2LiBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9mZXJvc3MvYnVmZmVyL3B1bGwvOTdcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQnVmZmVyLCBTeW1ib2wuc3BlY2llcywge1xuICAgICAgdmFsdWU6IG51bGwsXG4gICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KVxuICB9XG59XG5cbmZ1bmN0aW9uIGFzc2VydFNpemUgKHNpemUpIHtcbiAgaWYgKHR5cGVvZiBzaXplICE9PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wic2l6ZVwiIGFyZ3VtZW50IG11c3QgYmUgYSBudW1iZXInKVxuICB9XG59XG5cbmZ1bmN0aW9uIGFsbG9jICh0aGF0LCBzaXplLCBmaWxsLCBlbmNvZGluZykge1xuICBhc3NlcnRTaXplKHNpemUpXG4gIGlmIChzaXplIDw9IDApIHtcbiAgICByZXR1cm4gY3JlYXRlQnVmZmVyKHRoYXQsIHNpemUpXG4gIH1cbiAgaWYgKGZpbGwgIT09IHVuZGVmaW5lZCkge1xuICAgIC8vIE9ubHkgcGF5IGF0dGVudGlvbiB0byBlbmNvZGluZyBpZiBpdCdzIGEgc3RyaW5nLiBUaGlzXG4gICAgLy8gcHJldmVudHMgYWNjaWRlbnRhbGx5IHNlbmRpbmcgaW4gYSBudW1iZXIgdGhhdCB3b3VsZFxuICAgIC8vIGJlIGludGVycHJldHRlZCBhcyBhIHN0YXJ0IG9mZnNldC5cbiAgICByZXR1cm4gdHlwZW9mIGVuY29kaW5nID09PSAnc3RyaW5nJ1xuICAgICAgPyBjcmVhdGVCdWZmZXIodGhhdCwgc2l6ZSkuZmlsbChmaWxsLCBlbmNvZGluZylcbiAgICAgIDogY3JlYXRlQnVmZmVyKHRoYXQsIHNpemUpLmZpbGwoZmlsbClcbiAgfVxuICByZXR1cm4gY3JlYXRlQnVmZmVyKHRoYXQsIHNpemUpXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBmaWxsZWQgQnVmZmVyIGluc3RhbmNlLlxuICogYWxsb2Moc2l6ZVssIGZpbGxbLCBlbmNvZGluZ11dKVxuICoqL1xuQnVmZmVyLmFsbG9jID0gZnVuY3Rpb24gKHNpemUsIGZpbGwsIGVuY29kaW5nKSB7XG4gIHJldHVybiBhbGxvYyhudWxsLCBzaXplLCBmaWxsLCBlbmNvZGluZylcbn1cblxuZnVuY3Rpb24gYWxsb2NVbnNhZmUgKHRoYXQsIHNpemUpIHtcbiAgYXNzZXJ0U2l6ZShzaXplKVxuICB0aGF0ID0gY3JlYXRlQnVmZmVyKHRoYXQsIHNpemUgPCAwID8gMCA6IGNoZWNrZWQoc2l6ZSkgfCAwKVxuICBpZiAoIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaXplOyBpKyspIHtcbiAgICAgIHRoYXRbaV0gPSAwXG4gICAgfVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbi8qKlxuICogRXF1aXZhbGVudCB0byBCdWZmZXIobnVtKSwgYnkgZGVmYXVsdCBjcmVhdGVzIGEgbm9uLXplcm8tZmlsbGVkIEJ1ZmZlciBpbnN0YW5jZS5cbiAqICovXG5CdWZmZXIuYWxsb2NVbnNhZmUgPSBmdW5jdGlvbiAoc2l6ZSkge1xuICByZXR1cm4gYWxsb2NVbnNhZmUobnVsbCwgc2l6ZSlcbn1cbi8qKlxuICogRXF1aXZhbGVudCB0byBTbG93QnVmZmVyKG51bSksIGJ5IGRlZmF1bHQgY3JlYXRlcyBhIG5vbi16ZXJvLWZpbGxlZCBCdWZmZXIgaW5zdGFuY2UuXG4gKi9cbkJ1ZmZlci5hbGxvY1Vuc2FmZVNsb3cgPSBmdW5jdGlvbiAoc2l6ZSkge1xuICByZXR1cm4gYWxsb2NVbnNhZmUobnVsbCwgc2l6ZSlcbn1cblxuZnVuY3Rpb24gZnJvbVN0cmluZyAodGhhdCwgc3RyaW5nLCBlbmNvZGluZykge1xuICBpZiAodHlwZW9mIGVuY29kaW5nICE9PSAnc3RyaW5nJyB8fCBlbmNvZGluZyA9PT0gJycpIHtcbiAgICBlbmNvZGluZyA9ICd1dGY4J1xuICB9XG5cbiAgaWYgKCFCdWZmZXIuaXNFbmNvZGluZyhlbmNvZGluZykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdcImVuY29kaW5nXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBlbmNvZGluZycpXG4gIH1cblxuICB2YXIgbGVuZ3RoID0gYnl0ZUxlbmd0aChzdHJpbmcsIGVuY29kaW5nKSB8IDBcbiAgdGhhdCA9IGNyZWF0ZUJ1ZmZlcih0aGF0LCBsZW5ndGgpXG5cbiAgdGhhdC53cml0ZShzdHJpbmcsIGVuY29kaW5nKVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tQXJyYXlMaWtlICh0aGF0LCBhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB0aGF0ID0gY3JlYXRlQnVmZmVyKHRoYXQsIGxlbmd0aClcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgIHRoYXRbaV0gPSBhcnJheVtpXSAmIDI1NVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGZyb21BcnJheUJ1ZmZlciAodGhhdCwgYXJyYXksIGJ5dGVPZmZzZXQsIGxlbmd0aCkge1xuICBhcnJheS5ieXRlTGVuZ3RoIC8vIHRoaXMgdGhyb3dzIGlmIGBhcnJheWAgaXMgbm90IGEgdmFsaWQgQXJyYXlCdWZmZXJcblxuICBpZiAoYnl0ZU9mZnNldCA8IDAgfHwgYXJyYXkuYnl0ZUxlbmd0aCA8IGJ5dGVPZmZzZXQpIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignXFwnb2Zmc2V0XFwnIGlzIG91dCBvZiBib3VuZHMnKVxuICB9XG5cbiAgaWYgKGFycmF5LmJ5dGVMZW5ndGggPCBieXRlT2Zmc2V0ICsgKGxlbmd0aCB8fCAwKSkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdcXCdsZW5ndGhcXCcgaXMgb3V0IG9mIGJvdW5kcycpXG4gIH1cblxuICBpZiAobGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICBhcnJheSA9IG5ldyBVaW50OEFycmF5KGFycmF5LCBieXRlT2Zmc2V0KVxuICB9IGVsc2Uge1xuICAgIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXksIGJ5dGVPZmZzZXQsIGxlbmd0aClcbiAgfVxuXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlLCBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIHRoYXQgPSBhcnJheVxuICAgIHRoYXQuX19wcm90b19fID0gQnVmZmVyLnByb3RvdHlwZVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gYW4gb2JqZWN0IGluc3RhbmNlIG9mIHRoZSBCdWZmZXIgY2xhc3NcbiAgICB0aGF0ID0gZnJvbUFycmF5TGlrZSh0aGF0LCBhcnJheSlcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tT2JqZWN0ICh0aGF0LCBvYmopIHtcbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihvYmopKSB7XG4gICAgdmFyIGxlbiA9IGNoZWNrZWQob2JqLmxlbmd0aCkgfCAwXG4gICAgdGhhdCA9IGNyZWF0ZUJ1ZmZlcih0aGF0LCBsZW4pXG5cbiAgICBpZiAodGhhdC5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB0aGF0XG4gICAgfVxuXG4gICAgb2JqLmNvcHkodGhhdCwgMCwgMCwgbGVuKVxuICAgIHJldHVybiB0aGF0XG4gIH1cblxuICBpZiAob2JqKSB7XG4gICAgaWYgKCh0eXBlb2YgQXJyYXlCdWZmZXIgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgIG9iai5idWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikgfHwgJ2xlbmd0aCcgaW4gb2JqKSB7XG4gICAgICBpZiAodHlwZW9mIG9iai5sZW5ndGggIT09ICdudW1iZXInIHx8IGlzbmFuKG9iai5sZW5ndGgpKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVCdWZmZXIodGhhdCwgMClcbiAgICAgIH1cbiAgICAgIHJldHVybiBmcm9tQXJyYXlMaWtlKHRoYXQsIG9iailcbiAgICB9XG5cbiAgICBpZiAob2JqLnR5cGUgPT09ICdCdWZmZXInICYmIGlzQXJyYXkob2JqLmRhdGEpKSB7XG4gICAgICByZXR1cm4gZnJvbUFycmF5TGlrZSh0aGF0LCBvYmouZGF0YSlcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZUVycm9yKCdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGEgc3RyaW5nLCBCdWZmZXIsIEFycmF5QnVmZmVyLCBBcnJheSwgb3IgYXJyYXktbGlrZSBvYmplY3QuJylcbn1cblxuZnVuY3Rpb24gY2hlY2tlZCAobGVuZ3RoKSB7XG4gIC8vIE5vdGU6IGNhbm5vdCB1c2UgYGxlbmd0aCA8IGtNYXhMZW5ndGhgIGhlcmUgYmVjYXVzZSB0aGF0IGZhaWxzIHdoZW5cbiAgLy8gbGVuZ3RoIGlzIE5hTiAod2hpY2ggaXMgb3RoZXJ3aXNlIGNvZXJjZWQgdG8gemVyby4pXG4gIGlmIChsZW5ndGggPj0ga01heExlbmd0aCgpKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ3NpemU6IDB4JyArIGtNYXhMZW5ndGgoKS50b1N0cmluZygxNikgKyAnIGJ5dGVzJylcbiAgfVxuICByZXR1cm4gbGVuZ3RoIHwgMFxufVxuXG5mdW5jdGlvbiBTbG93QnVmZmVyIChsZW5ndGgpIHtcbiAgaWYgKCtsZW5ndGggIT0gbGVuZ3RoKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgZXFlcWVxXG4gICAgbGVuZ3RoID0gMFxuICB9XG4gIHJldHVybiBCdWZmZXIuYWxsb2MoK2xlbmd0aClcbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gaXNCdWZmZXIgKGIpIHtcbiAgcmV0dXJuICEhKGIgIT0gbnVsbCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgbXVzdCBiZSBCdWZmZXJzJylcbiAgfVxuXG4gIGlmIChhID09PSBiKSByZXR1cm4gMFxuXG4gIHZhciB4ID0gYS5sZW5ndGhcbiAgdmFyIHkgPSBiLmxlbmd0aFxuXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBNYXRoLm1pbih4LCB5KTsgaSA8IGxlbjsgKytpKSB7XG4gICAgaWYgKGFbaV0gIT09IGJbaV0pIHtcbiAgICAgIHggPSBhW2ldXG4gICAgICB5ID0gYltpXVxuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICBpZiAoeCA8IHkpIHJldHVybiAtMVxuICBpZiAoeSA8IHgpIHJldHVybiAxXG4gIHJldHVybiAwXG59XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gaXNFbmNvZGluZyAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiBjb25jYXQgKGxpc3QsIGxlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdcImxpc3RcIiBhcmd1bWVudCBtdXN0IGJlIGFuIEFycmF5IG9mIEJ1ZmZlcnMnKVxuICB9XG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5hbGxvYygwKVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmZmVyID0gQnVmZmVyLmFsbG9jVW5zYWZlKGxlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnVmID0gbGlzdFtpXVxuICAgIGlmICghQnVmZmVyLmlzQnVmZmVyKGJ1ZikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wibGlzdFwiIGFyZ3VtZW50IG11c3QgYmUgYW4gQXJyYXkgb2YgQnVmZmVycycpXG4gICAgfVxuICAgIGJ1Zi5jb3B5KGJ1ZmZlciwgcG9zKVxuICAgIHBvcyArPSBidWYubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZmZlclxufVxuXG5mdW5jdGlvbiBieXRlTGVuZ3RoIChzdHJpbmcsIGVuY29kaW5nKSB7XG4gIGlmIChCdWZmZXIuaXNCdWZmZXIoc3RyaW5nKSkge1xuICAgIHJldHVybiBzdHJpbmcubGVuZ3RoXG4gIH1cbiAgaWYgKHR5cGVvZiBBcnJheUJ1ZmZlciAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIEFycmF5QnVmZmVyLmlzVmlldyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgKEFycmF5QnVmZmVyLmlzVmlldyhzdHJpbmcpIHx8IHN0cmluZyBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuICAgIHJldHVybiBzdHJpbmcuYnl0ZUxlbmd0aFxuICB9XG4gIGlmICh0eXBlb2Ygc3RyaW5nICE9PSAnc3RyaW5nJykge1xuICAgIHN0cmluZyA9ICcnICsgc3RyaW5nXG4gIH1cblxuICB2YXIgbGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAobGVuID09PSAwKSByZXR1cm4gMFxuXG4gIC8vIFVzZSBhIGZvciBsb29wIHRvIGF2b2lkIHJlY3Vyc2lvblxuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuICBmb3IgKDs7KSB7XG4gICAgc3dpdGNoIChlbmNvZGluZykge1xuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIC8vIERlcHJlY2F0ZWRcbiAgICAgIGNhc2UgJ3Jhdyc6XG4gICAgICBjYXNlICdyYXdzJzpcbiAgICAgICAgcmV0dXJuIGxlblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICBjYXNlIHVuZGVmaW5lZDpcbiAgICAgICAgcmV0dXJuIHV0ZjhUb0J5dGVzKHN0cmluZykubGVuZ3RoXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gbGVuICogMlxuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGxlbiA+Pj4gMVxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFRvQnl0ZXMoc3RyaW5nKS5sZW5ndGhcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgcmV0dXJuIHV0ZjhUb0J5dGVzKHN0cmluZykubGVuZ3RoIC8vIGFzc3VtZSB1dGY4XG4gICAgICAgIGVuY29kaW5nID0gKCcnICsgZW5jb2RpbmcpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbG93ZXJlZENhc2UgPSB0cnVlXG4gICAgfVxuICB9XG59XG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcblxuZnVuY3Rpb24gc2xvd1RvU3RyaW5nIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuXG4gIC8vIE5vIG5lZWQgdG8gdmVyaWZ5IHRoYXQgXCJ0aGlzLmxlbmd0aCA8PSBNQVhfVUlOVDMyXCIgc2luY2UgaXQncyBhIHJlYWQtb25seVxuICAvLyBwcm9wZXJ0eSBvZiBhIHR5cGVkIGFycmF5LlxuXG4gIC8vIFRoaXMgYmVoYXZlcyBuZWl0aGVyIGxpa2UgU3RyaW5nIG5vciBVaW50OEFycmF5IGluIHRoYXQgd2Ugc2V0IHN0YXJ0L2VuZFxuICAvLyB0byB0aGVpciB1cHBlci9sb3dlciBib3VuZHMgaWYgdGhlIHZhbHVlIHBhc3NlZCBpcyBvdXQgb2YgcmFuZ2UuXG4gIC8vIHVuZGVmaW5lZCBpcyBoYW5kbGVkIHNwZWNpYWxseSBhcyBwZXIgRUNNQS0yNjIgNnRoIEVkaXRpb24sXG4gIC8vIFNlY3Rpb24gMTMuMy4zLjcgUnVudGltZSBTZW1hbnRpY3M6IEtleWVkQmluZGluZ0luaXRpYWxpemF0aW9uLlxuICBpZiAoc3RhcnQgPT09IHVuZGVmaW5lZCB8fCBzdGFydCA8IDApIHtcbiAgICBzdGFydCA9IDBcbiAgfVxuICAvLyBSZXR1cm4gZWFybHkgaWYgc3RhcnQgPiB0aGlzLmxlbmd0aC4gRG9uZSBoZXJlIHRvIHByZXZlbnQgcG90ZW50aWFsIHVpbnQzMlxuICAvLyBjb2VyY2lvbiBmYWlsIGJlbG93LlxuICBpZiAoc3RhcnQgPiB0aGlzLmxlbmd0aCkge1xuICAgIHJldHVybiAnJ1xuICB9XG5cbiAgaWYgKGVuZCA9PT0gdW5kZWZpbmVkIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB7XG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgfVxuXG4gIGlmIChlbmQgPD0gMCkge1xuICAgIHJldHVybiAnJ1xuICB9XG5cbiAgLy8gRm9yY2UgY29lcnNpb24gdG8gdWludDMyLiBUaGlzIHdpbGwgYWxzbyBjb2VyY2UgZmFsc2V5L05hTiB2YWx1ZXMgdG8gMC5cbiAgZW5kID4+Pj0gMFxuICBzdGFydCA+Pj49IDBcblxuICBpZiAoZW5kIDw9IHN0YXJ0KSB7XG4gICAgcmV0dXJuICcnXG4gIH1cblxuICBpZiAoIWVuY29kaW5nKSBlbmNvZGluZyA9ICd1dGY4J1xuXG4gIHdoaWxlICh0cnVlKSB7XG4gICAgc3dpdGNoIChlbmNvZGluZykge1xuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGhleFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgICAgcmV0dXJuIGFzY2lpU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgICAgcmV0dXJuIGJpbmFyeVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICAgIHJldHVybiBiYXNlNjRTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gdXRmMTZsZVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG4vLyBUaGUgcHJvcGVydHkgaXMgdXNlZCBieSBgQnVmZmVyLmlzQnVmZmVyYCBhbmQgYGlzLWJ1ZmZlcmAgKGluIFNhZmFyaSA1LTcpIHRvIGRldGVjdFxuLy8gQnVmZmVyIGluc3RhbmNlcy5cbkJ1ZmZlci5wcm90b3R5cGUuX2lzQnVmZmVyID0gdHJ1ZVxuXG5mdW5jdGlvbiBzd2FwIChiLCBuLCBtKSB7XG4gIHZhciBpID0gYltuXVxuICBiW25dID0gYlttXVxuICBiW21dID0gaVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnN3YXAxNiA9IGZ1bmN0aW9uIHN3YXAxNiAoKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBpZiAobGVuICUgMiAhPT0gMCkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdCdWZmZXIgc2l6ZSBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgMTYtYml0cycpXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkgKz0gMikge1xuICAgIHN3YXAodGhpcywgaSwgaSArIDEpXG4gIH1cbiAgcmV0dXJuIHRoaXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zd2FwMzIgPSBmdW5jdGlvbiBzd2FwMzIgKCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgaWYgKGxlbiAlIDQgIT09IDApIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQnVmZmVyIHNpemUgbXVzdCBiZSBhIG11bHRpcGxlIG9mIDMyLWJpdHMnKVxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpICs9IDQpIHtcbiAgICBzd2FwKHRoaXMsIGksIGkgKyAzKVxuICAgIHN3YXAodGhpcywgaSArIDEsIGkgKyAyKVxuICB9XG4gIHJldHVybiB0aGlzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiB0b1N0cmluZyAoKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aCB8IDBcbiAgaWYgKGxlbmd0aCA9PT0gMCkgcmV0dXJuICcnXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSByZXR1cm4gdXRmOFNsaWNlKHRoaXMsIDAsIGxlbmd0aClcbiAgcmV0dXJuIHNsb3dUb1N0cmluZy5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gZXF1YWxzIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiB0cnVlXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKSA9PT0gMFxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0ICgpIHtcbiAgdmFyIHN0ciA9ICcnXG4gIHZhciBtYXggPSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTXG4gIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICBzdHIgPSB0aGlzLnRvU3RyaW5nKCdoZXgnLCAwLCBtYXgpLm1hdGNoKC8uezJ9L2cpLmpvaW4oJyAnKVxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG1heCkgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlICh0YXJnZXQsIHN0YXJ0LCBlbmQsIHRoaXNTdGFydCwgdGhpc0VuZCkge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcih0YXJnZXQpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIH1cblxuICBpZiAoc3RhcnQgPT09IHVuZGVmaW5lZCkge1xuICAgIHN0YXJ0ID0gMFxuICB9XG4gIGlmIChlbmQgPT09IHVuZGVmaW5lZCkge1xuICAgIGVuZCA9IHRhcmdldCA/IHRhcmdldC5sZW5ndGggOiAwXG4gIH1cbiAgaWYgKHRoaXNTdGFydCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhpc1N0YXJ0ID0gMFxuICB9XG4gIGlmICh0aGlzRW5kID09PSB1bmRlZmluZWQpIHtcbiAgICB0aGlzRW5kID0gdGhpcy5sZW5ndGhcbiAgfVxuXG4gIGlmIChzdGFydCA8IDAgfHwgZW5kID4gdGFyZ2V0Lmxlbmd0aCB8fCB0aGlzU3RhcnQgPCAwIHx8IHRoaXNFbmQgPiB0aGlzLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdvdXQgb2YgcmFuZ2UgaW5kZXgnKVxuICB9XG5cbiAgaWYgKHRoaXNTdGFydCA+PSB0aGlzRW5kICYmIHN0YXJ0ID49IGVuZCkge1xuICAgIHJldHVybiAwXG4gIH1cbiAgaWYgKHRoaXNTdGFydCA+PSB0aGlzRW5kKSB7XG4gICAgcmV0dXJuIC0xXG4gIH1cbiAgaWYgKHN0YXJ0ID49IGVuZCkge1xuICAgIHJldHVybiAxXG4gIH1cblxuICBzdGFydCA+Pj49IDBcbiAgZW5kID4+Pj0gMFxuICB0aGlzU3RhcnQgPj4+PSAwXG4gIHRoaXNFbmQgPj4+PSAwXG5cbiAgaWYgKHRoaXMgPT09IHRhcmdldCkgcmV0dXJuIDBcblxuICB2YXIgeCA9IHRoaXNFbmQgLSB0aGlzU3RhcnRcbiAgdmFyIHkgPSBlbmQgLSBzdGFydFxuICB2YXIgbGVuID0gTWF0aC5taW4oeCwgeSlcblxuICB2YXIgdGhpc0NvcHkgPSB0aGlzLnNsaWNlKHRoaXNTdGFydCwgdGhpc0VuZClcbiAgdmFyIHRhcmdldENvcHkgPSB0YXJnZXQuc2xpY2Uoc3RhcnQsIGVuZClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgaWYgKHRoaXNDb3B5W2ldICE9PSB0YXJnZXRDb3B5W2ldKSB7XG4gICAgICB4ID0gdGhpc0NvcHlbaV1cbiAgICAgIHkgPSB0YXJnZXRDb3B5W2ldXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGlmICh4IDwgeSkgcmV0dXJuIC0xXG4gIGlmICh5IDwgeCkgcmV0dXJuIDFcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gYXJyYXlJbmRleE9mIChhcnIsIHZhbCwgYnl0ZU9mZnNldCwgZW5jb2RpbmcpIHtcbiAgdmFyIGluZGV4U2l6ZSA9IDFcbiAgdmFyIGFyckxlbmd0aCA9IGFyci5sZW5ndGhcbiAgdmFyIHZhbExlbmd0aCA9IHZhbC5sZW5ndGhcblxuICBpZiAoZW5jb2RpbmcgIT09IHVuZGVmaW5lZCkge1xuICAgIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpXG4gICAgaWYgKGVuY29kaW5nID09PSAndWNzMicgfHwgZW5jb2RpbmcgPT09ICd1Y3MtMicgfHxcbiAgICAgICAgZW5jb2RpbmcgPT09ICd1dGYxNmxlJyB8fCBlbmNvZGluZyA9PT0gJ3V0Zi0xNmxlJykge1xuICAgICAgaWYgKGFyci5sZW5ndGggPCAyIHx8IHZhbC5sZW5ndGggPCAyKSB7XG4gICAgICAgIHJldHVybiAtMVxuICAgICAgfVxuICAgICAgaW5kZXhTaXplID0gMlxuICAgICAgYXJyTGVuZ3RoIC89IDJcbiAgICAgIHZhbExlbmd0aCAvPSAyXG4gICAgICBieXRlT2Zmc2V0IC89IDJcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZWFkIChidWYsIGkpIHtcbiAgICBpZiAoaW5kZXhTaXplID09PSAxKSB7XG4gICAgICByZXR1cm4gYnVmW2ldXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBidWYucmVhZFVJbnQxNkJFKGkgKiBpbmRleFNpemUpXG4gICAgfVxuICB9XG5cbiAgdmFyIGZvdW5kSW5kZXggPSAtMVxuICBmb3IgKHZhciBpID0gMDsgYnl0ZU9mZnNldCArIGkgPCBhcnJMZW5ndGg7IGkrKykge1xuICAgIGlmIChyZWFkKGFyciwgYnl0ZU9mZnNldCArIGkpID09PSByZWFkKHZhbCwgZm91bmRJbmRleCA9PT0gLTEgPyAwIDogaSAtIGZvdW5kSW5kZXgpKSB7XG4gICAgICBpZiAoZm91bmRJbmRleCA9PT0gLTEpIGZvdW5kSW5kZXggPSBpXG4gICAgICBpZiAoaSAtIGZvdW5kSW5kZXggKyAxID09PSB2YWxMZW5ndGgpIHJldHVybiAoYnl0ZU9mZnNldCArIGZvdW5kSW5kZXgpICogaW5kZXhTaXplXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChmb3VuZEluZGV4ICE9PSAtMSkgaSAtPSBpIC0gZm91bmRJbmRleFxuICAgICAgZm91bmRJbmRleCA9IC0xXG4gICAgfVxuICB9XG4gIHJldHVybiAtMVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiBpbmRleE9mICh2YWwsIGJ5dGVPZmZzZXQsIGVuY29kaW5nKSB7XG4gIGlmICh0eXBlb2YgYnl0ZU9mZnNldCA9PT0gJ3N0cmluZycpIHtcbiAgICBlbmNvZGluZyA9IGJ5dGVPZmZzZXRcbiAgICBieXRlT2Zmc2V0ID0gMFxuICB9IGVsc2UgaWYgKGJ5dGVPZmZzZXQgPiAweDdmZmZmZmZmKSB7XG4gICAgYnl0ZU9mZnNldCA9IDB4N2ZmZmZmZmZcbiAgfSBlbHNlIGlmIChieXRlT2Zmc2V0IDwgLTB4ODAwMDAwMDApIHtcbiAgICBieXRlT2Zmc2V0ID0gLTB4ODAwMDAwMDBcbiAgfVxuICBieXRlT2Zmc2V0ID4+PSAwXG5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm4gLTFcbiAgaWYgKGJ5dGVPZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVybiAtMVxuXG4gIC8vIE5lZ2F0aXZlIG9mZnNldHMgc3RhcnQgZnJvbSB0aGUgZW5kIG9mIHRoZSBidWZmZXJcbiAgaWYgKGJ5dGVPZmZzZXQgPCAwKSBieXRlT2Zmc2V0ID0gTWF0aC5tYXgodGhpcy5sZW5ndGggKyBieXRlT2Zmc2V0LCAwKVxuXG4gIGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuICAgIHZhbCA9IEJ1ZmZlci5mcm9tKHZhbCwgZW5jb2RpbmcpXG4gIH1cblxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKHZhbCkpIHtcbiAgICAvLyBzcGVjaWFsIGNhc2U6IGxvb2tpbmcgZm9yIGVtcHR5IHN0cmluZy9idWZmZXIgYWx3YXlzIGZhaWxzXG4gICAgaWYgKHZhbC5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiAtMVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIHZhbCwgYnl0ZU9mZnNldCwgZW5jb2RpbmcpXG4gIH1cbiAgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUICYmIFVpbnQ4QXJyYXkucHJvdG90eXBlLmluZGV4T2YgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBVaW50OEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwodGhpcywgdmFsLCBieXRlT2Zmc2V0KVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIFsgdmFsIF0sIGJ5dGVPZmZzZXQsIGVuY29kaW5nKVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmFsIG11c3QgYmUgc3RyaW5nLCBudW1iZXIgb3IgQnVmZmVyJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbmNsdWRlcyA9IGZ1bmN0aW9uIGluY2x1ZGVzICh2YWwsIGJ5dGVPZmZzZXQsIGVuY29kaW5nKSB7XG4gIHJldHVybiB0aGlzLmluZGV4T2YodmFsLCBieXRlT2Zmc2V0LCBlbmNvZGluZykgIT09IC0xXG59XG5cbmZ1bmN0aW9uIGhleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgaWYgKHN0ckxlbiAlIDIgIT09IDApIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHBhcnNlZCA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4ocGFyc2VkKSkgcmV0dXJuIGlcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBwYXJzZWRcbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiB1dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcsIGJ1Zi5sZW5ndGggLSBvZmZzZXQpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGFzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBiYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gdWNzMldyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nLCBidWYubGVuZ3RoIC0gb2Zmc2V0KSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIHdyaXRlIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBCdWZmZXIjd3JpdGUoc3RyaW5nKVxuICBpZiAob2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICBlbmNvZGluZyA9ICd1dGY4J1xuICAgIGxlbmd0aCA9IHRoaXMubGVuZ3RoXG4gICAgb2Zmc2V0ID0gMFxuICAvLyBCdWZmZXIjd3JpdGUoc3RyaW5nLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmIChsZW5ndGggPT09IHVuZGVmaW5lZCAmJiB0eXBlb2Ygb2Zmc2V0ID09PSAnc3RyaW5nJykge1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgbGVuZ3RoID0gdGhpcy5sZW5ndGhcbiAgICBvZmZzZXQgPSAwXG4gIC8vIEJ1ZmZlciN3cml0ZShzdHJpbmcsIG9mZnNldFssIGxlbmd0aF1bLCBlbmNvZGluZ10pXG4gIH0gZWxzZSBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgICBpZiAoaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgbGVuZ3RoID0gbGVuZ3RoIHwgMFxuICAgICAgaWYgKGVuY29kaW5nID09PSB1bmRlZmluZWQpIGVuY29kaW5nID0gJ3V0ZjgnXG4gICAgfSBlbHNlIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIC8vIGxlZ2FjeSB3cml0ZShzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aCkgLSByZW1vdmUgaW4gdjAuMTNcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnQnVmZmVyLndyaXRlKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldFssIGxlbmd0aF0pIGlzIG5vIGxvbmdlciBzdXBwb3J0ZWQnXG4gICAgKVxuICB9XG5cbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmIChsZW5ndGggPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPiByZW1haW5pbmcpIGxlbmd0aCA9IHJlbWFpbmluZ1xuXG4gIGlmICgoc3RyaW5nLmxlbmd0aCA+IDAgJiYgKGxlbmd0aCA8IDAgfHwgb2Zmc2V0IDwgMCkpIHx8IG9mZnNldCA+IHRoaXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gd3JpdGUgb3V0c2lkZSBidWZmZXIgYm91bmRzJylcbiAgfVxuXG4gIGlmICghZW5jb2RpbmcpIGVuY29kaW5nID0gJ3V0ZjgnXG5cbiAgdmFyIGxvd2VyZWRDYXNlID0gZmFsc2VcbiAgZm9yICg7Oykge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2hleCc6XG4gICAgICAgIHJldHVybiBoZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICAgIHJldHVybiBhc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAgIHJldHVybiBiaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICAvLyBXYXJuaW5nOiBtYXhMZW5ndGggbm90IHRha2VuIGludG8gYWNjb3VudCBpbiBiYXNlNjRXcml0ZVxuICAgICAgICByZXR1cm4gYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAndWNzMic6XG4gICAgICBjYXNlICd1Y3MtMic6XG4gICAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgICAgcmV0dXJuIHVjczJXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobG93ZXJlZENhc2UpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1Vua25vd24gZW5jb2Rpbmc6ICcgKyBlbmNvZGluZylcbiAgICAgICAgZW5jb2RpbmcgPSAoJycgKyBlbmNvZGluZykudG9Mb3dlckNhc2UoKVxuICAgICAgICBsb3dlcmVkQ2FzZSA9IHRydWVcbiAgICB9XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiB0b0pTT04gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiB1dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG4gIHZhciByZXMgPSBbXVxuXG4gIHZhciBpID0gc3RhcnRcbiAgd2hpbGUgKGkgPCBlbmQpIHtcbiAgICB2YXIgZmlyc3RCeXRlID0gYnVmW2ldXG4gICAgdmFyIGNvZGVQb2ludCA9IG51bGxcbiAgICB2YXIgYnl0ZXNQZXJTZXF1ZW5jZSA9IChmaXJzdEJ5dGUgPiAweEVGKSA/IDRcbiAgICAgIDogKGZpcnN0Qnl0ZSA+IDB4REYpID8gM1xuICAgICAgOiAoZmlyc3RCeXRlID4gMHhCRikgPyAyXG4gICAgICA6IDFcblxuICAgIGlmIChpICsgYnl0ZXNQZXJTZXF1ZW5jZSA8PSBlbmQpIHtcbiAgICAgIHZhciBzZWNvbmRCeXRlLCB0aGlyZEJ5dGUsIGZvdXJ0aEJ5dGUsIHRlbXBDb2RlUG9pbnRcblxuICAgICAgc3dpdGNoIChieXRlc1BlclNlcXVlbmNlKSB7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICBpZiAoZmlyc3RCeXRlIDwgMHg4MCkge1xuICAgICAgICAgICAgY29kZVBvaW50ID0gZmlyc3RCeXRlXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgICBzZWNvbmRCeXRlID0gYnVmW2kgKyAxXVxuICAgICAgICAgIGlmICgoc2Vjb25kQnl0ZSAmIDB4QzApID09PSAweDgwKSB7XG4gICAgICAgICAgICB0ZW1wQ29kZVBvaW50ID0gKGZpcnN0Qnl0ZSAmIDB4MUYpIDw8IDB4NiB8IChzZWNvbmRCeXRlICYgMHgzRilcbiAgICAgICAgICAgIGlmICh0ZW1wQ29kZVBvaW50ID4gMHg3Rikge1xuICAgICAgICAgICAgICBjb2RlUG9pbnQgPSB0ZW1wQ29kZVBvaW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICBzZWNvbmRCeXRlID0gYnVmW2kgKyAxXVxuICAgICAgICAgIHRoaXJkQnl0ZSA9IGJ1ZltpICsgMl1cbiAgICAgICAgICBpZiAoKHNlY29uZEJ5dGUgJiAweEMwKSA9PT0gMHg4MCAmJiAodGhpcmRCeXRlICYgMHhDMCkgPT09IDB4ODApIHtcbiAgICAgICAgICAgIHRlbXBDb2RlUG9pbnQgPSAoZmlyc3RCeXRlICYgMHhGKSA8PCAweEMgfCAoc2Vjb25kQnl0ZSAmIDB4M0YpIDw8IDB4NiB8ICh0aGlyZEJ5dGUgJiAweDNGKVxuICAgICAgICAgICAgaWYgKHRlbXBDb2RlUG9pbnQgPiAweDdGRiAmJiAodGVtcENvZGVQb2ludCA8IDB4RDgwMCB8fCB0ZW1wQ29kZVBvaW50ID4gMHhERkZGKSkge1xuICAgICAgICAgICAgICBjb2RlUG9pbnQgPSB0ZW1wQ29kZVBvaW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgNDpcbiAgICAgICAgICBzZWNvbmRCeXRlID0gYnVmW2kgKyAxXVxuICAgICAgICAgIHRoaXJkQnl0ZSA9IGJ1ZltpICsgMl1cbiAgICAgICAgICBmb3VydGhCeXRlID0gYnVmW2kgKyAzXVxuICAgICAgICAgIGlmICgoc2Vjb25kQnl0ZSAmIDB4QzApID09PSAweDgwICYmICh0aGlyZEJ5dGUgJiAweEMwKSA9PT0gMHg4MCAmJiAoZm91cnRoQnl0ZSAmIDB4QzApID09PSAweDgwKSB7XG4gICAgICAgICAgICB0ZW1wQ29kZVBvaW50ID0gKGZpcnN0Qnl0ZSAmIDB4RikgPDwgMHgxMiB8IChzZWNvbmRCeXRlICYgMHgzRikgPDwgMHhDIHwgKHRoaXJkQnl0ZSAmIDB4M0YpIDw8IDB4NiB8IChmb3VydGhCeXRlICYgMHgzRilcbiAgICAgICAgICAgIGlmICh0ZW1wQ29kZVBvaW50ID4gMHhGRkZGICYmIHRlbXBDb2RlUG9pbnQgPCAweDExMDAwMCkge1xuICAgICAgICAgICAgICBjb2RlUG9pbnQgPSB0ZW1wQ29kZVBvaW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjb2RlUG9pbnQgPT09IG51bGwpIHtcbiAgICAgIC8vIHdlIGRpZCBub3QgZ2VuZXJhdGUgYSB2YWxpZCBjb2RlUG9pbnQgc28gaW5zZXJ0IGFcbiAgICAgIC8vIHJlcGxhY2VtZW50IGNoYXIgKFUrRkZGRCkgYW5kIGFkdmFuY2Ugb25seSAxIGJ5dGVcbiAgICAgIGNvZGVQb2ludCA9IDB4RkZGRFxuICAgICAgYnl0ZXNQZXJTZXF1ZW5jZSA9IDFcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA+IDB4RkZGRikge1xuICAgICAgLy8gZW5jb2RlIHRvIHV0ZjE2IChzdXJyb2dhdGUgcGFpciBkYW5jZSlcbiAgICAgIGNvZGVQb2ludCAtPSAweDEwMDAwXG4gICAgICByZXMucHVzaChjb2RlUG9pbnQgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApXG4gICAgICBjb2RlUG9pbnQgPSAweERDMDAgfCBjb2RlUG9pbnQgJiAweDNGRlxuICAgIH1cblxuICAgIHJlcy5wdXNoKGNvZGVQb2ludClcbiAgICBpICs9IGJ5dGVzUGVyU2VxdWVuY2VcbiAgfVxuXG4gIHJldHVybiBkZWNvZGVDb2RlUG9pbnRzQXJyYXkocmVzKVxufVxuXG4vLyBCYXNlZCBvbiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8yMjc0NzI3Mi82ODA3NDIsIHRoZSBicm93c2VyIHdpdGhcbi8vIHRoZSBsb3dlc3QgbGltaXQgaXMgQ2hyb21lLCB3aXRoIDB4MTAwMDAgYXJncy5cbi8vIFdlIGdvIDEgbWFnbml0dWRlIGxlc3MsIGZvciBzYWZldHlcbnZhciBNQVhfQVJHVU1FTlRTX0xFTkdUSCA9IDB4MTAwMFxuXG5mdW5jdGlvbiBkZWNvZGVDb2RlUG9pbnRzQXJyYXkgKGNvZGVQb2ludHMpIHtcbiAgdmFyIGxlbiA9IGNvZGVQb2ludHMubGVuZ3RoXG4gIGlmIChsZW4gPD0gTUFYX0FSR1VNRU5UU19MRU5HVEgpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShTdHJpbmcsIGNvZGVQb2ludHMpIC8vIGF2b2lkIGV4dHJhIHNsaWNlKClcbiAgfVxuXG4gIC8vIERlY29kZSBpbiBjaHVua3MgdG8gYXZvaWQgXCJjYWxsIHN0YWNrIHNpemUgZXhjZWVkZWRcIi5cbiAgdmFyIHJlcyA9ICcnXG4gIHZhciBpID0gMFxuICB3aGlsZSAoaSA8IGxlbikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KFxuICAgICAgU3RyaW5nLFxuICAgICAgY29kZVBvaW50cy5zbGljZShpLCBpICs9IE1BWF9BUkdVTUVOVFNfTEVOR1RIKVxuICAgIClcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldICYgMHg3RilcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGJpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gc2xpY2UgKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlblxuICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gMFxuICB9IGVsc2UgaWYgKHN0YXJ0ID4gbGVuKSB7XG4gICAgc3RhcnQgPSBsZW5cbiAgfVxuXG4gIGlmIChlbmQgPCAwKSB7XG4gICAgZW5kICs9IGxlblxuICAgIGlmIChlbmQgPCAwKSBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpIGVuZCA9IHN0YXJ0XG5cbiAgdmFyIG5ld0J1ZlxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBuZXdCdWYgPSB0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpXG4gICAgbmV3QnVmLl9fcHJvdG9fXyA9IEJ1ZmZlci5wcm90b3R5cGVcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuZXdCdWZcbn1cblxuLypcbiAqIE5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYnVmZmVyIGlzbid0IHRyeWluZyB0byB3cml0ZSBvdXQgb2YgYm91bmRzLlxuICovXG5mdW5jdGlvbiBjaGVja09mZnNldCAob2Zmc2V0LCBleHQsIGxlbmd0aCkge1xuICBpZiAoKG9mZnNldCAlIDEpICE9PSAwIHx8IG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdvZmZzZXQgaXMgbm90IHVpbnQnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gbGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRMRSA9IGZ1bmN0aW9uIHJlYWRVSW50TEUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIH1cblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRCRSA9IGZ1bmN0aW9uIHJlYWRVSW50QkUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG4gIH1cblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdXG4gIHZhciBtdWwgPSAxXG4gIHdoaWxlIChieXRlTGVuZ3RoID4gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIC0tYnl0ZUxlbmd0aF0gKiBtdWxcbiAgfVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiByZWFkVUludDggKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAxLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIHJlYWRVSW50MTZMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiByZWFkVUludDE2QkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuICh0aGlzW29mZnNldF0gPDwgOCkgfCB0aGlzW29mZnNldCArIDFdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gcmVhZFVJbnQzMkxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICgodGhpc1tvZmZzZXRdKSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCAxNikpICtcbiAgICAgICh0aGlzW29mZnNldCArIDNdICogMHgxMDAwMDAwKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIHJlYWRVSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgKCh0aGlzW29mZnNldCArIDFdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludExFID0gZnVuY3Rpb24gcmVhZEludExFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XVxuICB2YXIgbXVsID0gMVxuICB2YXIgaSA9IDBcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyBpXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludEJFID0gZnVuY3Rpb24gcmVhZEludEJFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoXG4gIHZhciBtdWwgPSAxXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIC0taV1cbiAgd2hpbGUgKGkgPiAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgLS1pXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiByZWFkSW50OCAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICBpZiAoISh0aGlzW29mZnNldF0gJiAweDgwKSkgcmV0dXJuICh0aGlzW29mZnNldF0pXG4gIHJldHVybiAoKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gcmVhZEludDE2TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIHJlYWRJbnQxNkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIDFdIHwgKHRoaXNbb2Zmc2V0XSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiByZWFkSW50MzJMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdKSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10gPDwgMjQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiByZWFkSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiByZWFkRmxvYXRMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiByZWFkRmxvYXRCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIHJlYWREb3VibGVMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gcmVhZERvdWJsZUJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignXCJidWZmZXJcIiBhcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyIGluc3RhbmNlJylcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignXCJ2YWx1ZVwiIGFyZ3VtZW50IGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50TEUgPSBmdW5jdGlvbiB3cml0ZVVJbnRMRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIHZhciBtYXhCeXRlcyA9IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKSAtIDFcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBtYXhCeXRlcywgMClcbiAgfVxuXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB0aGlzW29mZnNldF0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKHZhbHVlIC8gbXVsKSAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50QkUgPSBmdW5jdGlvbiB3cml0ZVVJbnRCRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIHZhciBtYXhCeXRlcyA9IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKSAtIDFcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBtYXhCeXRlcywgMClcbiAgfVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aCAtIDFcbiAgdmFyIG11bCA9IDFcbiAgdGhpc1tvZmZzZXQgKyBpXSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoLS1pID49IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKHZhbHVlIC8gbXVsKSAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uIHdyaXRlVUludDggKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMSwgMHhmZiwgMClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICByZXR1cm4gb2Zmc2V0ICsgMVxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiB3cml0ZVVJbnQxNkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gd3JpdGVVSW50MTZCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmZmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gd3JpdGVVSW50MzJMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiB3cml0ZVVJbnQzMkJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50TEUgPSBmdW5jdGlvbiB3cml0ZUludExFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICB2YXIgbGltaXQgPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpXG5cbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBsaW1pdCAtIDEsIC1saW1pdClcbiAgfVxuXG4gIHZhciBpID0gMFxuICB2YXIgbXVsID0gMVxuICB2YXIgc3ViID0gMFxuICB0aGlzW29mZnNldF0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICBpZiAodmFsdWUgPCAwICYmIHN1YiA9PT0gMCAmJiB0aGlzW29mZnNldCArIGkgLSAxXSAhPT0gMCkge1xuICAgICAgc3ViID0gMVxuICAgIH1cbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50QkUgPSBmdW5jdGlvbiB3cml0ZUludEJFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICB2YXIgbGltaXQgPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpXG5cbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBsaW1pdCAtIDEsIC1saW1pdClcbiAgfVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aCAtIDFcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHN1YiA9IDBcbiAgdGhpc1tvZmZzZXQgKyBpXSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoLS1pID49IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICBpZiAodmFsdWUgPCAwICYmIHN1YiA9PT0gMCAmJiB0aGlzW29mZnNldCArIGkgKyAxXSAhPT0gMCkge1xuICAgICAgc3ViID0gMVxuICAgIH1cbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uIHdyaXRlSW50OCAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiB3cml0ZUludDE2TEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlSW50MTZCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uIHdyaXRlSW50MzJMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiB3cml0ZUludDMyQkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSAmIDB4ZmYpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbmRleCBvdXQgb2YgcmFuZ2UnKVxuICBpZiAob2Zmc2V0IDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgY2hlY2tJRUVFNzU0KGJ1ZiwgdmFsdWUsIG9mZnNldCwgNCwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gd3JpdGVGbG9hdExFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiB3cml0ZUZsb2F0QkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgY2hlY2tJRUVFNzU0KGJ1ZiwgdmFsdWUsIG9mZnNldCwgOCwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbiAgcmV0dXJuIG9mZnNldCArIDhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gd3JpdGVEb3VibGVMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiB3cml0ZURvdWJsZUJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiBjb3B5ICh0YXJnZXQsIHRhcmdldFN0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXRTdGFydCA+PSB0YXJnZXQubGVuZ3RoKSB0YXJnZXRTdGFydCA9IHRhcmdldC5sZW5ndGhcbiAgaWYgKCF0YXJnZXRTdGFydCkgdGFyZ2V0U3RhcnQgPSAwXG4gIGlmIChlbmQgPiAwICYmIGVuZCA8IHN0YXJ0KSBlbmQgPSBzdGFydFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuIDBcbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgdGhpcy5sZW5ndGggPT09IDApIHJldHVybiAwXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBpZiAodGFyZ2V0U3RhcnQgPCAwKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICB9XG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldFN0YXJ0IDwgZW5kIC0gc3RhcnQpIHtcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0U3RhcnQgKyBzdGFydFxuICB9XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG4gIHZhciBpXG5cbiAgaWYgKHRoaXMgPT09IHRhcmdldCAmJiBzdGFydCA8IHRhcmdldFN0YXJ0ICYmIHRhcmdldFN0YXJ0IDwgZW5kKSB7XG4gICAgLy8gZGVzY2VuZGluZyBjb3B5IGZyb20gZW5kXG4gICAgZm9yIChpID0gbGVuIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0U3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9IGVsc2UgaWYgKGxlbiA8IDEwMDAgfHwgIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgLy8gYXNjZW5kaW5nIGNvcHkgZnJvbSBzdGFydFxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgdGFyZ2V0W2kgKyB0YXJnZXRTdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgVWludDhBcnJheS5wcm90b3R5cGUuc2V0LmNhbGwoXG4gICAgICB0YXJnZXQsXG4gICAgICB0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksXG4gICAgICB0YXJnZXRTdGFydFxuICAgIClcbiAgfVxuXG4gIHJldHVybiBsZW5cbn1cblxuLy8gVXNhZ2U6XG4vLyAgICBidWZmZXIuZmlsbChudW1iZXJbLCBvZmZzZXRbLCBlbmRdXSlcbi8vICAgIGJ1ZmZlci5maWxsKGJ1ZmZlclssIG9mZnNldFssIGVuZF1dKVxuLy8gICAgYnVmZmVyLmZpbGwoc3RyaW5nWywgb2Zmc2V0WywgZW5kXV1bLCBlbmNvZGluZ10pXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiBmaWxsICh2YWwsIHN0YXJ0LCBlbmQsIGVuY29kaW5nKSB7XG4gIC8vIEhhbmRsZSBzdHJpbmcgY2FzZXM6XG4gIGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuICAgIGlmICh0eXBlb2Ygc3RhcnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBlbmNvZGluZyA9IHN0YXJ0XG4gICAgICBzdGFydCA9IDBcbiAgICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZW5kID09PSAnc3RyaW5nJykge1xuICAgICAgZW5jb2RpbmcgPSBlbmRcbiAgICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gICAgfVxuICAgIGlmICh2YWwubGVuZ3RoID09PSAxKSB7XG4gICAgICB2YXIgY29kZSA9IHZhbC5jaGFyQ29kZUF0KDApXG4gICAgICBpZiAoY29kZSA8IDI1Nikge1xuICAgICAgICB2YWwgPSBjb2RlXG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlbmNvZGluZyAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBlbmNvZGluZyAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2VuY29kaW5nIG11c3QgYmUgYSBzdHJpbmcnKVxuICAgIH1cbiAgICBpZiAodHlwZW9mIGVuY29kaW5nID09PSAnc3RyaW5nJyAmJiAhQnVmZmVyLmlzRW5jb2RpbmcoZW5jb2RpbmcpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKSB7XG4gICAgdmFsID0gdmFsICYgMjU1XG4gIH1cblxuICAvLyBJbnZhbGlkIHJhbmdlcyBhcmUgbm90IHNldCB0byBhIGRlZmF1bHQsIHNvIGNhbiByYW5nZSBjaGVjayBlYXJseS5cbiAgaWYgKHN0YXJ0IDwgMCB8fCB0aGlzLmxlbmd0aCA8IHN0YXJ0IHx8IHRoaXMubGVuZ3RoIDwgZW5kKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ091dCBvZiByYW5nZSBpbmRleCcpXG4gIH1cblxuICBpZiAoZW5kIDw9IHN0YXJ0KSB7XG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIHN0YXJ0ID0gc3RhcnQgPj4+IDBcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgPyB0aGlzLmxlbmd0aCA6IGVuZCA+Pj4gMFxuXG4gIGlmICghdmFsKSB2YWwgPSAwXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKSB7XG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IHZhbFxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgYnl0ZXMgPSBCdWZmZXIuaXNCdWZmZXIodmFsKVxuICAgICAgPyB2YWxcbiAgICAgIDogdXRmOFRvQnl0ZXMobmV3IEJ1ZmZlcih2YWwsIGVuY29kaW5nKS50b1N0cmluZygpKVxuICAgIHZhciBsZW4gPSBieXRlcy5sZW5ndGhcbiAgICBmb3IgKGkgPSAwOyBpIDwgZW5kIC0gc3RhcnQ7IGkrKykge1xuICAgICAgdGhpc1tpICsgc3RhcnRdID0gYnl0ZXNbaSAlIGxlbl1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpc1xufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBJTlZBTElEX0JBU0U2NF9SRSA9IC9bXitcXC8wLTlBLVphLXotX10vZ1xuXG5mdW5jdGlvbiBiYXNlNjRjbGVhbiAoc3RyKSB7XG4gIC8vIE5vZGUgc3RyaXBzIG91dCBpbnZhbGlkIGNoYXJhY3RlcnMgbGlrZSBcXG4gYW5kIFxcdCBmcm9tIHRoZSBzdHJpbmcsIGJhc2U2NC1qcyBkb2VzIG5vdFxuICBzdHIgPSBzdHJpbmd0cmltKHN0cikucmVwbGFjZShJTlZBTElEX0JBU0U2NF9SRSwgJycpXG4gIC8vIE5vZGUgY29udmVydHMgc3RyaW5ncyB3aXRoIGxlbmd0aCA8IDIgdG8gJydcbiAgaWYgKHN0ci5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyaW5nLCB1bml0cykge1xuICB1bml0cyA9IHVuaXRzIHx8IEluZmluaXR5XG4gIHZhciBjb2RlUG9pbnRcbiAgdmFyIGxlbmd0aCA9IHN0cmluZy5sZW5ndGhcbiAgdmFyIGxlYWRTdXJyb2dhdGUgPSBudWxsXG4gIHZhciBieXRlcyA9IFtdXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGNvZGVQb2ludCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpXG5cbiAgICAvLyBpcyBzdXJyb2dhdGUgY29tcG9uZW50XG4gICAgaWYgKGNvZGVQb2ludCA+IDB4RDdGRiAmJiBjb2RlUG9pbnQgPCAweEUwMDApIHtcbiAgICAgIC8vIGxhc3QgY2hhciB3YXMgYSBsZWFkXG4gICAgICBpZiAoIWxlYWRTdXJyb2dhdGUpIHtcbiAgICAgICAgLy8gbm8gbGVhZCB5ZXRcbiAgICAgICAgaWYgKGNvZGVQb2ludCA+IDB4REJGRikge1xuICAgICAgICAgIC8vIHVuZXhwZWN0ZWQgdHJhaWxcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKGkgKyAxID09PSBsZW5ndGgpIHtcbiAgICAgICAgICAvLyB1bnBhaXJlZCBsZWFkXG4gICAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHZhbGlkIGxlYWRcbiAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IGNvZGVQb2ludFxuXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIC8vIDIgbGVhZHMgaW4gYSByb3dcbiAgICAgIGlmIChjb2RlUG9pbnQgPCAweERDMDApIHtcbiAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgIGxlYWRTdXJyb2dhdGUgPSBjb2RlUG9pbnRcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgLy8gdmFsaWQgc3Vycm9nYXRlIHBhaXJcbiAgICAgIGNvZGVQb2ludCA9IChsZWFkU3Vycm9nYXRlIC0gMHhEODAwIDw8IDEwIHwgY29kZVBvaW50IC0gMHhEQzAwKSArIDB4MTAwMDBcbiAgICB9IGVsc2UgaWYgKGxlYWRTdXJyb2dhdGUpIHtcbiAgICAgIC8vIHZhbGlkIGJtcCBjaGFyLCBidXQgbGFzdCBjaGFyIHdhcyBhIGxlYWRcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgIH1cblxuICAgIGxlYWRTdXJyb2dhdGUgPSBudWxsXG5cbiAgICAvLyBlbmNvZGUgdXRmOFxuICAgIGlmIChjb2RlUG9pbnQgPCAweDgwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDEpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goY29kZVBvaW50KVxuICAgIH0gZWxzZSBpZiAoY29kZVBvaW50IDwgMHg4MDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMikgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4NiB8IDB4QzAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDEwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDMpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweEMgfCAweEUwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDExMDAwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSA0KSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHgxMiB8IDB4RjAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweEMgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4NiAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgJiAweDNGIHwgMHg4MFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29kZSBwb2ludCcpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVzXG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIsIHVuaXRzKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG5cbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShiYXNlNjRjbGVhbihzdHIpKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSkgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBpc25hbiAodmFsKSB7XG4gIHJldHVybiB2YWwgIT09IHZhbCAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXNlbGYtY29tcGFyZVxufVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24gKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG1cbiAgdmFyIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDFcbiAgdmFyIGVNYXggPSAoMSA8PCBlTGVuKSAtIDFcbiAgdmFyIGVCaWFzID0gZU1heCA+PiAxXG4gIHZhciBuQml0cyA9IC03XG4gIHZhciBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDBcbiAgdmFyIGQgPSBpc0xFID8gLTEgOiAxXG4gIHZhciBzID0gYnVmZmVyW29mZnNldCArIGldXG5cbiAgaSArPSBkXG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSlcbiAgcyA+Pj0gKC1uQml0cylcbiAgbkJpdHMgKz0gZUxlblxuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KSB7fVxuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpXG4gIGUgPj49ICgtbkJpdHMpXG4gIG5CaXRzICs9IG1MZW5cbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCkge31cblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXNcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpXG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKVxuICAgIGUgPSBlIC0gZUJpYXNcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKVxufVxuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24gKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjXG4gIHZhciBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxXG4gIHZhciBlTWF4ID0gKDEgPDwgZUxlbikgLSAxXG4gIHZhciBlQmlhcyA9IGVNYXggPj4gMVxuICB2YXIgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApXG4gIHZhciBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSlcbiAgdmFyIGQgPSBpc0xFID8gMSA6IC0xXG4gIHZhciBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwXG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSlcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMFxuICAgIGUgPSBlTWF4XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpXG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tXG4gICAgICBjICo9IDJcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGNcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpXG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrXG4gICAgICBjIC89IDJcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwXG4gICAgICBlID0gZU1heFxuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKVxuICAgICAgZSA9IGUgKyBlQmlhc1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbilcbiAgICAgIGUgPSAwXG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCkge31cblxuICBlID0gKGUgPDwgbUxlbikgfCBtXG4gIGVMZW4gKz0gbUxlblxuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpIHt9XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4XG59XG4iLCJ2YXIgdG9TdHJpbmcgPSB7fS50b1N0cmluZztcblxubW9kdWxlLmV4cG9ydHMgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChhcnIpIHtcbiAgcmV0dXJuIHRvU3RyaW5nLmNhbGwoYXJyKSA9PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbihmdW5jdGlvbiAoKSB7XG4gIHRyeSB7XG4gICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGlzIG5vdCBkZWZpbmVkJyk7XG4gICAgfVxuICB9XG4gIHRyeSB7XG4gICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaXMgbm90IGRlZmluZWQnKTtcbiAgICB9XG4gIH1cbn0gKCkpXG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBjYWNoZWRTZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjYWNoZWRDbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIl19
