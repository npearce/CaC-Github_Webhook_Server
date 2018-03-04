/*
*   GheListener:
*     GitHub Enterprise webhook message router.
*
*   N. Pearce, February 2018
*   http://github.com/npearce
*
*/

var logger = require('f5-logger').getInstance();
var http = require('http');
var GheFetch = require('./ghe_fetch.js');

var results; //temporary...

function GheListener() {}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;

GheListener.prototype.onStart = function(success, error) {

  logger.info("GitHub Enterprise WebHook Server: onStart()...");
  const GHE_IP_ADDR = process.env.GHE_IP_ADDR;
  const GHE_ACCESS_TOKEN = process.env.GHE_ACCESS_TOKEN;

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

      let addedFile = gheMessage.commits[i].added.toString();
      var addedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+addedFile;
      logger.info("Building path: addedFilePath - " +addedFilePath);

      if (addedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +addedFile);

        // Hand off to GheFetch.getServiceDefinition to fetch Service Data
        GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath);
      }
      else if (addedFile.startsWith("DEVICE")) {
        logger.info("This is a 'DEVICE' definition: " +addedFile);
        //TODO Enable Device level config settings
      }
      else {
        logger.info("Not a DEVICE or SERIVICE definition. Ignoring: " +addedFile);
      }
    }

    // Handle modified device/service definitions.
    if (gheMessage.commits[i].modified.length > 0) {

      let modifiedFile = gheMessage.commits[i].modified.toString();
      var modifiedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+modifiedFile;
      logger.info("Building path: modifiedFilePath - " +modifiedFilePath);

      // Is this a Device Definition, Service Definition, or junk?
      if (modifiedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +modifiedFile);

        // Hand off to GheFetch Service Definition from GitHub enterprise
        GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, modifiedFilePath);
      }
      else if (modifiedFile.startsWith("DEVICE")) {
        logger.info("This is a 'DEVICE' definition: " +modifiedFile);
        //TODO Enable Device level config settings
      }
      else {
        logger.info("Not a DEVICE or SERIVICE definition. Ignoring: " +modifiedFile);
      }
    }

    // Handle deleted device/service definitions.
    if (gheMessage.commits[i].removed.length > 0)  {

      // As the file has been deleted already we must retrieve the service definition from the previous commit - 'gheMessage.before'.
      let previousCommit = gheMessage.before;

      let deletedFile = gheMessage.commits[i].removed.toString();
      var deletedFilePath = "/api/v3/repos/"+gheMessage.repository.full_name+"/contents/"+deletedFile+"?ref="+previousCommit;
      logger.info("Building path: deletedFilePath - " +deletedFilePath+ "\nUsing previousCommit: " +previousCommit);

      if (deletedFile.startsWith("SERVICE")) {
        logger.info("This is a 'SERVICE' definition: " +deletedFile);

        // Hand off to GheFetch Service Definition from GitHub enterprise
        GheFetch.getDeletedServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath);
      }
      else if (deletedFile.startsWith("DEVICE")) {
        logger.info("This is a 'DEVICE' definition: " +deletedFile);

        // Hand off to GheFetch Service Definition from GitHub enterprise
        //TODO Use BIG-IP device-reset worker.
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


//NOTE getJsonFromGitlab moved to ghe_fetch.js
//NOTE deployService will be moved to service_deploy.js

function deployService(serviceName, serviceInputs, cb) {

  //TODO - get this from a GItLab tag.
  var tenant = "myTenant1";
  var servicePath = "/mgmt/cm/cloud/tenants/"+tenant+"/services/iapp/";

  var options = {
    "method": "POST",
    "hostname": "localhost",
    "port": 8100,
    "path": servicePath,
    "headers": {
      "cache-control": "no-cache",
      "content-type": "application/json",
      "authorization": 'Basic YWRtaW46YWRtaW4=' //user1 - dXNlcjE6YWRtaW4=
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      results = body.toString();
      cb(results);
    });

  });

  req.write(serviceInputs);
  req.end();

}

//NOTE modifyService will be moved to service_modify.js

