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
const Queue = require('promise-queue');
var maxConcurrent = 1;
const gheSettingsPath = '/shared/webhook/github-settings';
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

GheListener.prototype.WORKER_URI_PATH = "shared/webhook/github-listener";
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

    // Collect values we need for processing
    let ref_array = postData.ref.split('/');
    this.state.branch = ref_array[2]; // Grab the 'branch' from the end of 'ref' string
    this.state.head_commit_id = postData.head_commit.id; // The sha for this commit, for which we received the commit webhook message
    this.state.head_commit_url = postData.head_commit.url; // Link directly to the commit data
    this.state.owner = postData.repository.owner.name; //repository owner
    this.state.repo_name = postData.repository.name; // repository name
    this.state.repo_fullname = postData.repository.full_name; // owner+responsitory name
    this.state.before = postData.before; // The sha of the 'previous' commit. Required for processing deletions.

    if (DEBUG === true) { logger.info("[GheListener - DEBUG] Message recevied from Github repo: " +postData.repository.full_name); }

    // Grab the settings from the persisted state /ghe_settings worker
    this.getConfig()
    .then((config) => {

      if (DEBUG === true) { logger.info("[GheListener - DEBUG] this.getConfig() => returns: " +JSON.stringify(config, '', '\t')); }

      // Commence parsing the commit message for work to do.
      return this.parseCommitMessage(postData);

    })
    .then((actions) => {

      if (DEBUG === true) { logger.info('[GheListener] - the following additions/modifications/deletions were performed: ' +JSON.stringify(actions, '', '\t')); }
      return;

    })
    .catch((err) => {

      logger.info('[GheListener - ERROR] - error in master promise chain: ' +JSON.stringify(err));

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

        if (typeof resp.body.config.max_queue_length !== 'undefined' && resp.body.config.max_queue_length !== this.config.max_queue_length) {
          this.config.max_queue_length = resp.body.config.max_queue_length;
        }
        else {
          this.config.max_queue_length = 10; //Default max queue length
        }

        this.config = resp.body.config;
        resolve(this.config);

      }
      else {

        reject('[GheListener - ERROR] getConfig() -  No settings found. Check /ghe_settings');

      }

    })
    .catch ((err) => {
      
      let errorStatusCode = err.getResponseOperation().getStatusCode();
      let errorBody = JSON.stringify(err.getResponseOperation().getBody(), '', '\t');

      logger.info('[GheListener] - getConfig() - Error retrieving settings: ' +errorStatusCode+ ' - ' +errorBody);

    });

  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @param {Object} commitMessage receved from GitHub Webhook
 * 
 * @returns {Object} array of addition/modification/deletion actions
 */
