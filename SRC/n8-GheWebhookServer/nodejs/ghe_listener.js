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
var DEBUG = true;

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
      if (typeof state !== 'undefined' && state !== null) {
        // We loaded some persisted state
        that.state = state;

        // Checking persisted state for worker config
        if (typeof that.state.config !== 'undefined') {

          // Checking worker config for debug mode
          if (typeof that.state.config.debug !== 'undefined' && that.state.config.debug === true ) {

            logger.info('[GheListener] DEBUG enabled...');
            DEBUG = true;
          }
        }

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

  if (DEBUG) { logger.info('[GheListener - DEBUG] - In GheListener.prototype.onPost()'); }

  var postData = restOperation.getBody();

  // Is this config data, or a GitHub Commit message?
  logger.info('\n\n[GheListener] - is there a postData?: ' +JSON.stringify(postData));
  logger.info('\n\n[GheListener] - is there a postData.config?: ' +JSON.stringify(postData.config));

  if (typeof postData.config !== 'undefined' && postData.config) {

    //This is GheListener config data
    if (DEBUG) { logger.info('[GheListener - DEBUG] Config changed: ' +JSON.stringify(postData, '', '\t')); }

    logger.info('BEFORE: this.state: ' +JSON.stringify(this.state));

    this.state.config = {};
    this.state.config = postData.config;
    logger.info('AFTER: this.state: ' +JSON.stringify(this.state));

    restOperation.setBody(this.state);
    this.completeRestOperation(restOperation);
  
  }

  // Check we have the data to process a GitHub commit message
//  else if (!this.state.config.ghe_ip_address || !this.state.config.ghe_access_token) {
  else if (!this.state.config || !this.state.config.ghe_ip_address || !this.state.config.ghe_access_token) {

    logger.info('[GheListener] Requires \'ghe_ip_address\' & \'ghe_access_token\' to function.');

//    restOperation.setBody({ message: '[GheListener] Requires \'ghe_ip_address\' & \'ghe_access_token\' to function.' })
//      .setStatusCode('200');
    this.completeRestOperation(restOperation);

  } 

  // Check its a GitHub Commit message
  else if (typeof postData.head_commit !==  'undefined' && postData.head_commit) {

    logger.info('its a github message\n\n');
    if (DEBUG) { logger.info("[GheListener - DEBUG] Message recevied from Github repo: " +postData.repository.full_name); }

    // Data required to execute 
    var jobOpts = {};

    jobOpts.repo_name = postData.repository.name;
    jobOpts.repo_fullname = postData.repository.full_name;

    var config = this.state.config; //Save some typing

    this.state.lastCommit = {};
    this.state.lastCommit = postData;
    
    if (DEBUG) { logger.info('[GheListener - DEBUG] - this.state: ' +JSON.stringify(this.state,'', '\t')); }
    var that = this;

    if (DEBUG) { logger.info("[GheListener - DEBUG] - Activity from repository: " + jobOpts.repo_name); }

    GheUtil.parseCommitMessage(postData, function(action, definitionPath) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - Action:' +action+ ' definitionPath: ' +definitionPath); }
      jobOpts.action = action;
      jobOpts.defPath = definitionPath;

      GheUtil.getGheDownloadUrl(config, jobOpts.defPath, function(download_url) {
        if (DEBUG) { logger.info('[GheListener - DEBUG] - Retrieved download_url: ' +download_url); }
        jobOpts.url = download_url;

        GheUtil.getServiceDefinition(config, jobOpts.url, function(service_def) {
          if (DEBUG) { logger.info('[GheListener - DEBUG] - Worker will ' +action+ ' - '  +service_def); }

          var parsed_def = JSON.parse(service_def);
          var declaration = parsed_def.declaration;
//          var declaration = service_def.declaration;

          if (DEBUG) { logger.info('[GheListener - DEBUG] - declaration is: ' +service_def); }
          jobOpts.service_def = parsed_def;
          
          Object.keys(declaration).forEach( function(key) {

              if (declaration[key].class == 'Tenant' ) {
                if (DEBUG) { logger.info('[GheListener - DEBUG] - The \'Tenant\' is: ' +key); }
                jobOpts.tenant = key;

                logger.info('\n\nCalling that.pushToBigip with:\n\tconfig: ' +JSON.stringify(config)+ '\n\tjobOpts: ' +JSON.stringify(jobOpts)+ '\n\n' );
                that.pushToBigip(config, jobOpts, function(results) {
                  if (DEBUG) { logger.info('[GheListener - DEBUG] - AS3 Response: ' +JSON.stringify(results)); }
                  jobOpts.results = results;
                  logger.info('\n\nCalling that.pushToBigip with:\n\tconfig: ' +JSON.stringify(config)+ '\n\tjobOpts: ' +JSON.stringify(jobOpts)+ '\n\n' );

                  GheUtil.createIssue(config, jobOpts);

                });
              }
          });
        });
      });
    });

    // Respond to GHE WebHook Client
//    restOperation.setBody({ message: '[F5 iControl LX worker: GheListener] Thanks for the message, GitHub!' })
//      .setStatusCode('200');
    this.completeRestOperation(restOperation);
        
  }
  else {

    logger.info('I have no idea what this data is... Enable debug mode.');

    restOperation.setBody({ message: 'I have no idea what this data is... Enable debug mode.' })
    .setStatusCode('200');
//      .setContentType('text');
    this.completeRestOperation(restOperation);

  }

};

/**
 * handle onPut HTTP request
 */
GheListener.prototype.onPut = function(restOperation) {

  var newState = restOperation.getBody();
  if (DEBUG) { logger.info('newState: ' +JSON.stringify(newState)); }
  
  if (typeof newState.config !== 'undefined' && newState.config.debug === 'true') { 
    logger.info('[GheListener] - Enabling debug mode...');
    DEBUG = true;
  }
  else {
    DEBUG = false;
    this.state = {};
  }

  this.state = newState;
  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * Deploy to AS3
 */
GheListener.prototype.pushToBigip = function (config, jobOpts, cb) {

  var host = '127.0.0.1';
  var that = this;
  var method = 'POST';
  var as3uri, uri, restOp;

  if (jobOpts.action == 'delete') {

    if (DEBUG) { logger.info('[GheListener - DEBUG] - We are deleting'); }

    method = 'DELETE';
//    parsed_inputs = JSON.parse(service_def);     
    as3uri = '/mgmt/shared/appsvcs/declare/'+jobOpts.tenant;
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, jobOpts.service_def); // you don't need a service def to delete....

    that.restRequestSender.sendDelete(restOp)
    .then (function (resp) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - .pushToBigip() Response: ' +JSON.stringify(resp.body.results)); }
      cb(resp.body.results);
    })
    .catch (function (error) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - .pushToBigip() Error: ' +error); }
      cb(error);
    });
          
  }
  else {

    if (DEBUG) { logger.info('[GheListener - DEBUG] - We are deploying'); }

    as3uri = '/mgmt/shared/appsvcs/declare';
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, JSON.stringify(jobOpts.service_def));

    that.restRequestSender.sendPost(restOp)
    .then (function (resp) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - .pushToBigip() Response: ' +JSON.stringify(resp.body.results)); }
      cb(resp.body.results);
    })
    .catch (function (error) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - .pushToBigip() Error: ' +error); }
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
      .setBody(body.toString()); //check if there is a body (might be a deletion)

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