function modifyService(serviceName, serviceInputs, gen, cb) {
  logger.info("modifyService()");
  //TODO - get this from a GItLab tag.
  var tenant = "myTenant1";
  var servicePath = "/mgmt/cm/cloud/tenants/"+tenant+"/services/iapp/"+serviceName;

//  Reconstruct the body with generation.
  jp_body = JSON.parse(serviceInputs);
  jp_body.generation = gen;
  body = JSON.stringify(jp_body);
//  logger.info("modify_service() body: " +body);

  var options = {
    "method": "PUT",
    "hostname": "localhost",
    "port": 8100,
    "path": servicePath,
    "headers": {
      "cache-control": "no-cache",
      "content-type": "application/json",
      "authorization": 'Basic YWRtaW46YWRtaW4=' //user1 - dXNlcjE6YWRtaW4=
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      results = body.toString();
      cb(results);
    });
  });

  req.write(body);
  req.end();
}

//NOTE deleteService will be moved to service_delete.js

function deleteService(serviceName, cb) {

  logger.info("deleteService() - serviceName: " +serviceName);

  //TODO - get this from a GItLab tag.
  var tenant = "myTenant1";
  var servicePath = "/mgmt/cm/cloud/tenants/"+tenant+"/services/iapp/"+serviceName;
//  serviceInputs.generation = serviceInputs.generation++  //TODO how do we fix the generation problem.

  var options = {
    "method": "DELETE",
    "hostname": "localhost",
    "port": 8100,
    "path": servicePath,
    "headers": {
      "cache-control": "no-cache",
      "content-type": "application/json",
      "authorization": 'Basic YWRtaW46YWRtaW4=' //user1 - dXNlcjE6YWRtaW4=
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      results = body.toString();
      cb(results);
    });
  });

  req.end();
}

//NOTE retreiveGeneration will be moved to service_modify.js

function retreiveGeneration(serviceName, cb)  {

  var options = {
    "method": "GET",
    "hostname": "localhost",
    "port": 8100,
    "path": "/mgmt/cm/cloud/tenants/myTenant1/services/iapp/"+serviceName,
    "headers": {
      "cache-control": "no-cache",
      "authorization": 'Basic YWRtaW46YWRtaW4=' //user1 - dXNlcjE6YWRtaW4=
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      logger.info("body: "+body);
      var jp_body = JSON.parse(body);
      logger.info("jp_body.generation: " +jp_body.generation);
      cb(jp_body.generation);
    });
  });

  req.end();
}


//NOTE getClouds will become device_deploy.js

function getClouds(cb)  {
  //get a list of iWorkflow Cloud names, descriptions, and UUIDs

  var options = {
    "method": "GET",
    "hostname": "localhost",
    "port": 8100,
    "path": "/mgmt/cm/cloud/tenants/myTenant1/connectors",
    "headers": {
      "authorization": 'Basic YWRtaW46YWRtaW4=', //user1 - dXNlcjE6YWRtaW4=
      "cache-control": "no-cache",
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);

      var clouds = [];
      logger.info("in getClouds(): "+body);

      jp_body = JSON.parse(body);
      for (var i in jp_body.items)  {
//        var cloud = "\"cloud " +[i]+ "\": \""+jp_body.items[i].name+" - "+jp_body.items[i].connectorId+" - "+jp_body.items[i].description+"\"";
        var cloud = jp_body.items[i].name+" - "+jp_body.items[i].connectorId+" - "+jp_body.items[i].description;
        clouds.push(cloud);
      }
      var str_join_clouds = clouds.join('\n');
      cb(str_join_clouds);

    });
  });

  req.end();
}

//NOTE postClouds will become device_deploy.js

function postClouds(data, results)  {
  //post the cloud names, descriptions, and UUIDs to GitLabs
  //This is the ops_user token t551erWyKZUvahvfnyQ3
  var options = {
    "method": "POST",
    "hostname": GITLAB_IP,
    "port": GITLAB_HTTP_PORT,
    "path": "/api/v4/projects/1/repository/commits",
    "headers": {
      "content-type": "application/json",
//      "authorization": "Basic b3BzX3VzZXI6ZTRkOGJhM2M=",
      "PRIVATE-TOKEN": "t551erWyKZUvahvfnyQ3"
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      results(body);
    });
  });

  logger.info("this is what I'm meant to post (data):" +data);

  req.write(data);

  req.end();
}


/**
 * handle /example HTTP request
 */
GheListener.prototype.getExampleState = function () {
  return {
    "supports":"none"
  };
};

module.exports = GheListener;
