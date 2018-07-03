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
const gheSettingsPath = '/shared/n8/ghe_settings';

const octokit = require('@octokit/rest')({
  headers: {
    accept: 'application/vnd.github.v3+json'
  }
});

// Ignore self-signed cert (dev environment)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

  // Nuke for each webhook workflow.
  this.state = {};
  var postData = restOperation.getBody();
  
  // Is the POST from Github?
  if (typeof postData.head_commit !==  'undefined' && postData.head_commit) {

    // Collect values we need for processing // 
    let ref_array = postData.ref.split('/');
    this.state.branch = ref_array[2]; // Grab the 'branch' from the end of 'ref'.
    this.state.head_commit_id = postData.head_commit.id;
    this.state.owner = postData.repository.owner.name;
    this.state.repo_name = postData.repository.name;
    this.state.repo_fullname = postData.repository.full_name;
    this.state.before = postData.before;

    if (DEBUG === true) { logger.info("[GheListener] Message recevied from Github repo: " +postData.repository.full_name); }

    // Grab the settings from /ghe_settings worker, then.... do this
    this.getConfig()
    .then(() => {

      // Commence parsing the commit message for work to do.
      return this.parseCommitMessage(postData);

    })
    .then((resp) => {

      if (DEBUG === true) { logger.info('[GheListener] - applyServiceDefinition() resp: ' +JSON.stringify(resp, '', '\t')); }
      return this.createGithubIssue(resp);

    })
    .then((resp) => {

      if (DEBUG === true) { logger.info('[GheListener] - createGithubIssue() resp: ' +resp); }
      return;

    })
    .catch((err) => {

      logger.info('[GheListener - DEBUG] - err in master promise chain: ' +JSON.stringify(err));

    });
  
  }

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
        this.config.baseUrl = 'https://'+resp.body.config.ghe_ip_address+'/api/v3';
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

    this.state.actions = [];
    logger.info('\n\nIN parseCommitMessage() commitMessage.commits:' +JSON.stringify(commitMessage.commits));

    // Iterate through 'commits' array to handle added|modified|removed definitions
    commitMessage.commits.map((element, index) => {

      // Handle new/modified service definitions.
      if (element.added.length > 0) {

        element.added.map((serviceAdd) => {
          logger.info('theAdd is: ' +serviceAdd);
          this.getServiceDefinition(serviceAdd)
          .then((service_definition) => {
            return this.applyServiceDefinition(service_definition);
          })
          .then((resp) => {
            logger.info(JSON.stringify(resp));
            this.createGithubIssue(resp);
          })
          .catch((err) => {
            logger.info('parseCommitMessage() -> return this.applyServiceDefinition(body): ' +err);
          });

        });

      }

      // Handle new/modified service definitions.
      if (element.modified.length > 0) {

        element.modified.map((serviceMod) => {
          logger.info('theMod is: ' +serviceMod);
          this.getServiceDefinition(serviceMod)
          .then((service_definition) => {
            return this.applyServiceDefinition(service_definition);
          })
          .then((resp) => {
            logger.info(JSON.stringify(resp));
            this.createGithubIssue(resp);
          })
          .catch((err) => {
            logger.info('parseCommitMessage() -> return this.applyServiceDefinition(body): ' +err);
          });

        });

      }

      // Handle new/modified service definitions.
      if (element.removed.length > 0) {

        element.removed.map((serviceDel) => {
          logger.info('theDel is: ' +serviceDel);
          this.getDeletedServiceDefinition(serviceDel, commitMessage.before) 
          .then((service_definition) => {

            logger.info('this.getDeletedServiceDefinition() returns service_definition: ' +service_definition);
            return this.identifyTenant(service_definition.declaration);

          })
          .then((tenant) => {

            return this.deleteServiceDefinition(tenant);

          })          
          .then((resp) => {
            logger.info(JSON.stringify(resp));
            this.createGithubIssue(resp);
          })
          .catch((err) => {
            logger.info('parseCommitMessage() -> return this.applyServiceDefinition(body): ' +err);
          });

        });

      }


      // Return when all commits processed
      if ((commitMessage.commits.length - 1) === index) {

        resolve(this.state.actions);

      }
      else {

        reject('[GheListener - ERROR] - parseCommitMessage() - nothing to parse');

        
      }

    });

  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} retrieved from GitHub Enterprise
 */
