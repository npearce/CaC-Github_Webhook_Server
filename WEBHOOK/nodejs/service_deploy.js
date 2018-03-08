/*
*   ServiceDeploy:
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

function ServiceDeploy() {}

ServiceDeploy.deploy = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath) {

    logger.info('IN: ServiceDeploy.prototype.deploy()');

    GheFetch.getServiceDefinition(GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedFilePath, function (service_inputs) {
        logger.info('This is what we\'re pushing to AS3, service_inputs:\n' +service_inputs);
        ServiceDeploy.pushToIapp(service_inputs, function(resuls) {
            //GhePost.postResultsToGhe(); //Response code
        });

    });
};

ServiceDeploy.pushToIapp = function (service_inputs, cb) {
    //TODO Build trasaction to deplot to AS3 locally.
    //cb([200 || !==200])


};

module.exports = ServiceDeploy;
