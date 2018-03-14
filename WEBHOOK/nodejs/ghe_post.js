/*
*   GhePost:
*       Commit data to GitHub Enterprise.
*
*   N. Pearce, March 2018
*   http://github.com/npearce
*
*/
"use strict";

//TODO POST the success/fail results back to GHE
GhePost.postResultsToGhe = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, data) {
    //TODO Post back to repo.
    logger.info('Postng to GHE....')

    var options = {
        "method": "POST",
        "hostname": GHE_IP_ADDR,
        "port": 443,
        "path": "/api/v4/projects/1/repository/commits",   // Get the path from the original commit message...
        "headers": {
          "content-type": "application/json",
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
          results(body);
        });
      });
    
      logger.info("this is what I'm meant to post (data):" +data);
    
      req.write(data);
      req.end();

};

module.exports = GhePost;