GheListener.prototype.parseCommitMessage = function (commitMessage) {

  var queue = new Queue(maxConcurrent, this.config.max_queue_length);

  return new Promise((resolve, reject) => {

    this.state.actions = [];
    if (DEBUG === true) { logger.info('[GheListener - DEBUG] In parseCommitMessage() with commitMessage.commits:' +JSON.stringify(commitMessage.commits)); }

    // Iterate through 'commits' array to handle added|modified|removed definitions
    commitMessage.commits.map((element, index) => {

      // Handle new service definitions.
      if (element.added.length > 0) {

        // Iterate through the 'added' array of the Commit Message
        element.added.map((serviceAdd) => {

          let action = { "Added": serviceAdd };
          this.state.actions.push(action);

          // For each addition, fetch the service definition from the repo, and pass to this.applyServiceDefinition()
          if (DEBUG === true) { logger.info('[GheListener - DEBUG] Found an addition to the repo - serviceAdd: ' +serviceAdd); }
          return this.getServiceDefinition(serviceAdd)

          .then((service_definition) => {

            // Using queuing for asynchronous communication with AS3
            return queue.add(() => {

              // Deploy the new service to the BIG-IP
              return this.applyServiceDefinition(service_definition);

            });

          })
          .then((resp) => {

            if (DEBUG === true) { logger.info('[GheListener - DEBUG] this.applyServiceDefinition() - resp: ' +JSON.stringify(resp)); }

            if (DEBUG === true) { 
              logger.info('queue.getQueueLength(): ' +queue.getQueueLength());
              logger.info('queue.getPendingLength(): ' +queue.getQueueLength());
            }

            // Post the results back into the source repo as a GitHub Issue
            this.createGithubIssue(serviceAdd, "Added", resp);

          })
          .catch((err) => {

            logger.info('[GheListener - ERROR] parseCommitMessage() -> return this.applyServiceDefinition(body): ' +err);

            // Post the error back into the source repo as a GitHub Issue
            this.createGithubIssue(serviceAdd, "ERROR", err);

          });
      
        });        
 
      }

      // Handle modified service definitions.
      if (element.modified.length > 0) {
        
        // Iterate through the 'modified' array of the Commit Message
        element.modified.map((serviceMod) => {

          let action = { "Modified": serviceMod };
          this.state.actions.push(action);

          // For each modification, fetch the service definition from the repo, and pass to this.applyServiceDefinition()
          if (DEBUG === true) { logger.info('[GheListener - DEBUG] Found a modification to the repo - serviceMod: ' +serviceMod); }
          this.getServiceDefinition(serviceMod)

          .then((service_definition) => {

            // Using queuing for asynchronous communication with AS3
            return queue.add(() => {
    
              // Deploy the new service to the BIG-IP
              return this.applyServiceDefinition(service_definition);

            });

          })
          .then((resp) => {

            if (DEBUG === true) { logger.info('[GheListener - DEBUG] this.applyServiceDefinition() - resp: ' +JSON.stringify(resp)); }

            if (DEBUG === true) { 
              logger.info('queue.getQueueLength(): ' +queue.getQueueLength());
              logger.info('queue.getPendingLength(): ' +queue.getQueueLength());
            }

            // Post the results back into the source repo as a GitHub Issue
            this.createGithubIssue(serviceMod, "Modified", resp);

          })
          .catch((err) => {

            logger.info('[GheListener - ERROR] parseCommitMessage() -> return this.applyServiceDefinition(body): ' +err);

            // Post the error back into the source repo as a GitHub Issue
            this.createGithubIssue(serviceMod, "ERROR", err);

          });

        });

      }

      // Handle removed service definitions.
      if (element.removed.length > 0) {

        // Iterate through the 'removed' array of the Commit Message
        element.removed.map((serviceDel) => {

          let action = { "Deleted": serviceDel };
          this.state.actions.push(action);

          // For each deletion, fetch the service definition from the repo, so we can identify the Tenant          
          if (DEBUG === true) { logger.info('[GheListener - DEBUG] Found a deletion to the repo - serviceDel: ' +serviceDel); }
          logger.info('theDel is: ' +serviceDel);
          
          return this.getDeletedServiceDefinition(serviceDel, commitMessage.before)

          .then((service_definition) => {

            // Use the service definition to identify the tenant, required for the deletion URI
            return this.identifyTenant(service_definition.declaration);

          })
          .then((tenant) => {

            // Using queuing for asynchronous communication with AS3
            return queue.add(() => {

              // Pass the Tenant name to deleteServiceDefinition() for deletion
              if (DEBUG === true) { logger.info('[GheListener - DEBUG] this.identifyTenant() found: ' +tenant); }
              return this.deleteServiceDefinition(tenant);

            });

          })          
          .then((resp) => {

            if (DEBUG === true) { logger.info('[GheListener - DEBUG] this.deleteServiceDefinition() - resp: ' +JSON.stringify(resp)); }

            if (DEBUG === true) { 
              logger.info('queue.getQueueLength(): ' +queue.getQueueLength());
              logger.info('queue.getPendingLength(): ' +queue.getQueueLength());
            }

            // Post the results back into the source repo as a GitHub Issue
            this.createGithubIssue(serviceDel, "Deleted", resp);

          })
          .catch((err) => {

            logger.info('[GheListener - ERROR] parseCommitMessage() -> return this.deleteServiceDefinition(body): ' +err);

            // Post the error back into the source repo as a GitHub Issue
            this.createGithubIssue(serviceDel, "ERROR", err);

          });

        });

      }
  
      // Return when all commits processed
      if ((element.added.length+element.modified.length+element.removed.length - 1) === index) {

        resolve(this.state.actions);

      }

    });

  });

};

