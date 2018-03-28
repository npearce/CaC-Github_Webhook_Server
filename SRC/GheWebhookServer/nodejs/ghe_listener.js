/*
*   GheListener:
*     GitHub Enterprise webhook message router.
*
*   N. Pearce, March 2018
*   http://github.com/npearce
*
*/
"use strict";

const logger = require('f5-logger').getInstance();
const http = require('http');
const GheUtil = require('./ghe_util.js');
var DEBUG = false;

function GheListener() {
  this.state = {};
}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;
GheListener.prototype.isPersisted = true;
GheListener.prototype.isSingleton = true;

/**
 * handle onStart
 */
GheListener.prototype.onStart = function(success, error) {

  logger.info("[GheListener] GitHub Enterprise WebHook Server: Starting...");

  //Load state (configuration data) from persisted storage.
  var that = this;  
  this.loadState(null, function (err, state) {
    if (err) {
      error('[GheListener] Error loading state: ' +err);
    }
    else {
      that.state = state;
      if (that.state.config.debug === 'true') {
        logger.info('[GheListener] DEBUG enabled...');
        DEBUG = true;
      }
      success('[GheListener] State loaded...');
    }
  });
};

/**
 * handle onGet HTTP request
 */
GheListener.prototype.onGet = function(restOperation) {

  //Respond with the 'state' (settings) configured via onPut()
  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * handle onPost HTTP request
 */
GheListener.prototype.onPost = function(restOperation) {

  var config = this.state.config;

  //Do we have configuration data: GitHub IP & Access Token?
  if (!config.ghe_ip_address || !config.ghe_access_token) {
    console.log('[GheListener] Requires \'ghe_ip_address\' & \'ghe_access_token\' to function.');
    this.completeRestOperation(restOperation);
  }
  else {

    var that = this;
    var gheMessage = restOperation.getBody();
    if (DEBUG) { logger.info("[GheListener] - DEBUG - Activity from repository: " + gheMessage.repository.name); }

    GheUtil.parseCommitMessage(gheMessage, function(action, definitionPath) {
      if (DEBUG) { logger.info('[GheListener] - DEBUG - Action:' +action+ ' definitionPath: ' +definitionPath); }

      GheUtil.getGheDownloadUrl(config, definitionPath, function(download_url) {
        if (DEBUG) { logger.info('[GheListener] - DEBUG - Retrieved download_url: ' +download_url); }

        GheUtil.getServiceDefinition(config, download_url, function(service_definition) {
          if (DEBUG) { logger.info('[GheListener] - DEBUG - Worker will ' +action+ ' - '  +service_definition); }

          var parsed_inputs = JSON.parse(service_definition);
          Object.keys(parsed_inputs).forEach( function(key) {
              if (parsed_inputs[key].class == 'Tenant' ) {
                if (DEBUG) { logger.info('[GheListener] - DEBUG - The \'Tenant\' is: ' +key); }

                that.pushToIapp(config, action, key, service_definition, function(results) {
                  if (DEBUG) { logger.info('[GheListener] - DEBUG - AS3 Response: ' +JSON.stringify(results)); }

                  GheUtil.createIssue(config, action, key, service_definition, results);
                });
              }
          });
        });
      });
    });

    // Respond to GHE WebHook Client
    restOperation.setBody("[F5 iControl LX worker: GheListener] Thanks, GitHub!");
    restOperation.setStatusCode('200');
    restOperation.setContentType('text');
    this.completeRestOperation(restOperation);

  }
};

/**
 * handle onPut HTTP request
 */
GheListener.prototype.onPut = function(restOperation) {

  var newState = restOperation.getBody();
  if (DEBNUG) { logger.info('newState: ' +JSON.stringify(newState)); }
  
  if (newState.config.debug === 'true') { 
    logger.info('[GheListener] - Enabling debug mode...');
    DEBUG = true;
  }
  else {
    DEBUG = false;
  }

  this.state = newState;
  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * Deploy to AS3
 */

GheListener.prototype.pushToIapp = function (config, action, tenant, service_definition, cb) {

  var host = '127.0.0.1';
  var that = this;
  var method = 'POST';
  var parsed_inputs, as3uri, uri, restOp;

  if (action == 'delete') {

    if (DEBUG) { logger.info('[GheListener] - DEBUG - We are deleting'); }
    method = 'DELETE';

    parsed_inputs = JSON.parse(service_definition);     
    as3uri = '/mgmt/shared/appsvcs/declare/localhost/'+tenant;
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, service_definition);
    that.restRequestSender.sendDelete(restOp)
    .then (function (resp) {
      if (DEBUG) { logger.info('[GheListener] - DEBUG - .pushToIapp() Response: ' +JSON.stringify(resp.body.results)); }
      cb(resp.body.results);
    })
    .catch (function (error) {
      if (DEBUG) { logger.info('[GheListener] - DEBUG - .pushToIapp() Error: ' +error); }
      cb(error);
    });
          
  }
  else {
    if (DEBUG) { logger.info('[GheListener] - DEBUG - We are deploying'); }
    as3uri = '/mgmt/shared/appsvcs/declare';
    uri = this.generateURI(host, as3uri);
    restOp = this.createRestOperation(uri, service_definition);          
    this.restRequestSender.sendPost(restOp)
    .then (function (resp) {
      if (DEBUG) { logger.info('[GheListener] - DEBUG - .pushToIapp() Response: ' +JSON.stringify(resp.body.results)); }
      cb(resp.body.results);
    })
    .catch (function (error) {
      if (DEBUG) { logger.info('[GhListener] - DEBUG - .pushToIapp() Error: ' +error); }
      cb(error);
    });
  
  }

};

/**
 * Generate URI based on individual elements (host, path).
 *
 * @param {string} host IP address or FQDN of a target host
 * @param {string} path Path on a target host
 *
 * @returns {url} Object representing resulting URI.
 */
GheListener.prototype.generateURI = function (host, path) {

  return this.restHelper.buildUri({
      protocol: 'http',
      port: '8100',
      hostname: host,
      path: path
  });
};
/**
* Creates a new rest operation instance. Sets the target uri and body
*
* @param {url} uri Target URI
* @param {Object} body Request body
*
* @returns {RestOperation}
*/
GheListener.prototype.createRestOperation = function (uri, body) {

  var restOp = this.restOperationFactory.createRestOperationInstance()
      .setUri(uri)
      .setIdentifiedDeviceRequest(true)
      .setBody(body.toString());

  return restOp;
};

/**
 * handle /example HTTP request
 */
GheListener.prototype.getExampleState = function () {
  
  return {
    "config": {
      "ghe_ip_address":"[ip_address]",
      "ghe_access_token": "[GitHub Access Token]",
      "debug": "[true|false]"
    }
  };
};

module.exports = GheListener;
