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

var GHE_IP_ADDR = '172.31.1.200';
var GHE_ACCESS_TOKEN = '83037830f391bf6ac26482332b92ae36e2da4457';

//var results; //temporary...

function GheListener() {}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;

GheListener.prototype.onStart = function(success, error) {

  logger.info("GitHub Enterprise WebHook Server: onStart()...");
//  const GHE_IP_ADDR = process.env.GHE_IP_ADDR;
//  const GHE_ACCESS_TOKEN = process.env.GHE_ACCESS_TOKEN;

  if (GHE_IP_ADDR && GHE_ACCESS_TOKEN) {
    success();
  }
  else {
    error('GHE Webhook Server requires IP Address, and Access Token.');
  }

};

/**
 * handle onGet HTTP request
 */
GheListener.prototype.onGet = function(restOperation) {

//TODO Show config (Device ID, GHE IP Address, GHE Token, etc.)
  restOperation.setBody(JSON.stringify( { value: "GheListener: " +GheListener.prototype.WORKER_URI_PATH+ ": Hello World!" } ));
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
      else {
        logger.info("Not a DEVICE or SERIVICE definition. Ignoring: " +addedFile);
      }
    }

    // Handle modified device/service definitions.
    if (gheMessage.commits[i].modified.length > 0) {

      var modifiedFile = gheMessage.commits[i].modified.toString();
      var modifiedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+modifiedFile;
      logger.info('modifiedFilePath: '+modifiedFilePath);

      if (modifiedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +modifiedFile);

        // Hand off to GheFetch Service Definition from GitHub enterprise
        ServiceAction.modify(GHE_IP_ADDR, GHE_ACCESS_TOKEN, modifiedFilePath);
      }
      else {
        logger.info("Not a DEVICE or SERIVICE definition. Ignoring: " +modifiedFile);
      }
    }

    // Handle deleted device/service definitions.
    if (gheMessage.commits[i].removed.length > 0)  {

      // As the file has been deleted already we must retrieve the service definition from the previous commit - 'gheMessage.before'.
      var previousCommit = gheMessage.before;

      var deletedFile = gheMessage.commits[i].removed.toString();
      var deletedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+deletedFile+"?ref="+previousCommit;
      logger.info("Building path: deletedFilePath - " +deletedFilePath+ "\nUsing previousCommit: " +previousCommit);

      if (deletedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +deletedFile);

        // Hand off to GheFetch Service Definition from GitHub enterprise
        ServiceAction.delete(GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath);
      }
      else {
        logger.info("Not a DEVICE or SERIVICE definition. Ignoring: " +deletedFile);
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
 * handle /example HTTP request
 */
GheListener.prototype.getExampleState = function () {
  return {
    "supports":"none"
  };
};

module.exports = GheListener;
