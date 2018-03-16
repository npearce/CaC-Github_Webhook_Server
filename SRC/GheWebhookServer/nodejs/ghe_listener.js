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

  logger.info("[GheListener] GitHub Enterprise WebHook Server: onStart()...");

  var that = this;  
  this.loadState(null, function (err, state) {
    if (err) {
      error('[GheListener] Error loading state: ' +err);
    }
    else {
      that.state = state;
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

  if (!config.ghe_ip_address || !config.ghe_access_token) {
    console.log('[GheListener] Requires \'ghe_ip_address\' & \'ghe_access_token\' to function.');
    this.completeRestOperation(restOperation);
  }
  else {

    var that = this;
    var gheMessage = restOperation.getBody();
    logger.info("[GheListener] Activity from repository: " + gheMessage.repository.name);

    GheUtil.parseCommitMessage(gheMessage, function(action, definitionPath) {
      logger.info('[GheListener] action:' +action+ ' definitionPath: ' +definitionPath);
      GheUtil.getGheDownloadUrl(config, definitionPath, function(download_url) {
        logger.info('[GheListener] download_url: ' +download_url);
        GheUtil.getServiceDefinition(config, download_url, function(service_definition) {
          logger.info('[GheListener] This is what we will ' +action+ ' - '  +service_definition);
          that.pushToIapp(config, action, service_definition);

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
  this.state = newState;
  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * Deploy to AS3
 */

GheListener.prototype.pushToIapp = function (config, action, service_definition) {

  var host = '127.0.0.1';
  var that = this;
  var method = 'POST';

  if (action == 'delete') {

    logger.info('we are deleting');
    method = 'DELETE';
    var parsed_inputs = JSON.parse(service_definition);
     
    Object.keys(parsed_inputs).forEach( function(key) {
        if (parsed_inputs[key].class == 'Tenant' ) {
            var as3uri = '/mgmt/shared/appsvcs/declare/localhost/'+key;
            var uri = that.generateURI(host, as3uri);
            var restOp = that.createRestOperation(uri, service_definition);
            that.restRequestSender.sendDelete(restOp)
            .then (function (resp) {
              logger.info('[GheListener] pushToIapp: Response: ' +JSON.stringify('\t', '', resp));
          //    cb(resp);
            })
            .catch (function (error) {
              logger.info('we have an error: ' +error);
          //   cb(error);
            });
          
          }
    });
  }
  else {
    logger.info('we are deploying');
    var as3uri = '/mgmt/shared/appsvcs/declare';
    var uri = this.generateURI(host, as3uri);
    var restOp = this.createRestOperation(uri, service_definition);          
    this.restRequestSender.sendPost(restOp)
    .then (function (resp) {
      logger.info('[GheListener] pushToIapp: Response: ' +JSON.stringify('\t', '', resp));
  //    cb(resp);
    })
    .catch (function (error, errMsg) {
      logger.info('we have an error: ' +error);
      logger.info('we have an error: ' +errMsg);
  //   cb(error);
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

  logger.info('uri: ' +uri);
  logger.info('body' +body);

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
      "ghe_access_token": "[GitHub Access Token]"  ,
      "debug": "[true|false]"
    }
  };
};

module.exports = GheListener;
