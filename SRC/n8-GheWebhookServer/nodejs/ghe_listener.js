/*
*   GheListener:
*     GitHub Enterprise webhook message router.
*
*   N. Pearce, April 2018
*   http://github.com/npearce
*
*/
"use strict";

const logger = require('f5-logger').getInstance();
const http = require('http');
const GheUtil = require('./ghe_util.js');
const gheSettingsPath = '/shared/n8/ghe_settings';
//var config = {};
var DEBUG = true;

function GheListener() {
}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;
GheListener.prototype.isSingleton = true;

/**
 * handle onStart
 */
GheListener.prototype.onStart = function(success, error) {

  logger.info("[GheListener] GitHub Enterprise WebHook Server: Starting...");

  // Make GheSettings worker a dependency.
  var gheSettingsUrl = this.restHelper.makeRestnodedUri(gheSettingsPath);
  this.dependencies.push(gheSettingsUrl);
  success();

};

/**
 * handle onStartCompleted
 */
GheListener.prototype.onStartCompleted = function(success, error) {

  logger.info('[GheListener] - Dependencies loaded, startup complete.');
  success();

};

/**
 * handle onGet HTTP request
 */
GheListener.prototype.onGet = function(restOperation) {

  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * handle onPost HTTP request
 */
GheListener.prototype.onPost = function(restOperation) {

  if (DEBUG) { logger.info('[GheListener - DEBUG] - In GheListener.prototype.onPost()'); }

  var that = this;
  var postData = restOperation.getBody();

  var getConfig = new Promise((resolve, reject) => {

    let uri = that.generateURI('127.0.0.1', '/mgmt'+gheSettingsPath);
    let restOp = that.createRestOperation(uri, 'meh');

    if (DEBUG) { logger.info('[GheListener - DEBUG] - getConfig() Attemtped to fetch config...'); }

    that.restRequestSender.sendGet(restOp)
    .then (function (resp) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - getConfig() Response: ' +JSON.stringify(resp.body.config,'', '\t')); }
      resolve(resp.body.config);
    })
    .catch (function (error) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - getConfig() Error: ' +error); }
      reject(error);
    });
    
  });

  // grab the settings from ghe_settings worker, then....
  getConfig.then((config) => {

    if (typeof postData.head_commit !==  'undefined' && postData.head_commit) {

      logger.info('\n\nits a github message\n\n');
  
      if (DEBUG) { logger.info("[GheListener - DEBUG] Message recevied from Github repo: " +postData.repository.full_name); }
      
      // Data required to execute each commit
      var jobOpts = {};
  
      jobOpts.repo_name = postData.repository.name;
      jobOpts.repo_fullname = postData.repository.full_name;
    
      if (DEBUG) { logger.info("[GheListener - DEBUG] - Activity from repository: " + jobOpts.repo_name); }
  
      GheUtil.parseCommitMessage(postData, function(action, definitionPath) {
        if (DEBUG) { logger.info('[GheListener - DEBUG] - Action: ' +action+ ' definitionPath: ' +definitionPath); }
        jobOpts.action = action;
        jobOpts.defPath = definitionPath;
  
        GheUtil.getGheDownloadUrl(config, jobOpts.defPath, function(download_url) {
          if (DEBUG) { logger.info('[GheListener - DEBUG] - Retrieved download_url: ' +download_url); }
          jobOpts.url = download_url;
  
          GheUtil.getServiceDefinition(config, jobOpts.url, function(service_def) {
            if (DEBUG) { logger.info('[GheListener - DEBUG] - Worker will ' +action+ ' - '  +service_def); }
  
            logger.info('\n\ncalled GheUtil.getServiceDefinition() \n\n');
  
            var parsed_def = JSON.parse(service_def);
            var declaration = parsed_def.declaration;
  
            if (DEBUG) { logger.info('[GheListener - DEBUG] - declaration is: ' +service_def); }
            jobOpts.service_def = parsed_def;
            
            Object.keys(declaration).forEach( function(key) {
              if (DEBUG) { logger.info('[GheListener - DEBUG] processing declaration keys. Key is: ' +key); }
  
              if (declaration[key].class == 'Tenant' ) {
                if (DEBUG) { logger.info('[GheListener - DEBUG] - The \'Tenant\' is: ' +key); }
  
                jobOpts.tenant = key;
  
                if (DEBUG) { logger.info('\n\nCalling to pushToBigip() with:\n\tconfig:\n' +JSON.stringify(config,'', '\t')+ '\n\tjobOpts:\n' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
  
                that.pushToBigip(config, jobOpts, function(results) {
                  if (DEBUG) { logger.info('\n\nDeployed to BIG-IP with:\n\tconfig:\n' +JSON.stringify(config,'', '\t')+ '\n\tjobOpts:\n' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
  
                  jobOpts.results = results;
  
                  if (DEBUG) { logger.info('[GheListener - DEBUG] - Creating Github Issue with: ' +JSON.stringify(jobOpts,'', '\t')); }
  
                  GheUtil.createIssue(config, jobOpts);
                  
                });
              }
            });
          });
        });
      });        
    }

  });

  let restOpBody = { message: '[F5 iControl LX worker: GheListener] Thanks for the message, GitHub!' };  
  restOperation.setBody(restOpBody); ////why is doing this here, bad....???
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
    as3uri = '/mgmt/shared/appsvcs/declare/'+jobOpts.tenant;
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, jobOpts.service_def); // you don't need a service def to delete....

    that.restRequestSender.sendDelete(restOp)
    .then (function (resp) {
      if (DEBUG) { logger.info('[GheListener - DEBUG] - .pushToBigip() Response: ' +JSON.stringify(resp.body.results,'', '\t')); }
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
      if (DEBUG) { logger.info('[GheListener - DEBUG] - .pushToBigip() Response: ' +JSON.stringify(resp.body.results,'', '\t')); }
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