/**
 * Retrieve the added/modified/deleted object from GitHub and verify it is a service defintion
 * 
 * @param {String} object_name of the add/mod/del to the source repository
 * 
 * @returns {Object} the service defition retrieved from GitHub
 */
GheListener.prototype.getServiceDefinition = function (object_name) {

  return new Promise((resolve, reject) => {

    octokit.authenticate({
      type: 'oauth',
      token: this.config.ghe_access_token
    });

    octokit.repos.getContent({baseUrl: this.config.ghe_base_url, owner: this.state.owner, repo: this.state.repo_name, path: object_name, ref: this.state.branch})

    .then(result => {
 
      // content will be base64 encoded
      const content = Buffer.from(result.data.content, 'base64').toString();

      if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getServiceDefinition(): Got something back from GitHub repo: ' +content); }
      
      var service_def;

      // Perform some validation: is it JSON, does it have BIG-IP service defition 'actions'
      try {

        service_def = JSON.parse(content);

        if (typeof service_def.class !== undefined && service_def.class === 'AS3' && typeof service_def.declaration.class !== undefined && service_def.declaration.class === 'ADC' && typeof service_def.action !== undefined && service_def.action === 'deploy' || service_def.action === 'dry-run') {
          
          if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getServiceDefinition(): We have a BIG-IP Service Defintion: ' +JSON.stringify(service_def)); }

          resolve(service_def);

        }
        else {

          let error = '\''+ object_name +'\' is not an AS3 declaration. Skipping.....';
          if (DEBUG === true) { logger.info('[GheListener - DEBUG] ' +error); }
          reject(error);

        }

      } catch (err) {

        let error = '[GheListener - ERROR] - getServiceDefinition(): Attempting to parse service def error: ' +err;
        logger.info(error);
        reject(error);
        
      }


    })
    .catch(err => {

      logger.info('[GheListener - ERROR] - getServiceDefinition(): ' +JSON.stringify(err));

    });
  });

};

/**
 * Retreive the service definition from the previous commit, before it was deleted
 * 
 * @param {Object} object_name retrieved from GitHub Webhook commit message
 * @param {String} before is the previous commit, where we get the service defition that has since been deleted
 * 
 * @returns {Object} the deleted service definition (from beyond the grave).
 */
GheListener.prototype.getDeletedServiceDefinition = function (object_name, before) {

  return new Promise((resolve, reject) => {

    octokit.authenticate({
      type: 'oauth',
      token: this.config.ghe_access_token
    });

    if (DEBUG === true) { logger.info('[GheListener - DEBUG] getDeletedServiceDefinition() - the object name: ' +object_name+ ' and the previous commit sha: ' +before); }

    octokit.gitdata.getCommit({baseUrl: this.config.ghe_base_url, owner: this.state.owner, repo: this.state.repo_name, commit_sha: before})
    .then((previousCommit) => {

      // From the previous commit, retireve the repo tree 
      if (DEBUG === true) { logger.info('[GheListener - DEBUG] getDeletedServiceDefinition() - the pre-deletion commit: ' +JSON.stringify(previousCommit, '', '\t')); }
      return octokit.gitdata.getTree({baseUrl: this.config.ghe_base_url, owner: this.state.owner, repo: this.state.repo_name, tree_sha: previousCommit.data.tree.sha, recursive: 1});

    })
    .then((beforeTree) => {

      // From the repo tree, of the previous commit, identify the desired service defition object and return the objects sha
      return this.identifyDeletedFileInTree(beforeTree, object_name);

    })
    .then((theSha) => {
      logger.info('theSha:' +theSha);

      // Grab the service definition (from beyond the grave) 
      return octokit.gitdata.getBlob({baseUrl: this.config.ghe_base_url, owner: this.state.owner, repo: this.state.repo_name, file_sha: theSha});

    })
    .then((result) => {

      if (DEBUG === true) { logger.info('[GheListener - DEBUG] getDeletedServiceDefinition() - the deleted service definition: ' +JSON.stringify(result, '', '\t')); }

      // The content will be bas64 encoded
      const content = Buffer.from(result.data.content, 'base64').toString();
      var service_def;
      // Lets perform some validation
      try {

        service_def = JSON.parse(content);
        
        // Check it resembles a BIG-IP Service Definition
        if (typeof service_def.class !== undefined && service_def.class === 'AS3' && typeof service_def.declaration.class !== undefined && service_def.declaration.class === 'ADC') {

          resolve(service_def);

        }
        else {

          let error = '\''+ object_name +'\' is not an AS3 declaration. Skipping.....';
          if (DEBUG === true) { logger.info('[GheListener - DEBUG] ' +error); }
          reject(error);
          
        }

      } catch (err) {

        let error = '[GheListener - ERROR] - getServiceDeletedDefinition(): Attempting to parse service def: ' +err;
        logger.info(error);
        reject(error);
        
      }

    })
    .catch(err => {

      logger.info('[GheListener - ERROR] - getServiceDeletedDefinition(): ' +JSON.stringify(err));

    });

  });

};

