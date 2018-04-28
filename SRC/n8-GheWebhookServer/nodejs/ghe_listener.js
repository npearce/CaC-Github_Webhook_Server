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
var DEBUG = false;

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

  if (DEBUG === true) { logger.info('[GheListener - DEBUG] - In GheListener.prototype.onPost()'); }

  var that = this;
  var postData = restOperation.getBody();

  // Grab the settings from /ghe_settings worker
  var getConfig = new Promise((resolve, reject) => {

    let uri = that.generateURI('127.0.0.1', '/mgmt'+gheSettingsPath);
    let restOp = that.createRestOperation(uri, 'meh');

    if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getConfig() Attemtped to fetch config...'); }

    that.restRequestSender.sendGet(restOp)
    .then (function (resp) {
      if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getConfig() Response: ' +JSON.stringify(resp.body.config,'', '\t')); }
      resolve(resp.body.config);
    })
    .catch (function (error) {
      logger.info('[GheListener] - Error retrieving settings: ' +error);
      reject(error);
    });
    
  });

  // Grab the settings from /ghe_settings worker, then.... do this
  getConfig.then((config) => {

    // Is it from Github
    if (typeof postData.head_commit !==  'undefined' && postData.head_commit) {
  
      logger.info("[GheListener] Message recevied from Github repo: " +postData.repository.full_name);
      
      // Data required to execute each commit job
      var jobOpts = {};
  
      jobOpts.repo_name = postData.repository.name;
      jobOpts.repo_fullname = postData.repository.full_name;
    
      if (config.debug === "true") { logger.info("[GheListener - DEBUG] - Activity from repository: " + jobOpts.repo_name); }
  
      GheUtil.parseCommitMessage(postData, function(action, definitionPath) {
        if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Action: ' +action+ ' definitionPath: ' +definitionPath); }
        jobOpts.action = action;
        jobOpts.defPath = definitionPath;
  
        GheUtil.getGheDownloadUrl(config, jobOpts.defPath, function(download_url) {
          if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Retrieved download_url: ' +download_url); }
          jobOpts.url = download_url;
  
          GheUtil.getServiceDefinition(config, jobOpts.url, function(service_def) {
            if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Worker will ' +action+ ' - '  +service_def); }    
            var parsed_def = JSON.parse(service_def);
            var declaration = parsed_def.declaration;
  
            if (config.debug === "true") { logger.info('[GheListener - DEBUG] - declaration is: ' +service_def); }
            jobOpts.service_def = parsed_def;
            
            Object.keys(declaration).forEach( function(key) {
              if (config.debug === "true") { logger.info('[GheListener - DEBUG] processing declaration keys. Key is: ' +key); }
  
              if (declaration[key].class == 'Tenant' ) {
                if (config.debug === "true") { logger.info('[GheListener - DEBUG] - The \'Tenant\' is: ' +key); }  
                jobOpts.tenant = key;

                logger.info('[GheListener] - Deploying change to tenant: ' +jobOpts.tenant);
  
                if (config.debug === "true") { logger.info('\n\n[GheListener - DEBUG] - Calling to pushToBigip() with:\n\nconfig: ' +JSON.stringify(config,'', '\t')+ '\n\njobOpts: ' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
  
                that.pushToBigip(config, jobOpts, function(results) {
                  jobOpts.results = results;

                  logger.info('[GheListener] - Change results: ' +JSON.stringify(jobOpts.results));

                  if (config.debug === "true") { logger.info('\n\n[GheListener - DEBUG] - Deployed to BIG-IP with:\n\nconfig: ' +JSON.stringify(config,'', '\t')+ '\n\njobOpts: ' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
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
  restOperation.setBody(restOpBody);
  this.completeRestOperation(restOperation);
  
};


/**
 * Deploy to AS3 (App Services 3.0 - declarative interface)
 */
GheListener.prototype.pushToBigip = function (config, jobOpts, cb) {

  var host = '127.0.0.1';
  var that = this;
  var method = 'POST';
  var as3uri, uri, restOp;

  if (jobOpts.action == 'delete') {

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - We are deleting'); }

    method = 'DELETE';
    as3uri = '/mgmt/shared/appsvcs/declare/'+jobOpts.tenant;
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, jobOpts.service_def); //TODO you don't need a service def to delete....

    that.restRequestSender.sendDelete(restOp)
    .then (function (resp) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Delete Response: ' +JSON.stringify(resp.body.results,'', '\t')); }
      cb(resp.body.results);
    })
    .catch (function (error) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Delete Error: ' +error); }
      cb(error);
    });

  }
  else {

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - We are deploying'); }

    as3uri = '/mgmt/shared/appsvcs/declare';
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, JSON.stringify(jobOpts.service_def));

    that.restRequestSender.sendPost(restOp)
    .then (function (resp) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Post Response: ' +JSON.stringify(resp.body.results,'', '\t')); }
      cb(resp.body.results);
    })
    .catch (function (error) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Post Error: ' +error); }
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
      .setBody(body.toString()); //TODO check if there is a body (might be a deletion)

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
