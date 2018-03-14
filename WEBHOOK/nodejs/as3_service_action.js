/*
*   ServiceAction:
*       Applies Service Definition to 
*       AppServices_Integration iApp v3 on BIG-IP.
*
*   N. Pearce, March 2018
*   http://github.com/npearce
*
*/
"use strict";

var logger = require('f5-logger').getInstance();
var http = require('https');
var GheFetch = require('./ghe_fetch.js');
//var GhePost = require('./ghe_post.js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function ServiceAction() {}

ServiceAction.deploy = function (config, addedFile, gheMessage) {

    if (addedFile.startsWith("SERVICE")) {

        var addedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + addedFile;

        GheFetch.getServiceDefinition(config, addedFilePath, function (service_inputs) {
            logger.info('This is what we\'re pushing to AS3, service_inputs:\n' +service_inputs);
    
            try {
                JSON.parse(service_inputs); //Adding support for YAML
            }
            catch(e) {
                
            }
    
            ServiceAction.pushToIapp(service_inputs, function(results) {
                logger.info('deploy to AS3 results: '+results);
    //            GhePost.postResultsToGhe(GHE_IP_ADDR, GHE_ACCESS_TOKEN, results); //Success/Fail Response
            });
        });
    }
};

ServiceAction.modify = function (config, modifiedFile, gheMessage) {

    if (modifiedFile.startsWith("SERVICE")) {

        var modifiedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + modifiedFile;

        GheFetch.getServiceDefinition(config, modifiedFilePath, function (service_inputs) {
    
            ServiceAction.pushToIapp(service_inputs, function(results) {
                logger.info('modify to AS3 results: '+results);
    //            GhePost.postResultsToGhe(results); //Response code
            });
        });    
    }
}

ServiceAction.delete = function (config, deletedFile, gheMessage) {

    if (deletedFile.startsWith("SERVICE")) {
        // The definition has been deleted, so we must retrieve it from the previous commit - 'gheMessage.before'.
        var previousCommit = gheMessage.before;
        var deletedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deletedFile + "?ref=" + previousCommit;
    
        GheFetch.getServiceDefinition(config, deletedFilePath, function (service_inputs) {
            var parsed_inputs = JSON.parse(service_inputs);
     
            Object.keys(parsed_inputs).forEach( function(key) {
                if (parsed_inputs[key].class == 'Tenant' ) {
    
                    var path = '/mgmt/shared/appsvcs/declare/localhost/'+key;
    
                    ServiceAction.pushDeleteToIapp(path, function(results) {
                        logger.info('Deleting to AS3 results: '+results);
            //            GhePost.postResultsToGhe(results); //Response code
                    });
            
                }
            });
        });
    }
}

ServiceAction.pushToIapp = function (service_inputs, cb) {

    logger.info('IN: ServiceAction.pushToIapp()');

    var options = {
        "method": "POST",
        "hostname": 'localhost',
        "path": '/mgmt/shared/appsvcs/declare',
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Basic YWRtaW46ZTRkOGJhM2M=",
            "Cache-Control": "no-cache"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            cb(body);
        });
    });

    req.write(service_inputs);
    req.end();

};

ServiceAction.pushDeleteToIapp = function (path, cb) {

    //FIX: Why arent we using restOperation();??
    logger.info('IN: ServiceAction.pushDeleteToIapp()');
    logger.info('Deleting: ' +path);

    var options = {
        "method": "DELETE",
        "hostname": 'localhost',
        "path": '/mgmt/shared/appsvcs/declare/localhost/'+path,
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Basic YWRtaW46ZTRkOGJhM2M=",
            "Cache-Control": "no-cache"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            cb(body);
        });
    });
    req.end();
};

module.exports = ServiceAction;
