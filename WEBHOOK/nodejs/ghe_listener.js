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

  logger.info("[GheListener] GitHub Enterprise WebHook Server Listener: onStart()...");

  var that = this;  
  this.loadState(null, function (err, state) {
    if (err) {
      error('[GheListener] Error loading state: ' +err);
    }
    else {
      logger.info("[GheListener] The state is: " +JSON.stringify(state));
      that.state = state;
      success('[GheListener] State loaded...');
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

  var config = this.state.config;

  if (!config.ghe_ip_address || !config.ghe_access_token) {
    console.log('[GheListener] Requires \'ghe_ip_address\' & \'ghe_access_token\' to function.');
    restOperation.setBody('Requires GHE_IP_ADDR & !GHE_ACCESS_TOKEN to function.');
    this.completeRestOperation(restOperation);
  }
  else {

    var gheMessage = restOperation.getBody();
    logger.info("[GheListener] Activity from repository: " + gheMessage.repository.name);

    // Iterate through commit messages to handle added|modified|removed definitions
    for (var i in gheMessage.commits) {

      // Handle new service definitions.
      if (gheMessage.commits[i].added.length > 0) {
        var addedFile = gheMessage.commits[i].added.toString();
        ServiceAction.deploy(config, addedFile, gheMessage);
      }

      // Handle modified device/service definitions.
      if (gheMessage.commits[i].modified.length > 0) {
        var modifiedFile = gheMessage.commits[i].modified.toString();
        ServiceAction.modify(config, modifiedFile, gheMessage);
      }

      // Handle deleted device/service definitions.
      if (gheMessage.commits[i].removed.length > 0) {
        var deletedFile = gheMessage.commits[i].removed.toString();
        ServiceAction.delete(config, deletedFile, gheMessage);
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
    "config": {
      "ghe_ip_address":"[ip_address]",
      "ghe_access_token": "[GitHub Access Token]"  ,
      "debug": "[true|false]"
    }
  };
};

module.exports = GheListener;