/**
 * Identify the deleted service definition in the previous commit and grab its sha value for object GitHub Blob retrieval
 * 
 * @param {Object} previousTree the object list from the repo's previous state, before the deletion
 * @param {String} object_name the deleted object we are searching for in the previous commit tree
 * 
 * @returns {String} the sha of the deleted service definition (from beyond the grave).
 */
GheListener.prototype.identifyDeletedFileInTree = function (previousTree, object_name) {

  return new Promise((resolve, reject) => {

    var theSha;
    // Iterate through the object tree of the previous commit
    previousTree.data.tree.map((element, index) => {
      if (element.path === object_name) {

        theSha = element.sha;
        if (DEBUG === true) { logger.info('[GheListenenr - DEBUG] identifyDeletedFileInTree() - tree element: ' +JSON.stringify(element)+ 'theSha: ' +theSha); }

        // Return the deleted objects sha
        resolve(theSha);

      }
      else if ((previousTree.data.tree.length -1) === index && typeof theSha === 'undefined') {

        // We didn't find the object in the previous commit
        reject('object not found');

      }
    });
  });

};

/**
 * Apply the new, or modified, service definition to the BIG-IP
 * @param {Object} service_def retireved from GitHub repo
 * 
 * @returns {Object} AS3's declaration processing results
 */
GheListener.prototype.applyServiceDefinition = function (service_def) {

  return new Promise((resolve, reject) => {

    if (DEBUG === true) { logger.info('[GheListenenr - DEBUG] applyServiceDefinition(): branch is: ' +this.state.branch+ ' and action is: ' +service_def.action); }

    if (this.state.branch !== 'master') {

      if (DEBUG === true) { logger.info('[GheListenenr - DEBUG] applyServiceDefinition(): branch is not \'master\'. Changing action to: \'dry-run\''); }
      service_def.action = 'dry-run';

    }

    // Build the declaration POST message
    var as3path = '/mgmt/shared/appsvcs/declare'; 
    var uri = this.restHelper.makeRestnodedUri(as3path);
    var restOp = this.createRestOperation(uri, service_def);
    
    // Send the declaration POST message to the BIG-IP
    this.restRequestSender.sendPost(restOp)
    .then((resp) => {

      if (DEBUG === true) {
        logger.info('[GheListener - DEBUG] - applyServiceDefinition() - resp.statusCode: ' +JSON.stringify(resp.statusCode));
        logger.info('[GheListener - DEBUG] - applyServiceDefinition() - resp.body: ' +JSON.stringify(resp.body, '', '\t'));
      }
      resolve(resp.body);

    })
    .catch((err) => {

      let errorStatusCode = err.getResponseOperation().getStatusCode();
      let errorBody = JSON.stringify(err.getResponseOperation().getBody(), '', '\t');

      logger.info('[GheListener - ERROR] - applyServiceDefinition(): ' +errorStatusCode+ ' - ' +errorBody);

    });

  });

};