GheListener.prototype.getServiceDefinition = function (object_name) {

  return new Promise((resolve, reject) => {

    octokit.authenticate({
      type: 'oauth',
      token: this.config.ghe_access_token
    });

    octokit.repos.getContent({baseUrl: this.config.baseUrl, owner: this.state.owner, repo: this.state.repo_name, path: object_name})

    .then(result => {
 
      // content will be base64 encoded
      const content = Buffer.from(result.data.content, 'base64').toString();

      var isJson;
      // Lets perform some validation
      try {

        isJson = JSON.parse(content);

        if (typeof isJson.action !== undefined && isJson.action === 'deploy' || isJson.action === 'dry-run') {

          logger.info('[GheListener] - getServiceDefinition(): This is where we deploy/dry-run: ' + JSON.stringify(isJson));    

        }

      } catch (err) {

        logger.info('[GheListener - ERROR] - getServiceDefinition(): Attempting to parse service def error: ' +err);
        
      }

      resolve(isJson);

    })
    .catch(err => {

      logger.info('[GheListener - ERROR] - getServiceDefinition(): ' +JSON.stringify(err));
      reject(err);

    });
  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} retrieved from GitHub Enterprise
 */
GheListener.prototype.getDeletedServiceDefinition = function (object_name, before) {

  return new Promise((resolve, reject) => {

    octokit.authenticate({
      type: 'oauth',
      token: this.config.ghe_access_token
    });

    logger.info('object_name: ' +object_name+ ' before: ' +before);
    octokit.gitdata.getCommit({baseUrl: this.config.baseUrl, owner: this.state.owner, repo: this.state.repo_name, commit_sha: before})
    .then((beforeCommit) => {
      logger.info('beforeCommit: ' +JSON.stringify(beforeCommit, '', '\t'));
      return octokit.gitdata.getTree({baseUrl: this.config.baseUrl, owner: this.state.owner, repo: this.state.repo_name, tree_sha: beforeCommit.data.tree.sha, recursive: 1});
    })
    .then((beforeTree) => {

      return this.identifyDeletedFileInTree(beforeTree, object_name);

    })
    .then((theSha) => {
      logger.info('theSha:' +theSha);

      return octokit.gitdata.getBlob({baseUrl: this.config.baseUrl, owner: this.state.owner, repo: this.state.repo_name, file_sha: theSha});

    })
    .then((result) => {

      logger.info('result: ' +JSON.stringify(result));

      const content = Buffer.from(result.data.content, 'base64').toString();

      var isJson;
      // Lets perform some validation
      try {

        isJson = JSON.parse(content);

        logger.info('[GheListener] - getServiceDeletedDefinition(): This is where we deploy/dry-run: ' + JSON.stringify(isJson));    

      } catch (err) {

        logger.info('[GheListener - ERROR] - getServiceDeletedDefinition(): Attempting to parse service def error: ' +err);
        
      }

      resolve(isJson);

    });

  });

};

GheListener.prototype.identifyDeletedFileInTree = function (beforeTree, object_name) {

  return new Promise((resolve, reject) => {

    logger.info('beforeTree: ' +JSON.stringify(beforeTree, '', '\t'));
    beforeTree.data.tree.map((element) => {
      if (element.path === object_name) {
        logger.info('element: ' +JSON.stringify(element));

        var theSha = element.sha;
        logger.info('theSha: ' +theSha);
        logger.info('the sha is a: ' +typeof theSha);

        resolve(theSha);

      }
    });
  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} retrieved from GitHub Enterprise
 */
GheListener.prototype.applyServiceDefinition = function (body) {

  return new Promise((resolve, reject) => {

    var as3path = '/mgmt/shared/appsvcs/declare'; 
    var uri = this.restHelper.makeRestnodedUri(as3path);
    var restOp = this.createRestOperation(uri, body);
    
    this.restRequestSender.sendPost(restOp)
    .then((resp) => {

      if (DEBUG === true) {
        logger.info('[GheListener - DEBUG] - applyServiceDefinition() - resp.statusCode: ' +JSON.stringify(resp.statusCode));
        logger.info('[GheListener - DEBUG] - applyServiceDefinition() - resp.body: ' +JSON.stringify(resp.body, '', '\t'));
      }

      resolve(resp.statusCode);

    })
    .catch((err) => {

      logger.info('[GheListener - ERROR] - applyServiceDefinition(): ' +err);
      reject(err);


    });

  });

};

// Required for deletions
GheListener.prototype.identifyTenant = function (declaration) {

  return new Promise((resolve, reject) => {
  
    Object.keys(declaration).forEach( function(key) {
      if (DEBUG === true) { logger.info('[GheListener - DEBUG] processing declaration keys. Current key is: ' +key); }

      if (declaration[key].class == 'Tenant' ) {

        if (DEBUG === true) { logger.info('[GheListener - DEBUG] - The \'Tenant\' is: ' +key); }  
        resolve(key);

      }
    });
  });


};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} retrieved from GitHub Enterprise
 */
GheListener.prototype.deleteServiceDefinition = function (tenant) {

  return new Promise((resolve, reject) => {

    var as3path = '/mgmt/shared/appsvcs/declare/'+tenant; 
    var uri = this.restHelper.makeRestnodedUri(as3path);
    var restOp = this.createRestOperation(uri);
    
    this.restRequestSender.sendDelete(restOp)
    .then((resp) => {

      if (DEBUG === true) {
        logger.info('[GheListener - DEBUG] - deleteServiceDefinition() - resp.statusCode: ' +JSON.stringify(resp.statusCode));
        logger.info('[GheListener - DEBUG] - deleteServiceDefinition() - resp.body: ' +JSON.stringify(resp.body, '', '\t'));
      }

      resolve(resp.statusCode);

    })
    .catch((err) => {

      logger.info('[GheListener - ERROR] - deleteServiceDefinition(): ' +err);
      reject(err);

    });

  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Object} retrieved from GitHub Enterprise
 */
GheListener.prototype.createGithubIssue = function (message) {

  return new Promise((resolve, reject) => {

    octokit.authenticate({
      type: 'oauth',
      token: this.config.ghe_access_token
    });

    octokit.issues.create({baseUrl: this.config.baseUrl, owner: this.state.owner, repo: this.state.repo_name, title: 'test', body: 'body test'})
    .then((result) => {

      logger.info('[GheListener] - createGithubIssue() result.status: ' +result.status);
      resolve(result.status);

    })
    .catch((err) => {

      logger.info('[GheListener - ERROR] - createGithubIssue() error: ' +JSON.stringify(err, '', '\t'));
      reject(err);

    });
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