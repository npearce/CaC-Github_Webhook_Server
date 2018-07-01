/*
*   GheListener:
*     GitHub Enterprise Webhook Server for F5 BIG-IP.
*
*   N. Pearce, June 2018
*   http://github.com/npearce
*
*/
"use strict";

const logger = require('f5-logger').getInstance();
const GheUtil = require('./ghe_util.js');  //TODO: eliminate this!!!
const gheSettingsPath = '/shared/n8/ghe_settings';
var https = require('https');

const agent = new https.Agent({
  ca: 'invalid',
  rejectUnauthorized: false
});

const octokit = require('@octokit/rest')({
  debug: true,
  baseUrl: 'https://172.31.1.200/api/v3',
  headers: {
    accept: 'application/vnd.github.v3+json'
  },
  agent
});

/*
const octokit = require('@octokit/rest')({
  baseUrl: 'https://172.31.1.200',
  host: '172.31.1.200',
  timeout: 0, // 0 means no request timeout
  headers: {
    accept: 'application/vnd.github.v3+json',
    Authorization: Bearer 3c02a6288c5d7d6a3193e617b639a3d05bb549b7
  },
  rejectUnauthorized: false,
  authenticate: {
//    type: 'oauth',
//    token: '3c02a6288c5d7d6a3193e617b639a3d05bb549b7'
    type: 'basic',
    username: 'iacadmin',
    password: 'iacadmin1'
  }});

  */

var DEBUG = false;

function GheListener() {
  this.config = {};
  this.state = {};
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

  var postData = restOperation.getBody();
  
//  logger.info('Recieved: ' +JSON.stringify(postData, '', '\t'));
//  logger.info('Recieved: postData.repository: ' +JSON.stringify(postData.repository, '', '\t'));
  
  // Is the POST from Github?
  if (typeof postData.head_commit !==  'undefined' && postData.head_commit) {

    // Collect values we need for processing
    this.state.head_commit_id = postData.head_commit.id;
    this.state.repo_name = postData.repository.name;
    this.state.repo_fullname = postData.repository.full_name;

    if (DEBUG === true) { logger.info("[GheListener] Message recevied from Github repo: " +postData.repository.full_name); }

    // Grab the settings from /ghe_settings worker, then.... do this

    this.getConfig()
    .then(() => {

      // Commence parsing the commit message for work to do.
      return this.parseCommitMessage(postData);


    })
    .then((actions) => {

      if (DEBUG === true) { logger.info('[GheListener - DEBUG] - Parsed Commit Message - this.state: ' +JSON.stringify(this.state)); }
      if (DEBUG === true) { logger.info('[GheListener - DEBUG] - Parsed Commit Message - actions: ' +JSON.stringify(actions)); }

      //Get Service Definition
      return this.getServiceDefinition();

    })

    .then((service_def) => {
      
      logger.info('Service Def is: ' +JSON.stringify(service_def));

    })
    .catch((err) => {
      logger.info('err in master promise chain: ' +JSON.stringify(err));
      //Get Service Definition
//        return this.getServiceDefinition();

    });
  
/*
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

                  if (config.debug === "true") { logger.info('[GheListener] - Change results: ' +JSON.stringify(jobOpts.results)); }

                  jobOpts.results = results;

                  if (config.debug === "true") { logger.info('\n\n[GheListener - DEBUG] - Deployed to BIG-IP with:\n\nconfig: ' +JSON.stringify(config,'', '\t')+ '\n\njobOpts: ' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
                  GheUtil.createIssue(config, jobOpts);

                });
              }
            });
          });
        });
        */
    }
//  });

  let restOpBody = { message: '[F5 iControl LX worker: GheListener] Thanks for the message, GitHub!' };  
  restOperation.setBody(restOpBody);
  this.completeRestOperation(restOperation);
  
};

/**
 * Fetches operational settings from persisted state worker, GheSettings
 * 
 * @returns {Promise} Promise Object representing operating settings retreived from GheSettings (persisted state) worker
 */
