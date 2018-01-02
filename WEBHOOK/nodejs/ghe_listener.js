var logger = require('f5-logger').getInstance();
var http = require('http');
var GheFetch = require('/var/config/rest/iapps/WEBHOOK/nodejs/ghe_fetch.js');
//var ghe_deploy = require('ghe_deploy');
//var ghe_modify = require('ghe_moify');
//var ghe_delete = require('ghe_delete');
var GHE_ACCESS_TOKEN = "a8d06939012d06a8c51633aae584b66655ee2c7a";


var results; //temporary...

// TODO Make this a persisted state configured via POST.
GHE_IP_ADDR = "54.176.177.181";   // AWS Lab IP

/**
 * A simple iControlLX extension that handles only HTTP GET
 */
function GheListener() {}

GheListener.prototype.WORKER_URI_PATH = "shared/iac/ghe_listener";
GheListener.prototype.isPublic = true;

GheListener.prototype.onStart = function(success, error) {

  logger.info("GitHub Enterprise WebHook Server: onStart()...");

// Fetch data from GitHub enterprise
  GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, '/raw/iacorg/iac_bigip/master/README.md', function (fetched) {
    logger.info("GheListener Fetched README.md: " +fetched);
  });

  success();

};


/**
 * handle onGet HTTP request
 */
GheListener.prototype.onGet = function(restOperation) {
  restOperation.setBody(JSON.stringify( { value: "GheListener: " +GheListener.prototype.WORKER_URI_PATH+ ": Hello World!" } ));
  this.completeRestOperation(restOperation);
};

/**
 * handle onPost HTTP request
 */
GheListener.prototype.onPost = function(restOperation) {

  var gheMessage = restOperation.getBody();

// Is it YAML or JSON?
// TODO implement 'try { JSON.parse }' else check if YAML...

  logger.info("Received: "+JSON.stringify(gheMessage, ' ', '\t')+ "\n\n");

  var gheCommitAdded = [];
  var gheCommitModified = [];
  var gheCommitDeleted = [];

  // Check we have a webhook added|modified|removed message
  for (var i in gheMessage.commits) {

// Build an array of the GHE 'added' commits
    if ((gheMessage.commits[i].added.length > 0) && (gheMessage.commits[i].added[0].startsWith("deploy"))) {

      gheCommitAdded.push(gheMessage.commits[i].added);

// TODO Validate (from GitLabs) with GHE. Are we constructing the right path?
//      var pathToAddedJson = "/"+newState.project.path_with_namespace+"/raw/"+newState.project.default_branch+"/"+newState.commits[i].added;
      logger.info("gheCommitAdded[]: " +gheCommitAdded);
    }

// Build an array of the GHE 'modified' commits
    if ((gheMessage.commits[i].modified.length > 0) && (gheMessage.commits[i].modified[0].startsWith("deploy"))) {

      gheCommitModified.push(gheMessage.commits[i].modified);

//TODO Must capture the deployed service end-point for the PUT
// TODO Validate (from GitLabs) with GHE. Are we constructing the right path?
//      var pathToModifiedJson = "/"+newState.project.path_with_namespace+"/raw/"+newState.project.default_branch+"/"+newState.commits[i].modified;
  //    logger.info("Modified pathToModifiedJson: " +pathToModifiedJson);

      logger.info("gheCommitModified[]: " +gheCommitModified);
    }

// Build an array of the GHE 'removed' commits
    if ((gheMessage.commits[i].removed.length > 0)  && (gheMessage.commits[i].removed[0].startsWith("deploy")))  {

// TODO could this just be if (gheMessage.commits[i].removed) {...  ?
      gheCommitDeleted.push(gheMessage.commits[i].removed);

// TODO Validate (from GitLabs) with GHE. Are we constructing the right path?
//      var pathToRemovedJson = "/"+newState.project.path_with_namespace+"/raw/"+newState.project.default_branch+"/"+newState.commits[i].removed;
//      logger.info("Deleting: " +pathToRemovedJson);
//      var parts = newState.commits[i].removed[0].split('.');
//      var serviceName = parts[0];

    logger.info("gheCommitDeleted[]: " +gheCommitDeleted);
    }
  }

  // for added/modified, iterate through array using 'ghe_fetch.js' to get the paylaods.



// Respond to GHE WebHook Client
  restOperation.setBody("Thanks!");
  restOperation.setStatusCode('200');
  restOperation.setContentType('text');
  this.completeRestOperation(restOperation);
};


//NOTE getJsonFromGitlab moved to ghe_fetch.js


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
