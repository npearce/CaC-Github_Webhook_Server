/*
*   GheListener:
*     GitHub Enterprise webhook message router.
*
*   N. Pearce, February 2018
*   http://github.com/npearce
*
*/
"use strict";

var logger = require('f5-logger').getInstance();
var http = require('http');
var ServiceAction = require('./as3_service_action.js');

function GheListener() {}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;

GheListener.prototype.onStart = function(success, error) {

  logger.info("GitHub Enterprise WebHook Server Listener: onStart()...");

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

  var gheMessage = restOperation.getBody();
  logger.info("Activity from repository: " +gheMessage.repository.name);

  // Iterate through commit messages to handle added|modified|removed definitions
  for (var i in gheMessage.commits) {

    // Handle new device/service definitions.
    if (gheMessage.commits[i].added.length > 0) {

      var addedFile = gheMessage.commits[i].added.toString();
      var addedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+addedFile;

      if (addedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +addedFile);  
        ServiceAction.deploy(GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath);
      }
    }

    // Handle modified device/service definitions.
    if (gheMessage.commits[i].modified.length > 0) {

      var modifiedFile = gheMessage.commits[i].modified.toString();
      var modifiedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+modifiedFile;

      if (modifiedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +modifiedFile);
        ServiceAction.modify(GHE_IP_ADDR, GHE_ACCESS_TOKEN, modifiedFilePath);
      }
    }

    // Handle deleted device/service definitions.
    if (gheMessage.commits[i].removed.length > 0)  {

      // The definition has been deleted, so we must retrieve it from the previous commit - 'gheMessage.before'.
      var previousCommit = gheMessage.before;

      var deletedFile = gheMessage.commits[i].removed.toString();
      var deletedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+deletedFile+"?ref="+previousCommit;

      if (deletedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +deletedFile);

        // Hand off to GheFetch Service Definition from GitHub enterprise
        ServiceAction.delete(GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath);
      }
    }
  }

// Respond to GHE WebHook Client
  restOperation.setBody("Thanks, GitHub Enterprise!");
  restOperation.setStatusCode('200');
  restOperation.setContentType('text');
  this.completeRestOperation(restOperation);
};

/**
 * handle onPost HTTP request
 */
GheListener.prototype.onPut = function(restOperation) {

  var newState = restOperation.getBody();
  this.state.GHE_IP_ADDR = newState.ghe_ip_address;
  this.state.GHE_ACCESS_TOKEN = newState.ghe_access_token;
  this.state = newState;
  
//  var GHE_IP_ADDR = '172.31.1.200';
//  var GHE_ACCESS_TOKEN = '83037830f391bf6ac26482332b92ae36e2da4457';

  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * handle /example HTTP request
 */
GheListener.prototype.getExampleState = function () {
  return {
    "ghe_ip_address":"x.x.x.x",
    "ghe_access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
};

module.exports = GheListener;
