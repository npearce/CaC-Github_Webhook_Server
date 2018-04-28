/*
*   GheSettings:
*     GitHub Enterprise webhook server Settings.
*
*   N. Pearce, April 2018
*   http://github.com/npearce
*
*/
"use strict";

const logger = require('f5-logger').getInstance();

function GheSettings() {
  this.state = {};
}

GheSettings.prototype.WORKER_URI_PATH = "shared/n8/ghe_settings";
GheSettings.prototype.isPublic = true;
GheSettings.prototype.isSingleton = true;
GheSettings.prototype.isPersisted = true;

/**
 * handle onStart
 */
GheSettings.prototype.onStart = function(success, error) {

    var me = this;
    this.loadState(null,

        function (err, state) {
            if (err) {
                error('[GheSettings] Error loading state:' +err);
                return;
            }
            logger.info('[GheSettings] State loaded');
            me.state = state;
        }

    );
    success();

};

/**
 * handle onGet HTTP request
 */
GheSettings.prototype.onGet = function(restOperation) {

    // Respond with the persisted state (config)
    restOperation.setBody(this.state);
    this.completeRestOperation(restOperation);
  
};

/**
 * handle onPut HTTP request
 */
GheSettings.prototype.onPut = function(restOperation) {

    // Use POST - its an all or none thing, anyway
    this.onPost(restOperation);

};

/**
 * handle onPost HTTP request
 */
GheSettings.prototype.onPost = function(restOperation) {

    var newState = restOperation.getBody();

    // If there's no 
    if (!newState) {

        restOperation.fail(new Error("[GheSettings} No state provided..."));
        return;

    }
    else {

        this.state = newState;

    }

    restOperation.setBody(this.state);
    this.completeRestOperation(restOperation);
      
};

module.exports = GheSettings;