GheListener.prototype.getConfig = function () {
  
  return new Promise((resolve, reject) => {

    let uri = this.restHelper.makeRestnodedUri('/mgmt' +gheSettingsPath);
    let restOp = this.createRestOperation(uri);

    if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getConfig() Attemtped to fetch config...'); }

    this.restRequestSender.sendGet(restOp)
    .then ((resp) => {

      if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getConfig() Response: ' +JSON.stringify(resp.body.config,'', '\t')); }

      if (typeof resp.body.config !== 'undefined') {

        if (resp.body.config.debug === true) {
          DEBUG = true;
        }
        else {
          DEBUG = false;
        }

        this.config = resp.body.config;
        resolve();

      }
      else {

        reject('[GheListener - ERROR] getConfig() -  unable to retrieve config');

      }

    })
    .catch ((err) => {

      logger.info('[GheListener] - Error retrieving settings: ' +err);
      reject(err);

    });

  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} array of addition/modification/deletion actions
 */
GheListener.prototype.parseCommitMessage = function (commitMessage) {

  return new Promise((resolve, reject) => {

    this.state.actions = {};

    // Iterate through 'commits' array to handle added|modified|removed definitions
    commitMessage.commits.map((element, index) => {

      // Handle new service definitions.
      if (element.added.length > 0) {

        // Initialize
        if (typeof this.state.actions.add === 'undefined') {
          this.state.actions.added = [];
        }

        let deployFile = element.added.toString();
        let deployFilePath = "/api/v3/repos/" + element.repository.full_name + "/contents/" + deployFile;

        let addition = { [deployFile]: deployFilePath };
        this.state.actions.added.push(addition);

      }

      // Handle modified service definitions.
      if (element.modified.length > 0) {

        // Initialize
        if (typeof this.state.actions.modified === 'undefined') {
          this.state.actions.modified = [];
        }

        let deployFile = element.modified.toString();
        let deployFilePath = "/api/v3/repos/" + commitMessage.repository.full_name + "/contents/" + deployFile;

        let modification = { [deployFile]: deployFilePath };
        this.state.actions.modified.push(modification);

      }

      // Handle deleted service definitions.
      if (element.removed.length > 0) {

        let deletedFile = element.removed.toString();
        // The file existed in the previous commmit, before the deletion...
        let previousCommit = commitMessage.before;
        let deletedFilePath = "/api/v3/repos/" + commitMessage.repository.full_name + "/contents/" + deletedFile + "?ref=" + previousCommit;    

        let deletion = { [deletedFile]: deletedFilePath };
        this.state.actions.deleted.push(deletion);
      }

      // Return when all commits processed
      if ((commitMessage.commits.length - 1) === index) {
        resolve(this.state.actions);
      }

    });

  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} retrieved from GitHub Enterprise
 */
GheListener.prototype.getServiceDefinition = function () {

/**
 * 
  octokit.repos.getContent({
    owner: 'octokit',
    repo: 'rest.js',
    path: 'examples/getContent.js'
  })

  .then(result => {
    // content will be base64 encoded
    const content = Buffer.from(result.data.content, 'base64').toString()
    console.log(content)
  })
 */

  return new Promise((resolve, reject) => {

    octokit.authenticate({
      type: 'oauth',
      token: '3c02a6288c5d7d6a3193e617b639a3d05bb549b7'
    });


    octokit.repos.getContent({owner: 'iacorg', repo: 'ip-172-31-1-20.us-west-1.compute.internal', path: 'README.md'})

//    octokit.repos.getContent(options)
//    octokit.repos.getAll()
    .then(result => {

//      logger.info('\n\n' +JSON.stringify(result, '', '\t'));  // All of the data about the object referenced in 'path:'
 
      // content will be base64 encoded
      const content = Buffer.from(result.data.content, 'base64').toString();
      logger.info('\n\n\n' +content);
      
  //    logger.info('[GheListener] - IN getServiceDefintion with octokit\n\n\t\t result: ' +JSON.stringify(result, '', '\t'));
      resolve(content);

    })
    .catch(err => {

      logger.info('[GheListener - ERROR] - getServiceDefinition(): ' +JSON.stringify(err));
      reject(err);

    });
  });

};

/**
 * Deploy to AS3 (App Services 3.0 - declarative interface)
 */
GheListener.prototype.pushToBigip = function (config, jobOpts, cb) {

  var host = '127.0.0.1';
  var that = this;
  var as3uri, uri, restOp;

  if (jobOpts.action == 'delete') {

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - We are deleting'); }

    as3uri = '/mgmt/shared/appsvcs/declare/'+jobOpts.tenant;
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, JSON.stringify(jobOpts.service_def)); //TODO you don't need a service def to delete....

    that.restRequestSender.sendDelete(restOp)
    .then (function (resp) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Delete Response: ' +JSON.stringify(resp.body.results,'', '\t')); }

      let response = {
        message: resp.body.results[0].message,
        details: resp.body.results[0]
      };

      cb(response);

    })
    .catch (function (error) {
      let errorBody = error.getResponseOperation().getBody();
      let errorStatusCode = error.getResponseOperation().getStatusCode();
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Delete Error: ' +JSON.stringify(errorBody)); }

      let response = {
          message: "Error: " +errorStatusCode,
          details: JSON.stringify(errorBody)
      };

      cb(response);

    });

  }
  else {

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - We are deploying'); }

    as3uri = '/mgmt/shared/appsvcs/declare';
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, JSON.stringify(jobOpts.service_def));
    restOp.setMethod('Post');

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Seding: ' +JSON.stringify(restOp)); }

    that.restRequestSender.sendPost(restOp)
    .then (function (resp) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Post Response: ' +JSON.stringify(resp.body.results, '', '\t')); }

      let response = {
        message: resp.body.results[0].message,
        details: resp.body.results[0]
      };

      cb(response);

    })
    .catch (function (error) {
      let errorBody = error.getResponseOperation().getBody();
      let errorStatusCode = error.getResponseOperation().getStatusCode();
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() POST error: ' +JSON.stringify(errorBody)); }

      let response = {
          message: "Error: " +errorStatusCode,
          details: JSON.stringify(errorBody)
      };
      
      cb(response);

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
      .setIdentifiedDeviceRequest(true);

      if (body) {
        restOp.setBody(body);
      }

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
