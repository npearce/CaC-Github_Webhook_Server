var logger = require('f5-logger').getInstance();
var http = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function GheFetch() {}

/**
 * Fetches data from GitHub Enterprise
 */
GheFetch.getServiceDefinition = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, pathToData, cb) {

  logger.info("GheFetch.getServiceDefinition() fetching " +pathToData+ " from: " +GHE_IP_ADDR);

  var options = {
    "method": "GET",
    "hostname": GHE_IP_ADDR,
    "port": 443,
    "path": pathToData,
    "headers": {
      "cache-control": "no-cache",
      "authorization": "Bearer " +GHE_ACCESS_TOKEN
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
      logger.info("GheFetch.getServiceDefinition() - return results: " +results);
      cb(results);
    });
  }).on("error", function (err) {
    logger.info("GheFetch.getServiceDefinition: Error: " +err);
  });
  req.end();

}

module.exports = GheFetch;
