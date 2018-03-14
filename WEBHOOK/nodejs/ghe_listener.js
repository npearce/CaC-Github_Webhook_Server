/*
*   GheListener:
*     GitHub Enterprise webhook message router.
*
*   N. Pearce, February 2018
*   http://github.com/npearce
*
*/
"use strict";

const logger = require('f5-logger').getInstance();
const http = require('http');
const ServiceAction = require('./as3_service_action.js');

//  const GHE_IP_ADDR = '172.31.1.200';
//  const GHE_ACCESS_TOKEN = '83037830f391bf6ac26482332b92ae36e2da4457';

function GheListener() {
  this.state = {};
}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;
GheListener.prototype.isPersisted = true;
GheListener.prototype.isSingleton = true;

var GHE_IP_ADDR = "";
var GHE_ACCESS_TOKEN = ""; 

/**
 * handle onStart
 */
GheListener.prototype.onStart = function(success, error) {

  logger.info("[GheListener] GitHub Enterprise WebHook Server Listener: onStart()...");

  var that = this;  
  this.loadState(null, function (err, state) {
    if (err) {
      error('Error loading state: ' +err);
    }
    else {
      logger.info("[GheListener] The state is: " +JSON.stringify(state));
      if (state.config) {
        that.state = state;
        success('[GheListener] State loaded...');
      }
    }
  });
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

  //TODO: Move these into GheFetch - call them via 'GreetngWorker.js' model.
  var GHE_IP_ADDR = this.state.config.ghe_ip_address;
  var GHE_ACCESS_TOKEN = this.state.config.ghe_access_token; 

  if (!GHE_IP_ADDR || !GHE_ACCESS_TOKEN) {
    console.log('[GheListener] Requires GHE_IP_ADDR & !GHE_ACCESS_TOKEN to function.');
    restOperation.setBody('Requires GHE_IP_ADDR & !GHE_ACCESS_TOKEN to function.');
    this.completeRestOperation(restOperation);
  }
  else {
    var gheMessage = restOperation.getBody();
    logger.info("[GheListener] Activity from repository: " + gheMessage.repository.name);

    // Iterate through commit messages to handle added|modified|removed definitions
    for (var i in gheMessage.commits) {

      // Handle new device/service definitions.
      if (gheMessage.commits[i].added.length > 0) {

        var addedFile = gheMessage.commits[i].added.toString();
        var addedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + addedFile;

        if (addedFile.startsWith("SERVICE")) {
          ServiceAction.deploy(GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath);
        }
      }

      // Handle modified device/service definitions.
      if (gheMessage.commits[i].modified.length > 0) {

        var modifiedFile = gheMessage.commits[i].modified.toString();
        var modifiedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + modifiedFile;

        if (modifiedFile.startsWith("SERVICE")) {
          ServiceAction.modify(GHE_IP_ADDR, GHE_ACCESS_TOKEN, modifiedFilePath);
        }
      }

      // Handle deleted device/service definitions.
      if (gheMessage.commits[i].removed.length > 0) {

        // The definition has been deleted, so we must retrieve it from the previous commit - 'gheMessage.before'.
        var previousCommit = gheMessage.before;
        var deletedFile = gheMessage.commits[i].removed.toString();
        var deletedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deletedFile + "?ref=" + previousCommit;

        if (deletedFile.startsWith("SERVICE")) {
          ServiceAction.delete(GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath);
        }
      }
    }

    // Respond to GHE WebHook Client
    restOperation.setBody("[GheListener] Thanks, GitHub Enterprise!");
    restOperation.setStatusCode('200');
    restOperation.setContentType('text');
    this.completeRestOperation(restOperation);
  }
};

/**
 * handle onPost HTTP request
 */
GheListener.prototype.onPut = function(restOperation) {

  var newState = restOperation.getBody();
  this.state = newState;

  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * handle /example HTTP request
 */
GheListener.prototype.getExampleState = function () {
  return {
    "ghe_ip_address":"[ip_address]",
    "ghe_access_token": "[GitHub Access Token]"
  };
};

module.exports = GheListener;
