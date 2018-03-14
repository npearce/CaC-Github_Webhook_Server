/*
*   GheFetch:
*     Retrieves GitHub Enteprise commit data.
*
*   N. Pearce, February 2018
*   http://github.com/npearce
*
*/
"use strict";

var logger = require('f5-logger').getInstance();
var http = require('https');
//var YAML = require('yamljs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// TODO Support YAML & JSON? iImplement 'try { JSON.parse }' else check if YAML...

function GheFetch() {}

/**
 * Fetches data from GitHub Enterprise
 */
GheFetch.getServiceDefinition = function (config, addedAppServicePath, service_inputs) {

  GheFetch.getGheDownloadUrl(config, addedAppServicePath, function (download_url) {

    logger.info("GheFetch.getGheDownloadUrl fetched URL: " +download_url+ "\n Fetching Service Definition...");

    var options = {
      "method": "GET",
      "hostname": config.ghe_ip_address,
      "port": 443,
      "path": download_url,
      "headers": {
        "cache-control": "no-cache",
        "authorization": "Bearer " +config.ghe_access_token
      }
    };

    var req = http.request(options, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var body = Buffer.concat(chunks);
        var results = body.toString();
        logger.info("GheFetch.getServiceDefinition() - results: " +results);
        service_inputs(results);
      });
    }).on("error", function (err) {
      logger.info("GheFetch.getServiceDefinition: Error: " +err);
    });
    req.end();

  });

}

GheFetch.getDeletedServiceDefinition = function (config, deletedFilePath) {

  GheFetch.getGheDownloadUrl(config, deletedFilePath, function (download_url) {

    logger.info("GheFetch.getGheDownloadUrl fetched URL: " +download_url+ "\n Fetching Deleted Service Definition (from back in time)...");

    var options = {
      "method": "GET",
      "hostname": config.ghe_ip_address,
      "port": 443,
      "path": download_url,
      "headers": {
        "cache-control": "no-cache",
        "authorization": "Bearer " +config.ghe_access_token
      }
    };

    var req = http.request(options, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var body = Buffer.concat(chunks);
        var results = body.toString();
        logger.info("GheFetch.getDeletedServiceDefinition() - return results: " +results);
      });
    }).on("error", function (err) {
      logger.info("GheFetch.getServiceDefinition: Error: " +err);
    });
    req.end();

  });

}

GheFetch.getGheDownloadUrl = function(config, objectPath, download_url) {

  logger.info("GheFetch.getGheDownloadUrl() fetching " +objectPath+ " from: " +config.ghe_ip_address);

  var options = {
    "method": "GET",
    "hostname": config.ghe_ip_address,
    "port": 443,
    "path": objectPath,
    "headers": {
      "cache-control": "no-cache",
      "authorization": "Bearer " +config.ghe_access_token
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];
    res.on("data", function (chunk) {
      chunks.push(chunk);
    });
    res.on("end", function () {
      var body = Buffer.concat(chunks);
      var results = body.toString();

      let parsed_results = JSON.parse(results);

      logger.info("GheFetch.getGheDownloadUrl() - parsed_results.download_url " +parsed_results.download_url);

      download_url(parsed_results.download_url);

    });
  }).on("error", function (err) {
    logger.info("GheFetch.getServiceDefinition: Error: " +err);
  });
  req.end();

}

//TODO phone home for the WebHook State....
GheFetch.getState = function (config, pathToData, cb) {

  logger.info("GheFetch.getServiceDefinition() fetching " +pathToData+ " from: " +config.ghe_ip_address);

  var options = {
    "method": "GET",
    "hostname": config.ghe_ip_address,
    "port": 443,
    "path": pathToData,
    "headers": {
      "cache-control": "no-cache",
      "authorization": "Bearer " +config.ghe_access_token
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];
    res.on("data", function (chunk) {
      chunks.push(chunk);
    });
    res.on("end", function () {
      var body = Buffer.concat(chunks);
      var results = body.toString();
      logger.info("GheFetch.getServiceDefinition() - return results: " +results);
      cb(results);
    });
  }).on("error", function (err) {
    logger.info("GheFetch.getServiceDefinition: Error: " +err);
  });
  req.end();

}

module.exports = GheFetch;
