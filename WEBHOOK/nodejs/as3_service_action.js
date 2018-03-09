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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function ServiceAction() {}

ServiceAction.deploy = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath) {

    logger.info('IN: ServiceAction.prototype.deploy()');

    GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath, function (service_inputs) {
        logger.info('This is what we\'re pushing to AS3, service_inputs:\n' +service_inputs);

        ServiceAction.pushToIapp(service_inputs, function(results) {
            logger.info('deploy to AS3 results: '+results);
//            GhePost.postResultsToGhe(results); //Response code
        });
    });
};

ServiceAction.modify = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, modifiedFilePath) {
    //TODO Handle modifications to deployments

    logger.info('IN: ServiceAction.prototype.modify()');

    GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, modifiedFilePath, function (service_inputs) {
        logger.info('This is what we\'re pushing to AS3, service_inputs:\n' +service_inputs);

        ServiceAction.pushToIapp(service_inputs, function(results) {
            logger.info('modify to AS3 results: '+results);
//            GhePost.postResultsToGhe(results); //Response code
        });
    });
}

ServiceAction.delete = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath) {

    //TODO this deletes 'Tenent1' = DELETE mgmt/shared/appsvcs/declare/localhost/Tenant1
    GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath, function (service_inputs) {
        logger.info('This is what we\'re deleting via AS3, service_inputs:\n' +service_inputs);
        var parsed_inputs = JSON.parse(service_inputs);
 
        Object.keys(parsed_inputs).forEach( function(key) {
            logger.info('parsed_inputs[key]: ' +parsed_inputs[key]);
            logger.info('parsed_inputs[key].class: ' +parsed_inputs[key].class);
            if (parsed_inputs[key].class == 'Tenant' ) {
                logger.info('Building URI to delete \"' +key+ '\"');

                var path = '/mgmt/shared/appsvcs/declare/localhost/'+key;

                ServiceAction.pushDeleteToIapp(path, function(results) {
                    logger.info('Deleting to AS3 results: '+results);
        //            GhePost.postResultsToGhe(results); //Response code
                });
        
            }
        });

    });
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