/**
 * Identify the Tenant in the deleted service definition. Required for deletion URI
 * 
 * @param {Object} delcaration retireved from deleted file in GitHub repo
 * 
 * @returns {String} the tenant name 
 */
GheListener.prototype.identifyTenant = function (declaration) {

  return new Promise((resolve, reject) => {
  
    var tenant;
    Object.keys(declaration).map((key, index) => {
      if (DEBUG === true) { logger.info('[GheListener - DEBUG] processing declaration keys. Current key is: ' +key); }

      if (declaration[key].class == 'Tenant' ) {

        tenant = key; 
        if (DEBUG === true) { logger.info('[GheListener - DEBUG] - The \'Tenant\' is: ' +key); }  
        resolve(tenant);

      }
      else if ((Object.keys(declaration).length -1) === index && typeof tenant === 'undefined') {

        reject('[GheListener - ERROR] identifyTenant() - no tenant found');

      }

    });

  });

};

/**
 * Build the service definition deletion message and send to the BIG-IP
 * 
 * @param {String} tenant for which we are deleting
 * 
 * @returns {Object} results of the deletion action
 */
GheListener.prototype.deleteServiceDefinition = function (tenant) {

  return new Promise((resolve, reject) => {

    // Build the deletion message
    var as3path = '/mgmt/shared/appsvcs/declare/'+tenant; 
    var uri = this.restHelper.makeRestnodedUri(as3path);
    var restOp = this.createRestOperation(uri);

    // Send the deletion message to the BIG-IP
    this.restRequestSender.sendDelete(restOp)
    .then((resp) => {

      if (DEBUG === true) {
        logger.info('[GheListener - DEBUG] - deleteServiceDefinition() - resp.statusCode: ' +JSON.stringify(resp.statusCode));
        logger.info('[GheListener - DEBUG] - deleteServiceDefinition() - resp.body: ' +JSON.stringify(resp.body, '', '\t'));
      }

      resolve(resp.body);

    })
    .catch((err) => {

      let errorStatusCode = err.getResponseOperation().getStatusCode();
      let errorBody = JSON.stringify(err.getResponseOperation().getBody(), '', '\t');

      logger.info('[GheListener - ERROR] - deleteServiceDefinition(): ' +errorStatusCode+ ' - ' +errorBody);

    });

  });

};

/**
 * Create a GitHub Issue in the source repo with the success/fail results
 * 
 * @param {String} filename that was added/modified/deleted to trigger this workflow
 * @param {Sting} action that was performed: added/modified/deleted a service definition
 * @param {Object} results from the added/modified/deleted action on the BIG-IP
 * 
 * @returns {String} HTTP Status code from creating the GitHub Issue
 */
GheListener.prototype.createGithubIssue = function (file_name, action, results) {

  return new Promise((resolve, reject) => {

    var title = '';
    var labels = [];

    octokit.authenticate({
      type: 'oauth',
      token: this.config.ghe_access_token
    });

    if (results.dryRun === true) {

      title = 'Dry-Run: '+action+' \"' +file_name+ '\"';
      labels = ['Dry-Run', action];

    }
    else {

      title = action+' \"' +file_name+ '\"';
      labels = [action];

    }

    let body = JSON.stringify(results.results, '', '\t')+ '\n\nThe Commit: ' +this.state.head_commit_url;

    octokit.issues.create({baseUrl: this.config.ghe_base_url, owner: this.state.owner, repo: this.state.repo_name, title: title, labels: labels, body: body})
    .then((result) => {

      logger.info('[GheListener] - createGithubIssue() result.status: ' +result.status);
      resolve(result.status);

    })
    .catch((err) => {

      logger.info('[GheListener - ERROR] - createGithubIssue() error: ' +JSON.stringify(err, '', '\t'));

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

module.exports = GheListener;