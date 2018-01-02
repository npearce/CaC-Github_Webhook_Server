var logger = require('f5-logger').getInstance();
var http = require('http');

GITLAB_HTTP_PORT = "980";
GITLAB_IP = "192.168.176.1";

/**
 * A simple iControlLX extension that handles only HTTP GET
 */
function GheStats() {}

//GheFetch.prototype.WORKER_URI_PATH = "shared/n8/ghe_fetch"; //TODO do I need a URI if not public?

GheStats.prototype.isPublic = false;

GheStats.prototype.onStart = function(success, error) {

  success();

};


module.exports = GheStats;
