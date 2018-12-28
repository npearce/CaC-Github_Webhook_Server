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
const octokit = require('@octokit/rest')({
    headers: {
      accept: 'application/vnd.github.v3+json'
    }
});
const os = require('os');
  
function GheSettings() {
  this.state = {};
}

GheSettings.prototype.WORKER_URI_PATH = "shared/webhook/github-settings";
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

                error('[GheSettings] - Error loading state:' +err);
                return;

            }

            logger.info('[GheSettings] - State loaded.');
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
 * handle onPost HTTP request
 */
GheSettings.prototype.onPost = function(restOperation) {

    var newState = restOperation.getBody();

    // If there's no 
    if (!newState) {

        restOperation.fail(new Error("[GheSettings] - No state provided..."));
        return;

    }
    else {

        logger.info('[GheSettings] - Settings updated.');
        this.state = newState;

        this.validateSettings(newState)
        .then((results) => {

            logger.info('[GheSettings] - Settings validation results: ' +results);

        })
        .catch((err) => {
            
            logger.info('[GheSettings - ERROR] validateSettings(): ' +err);

        });

    }

    restOperation.setBody(this.state);
    this.completeRestOperation(restOperation);
      
};

/**
 * validate settings
 */
GheSettings.prototype.validateSettings = function(newState) {

    return new Promise((resolve, reject) => {

        octokit.authenticate({
            type: 'oauth',
            token: newState.config.ghe_access_token
        });

        let hostname = os.hostname();
        let repo = newState.config.repository.split('/');
        let title = 'Validated settings for: ' +hostname;
        let body = 'The F5 BIG-IP: \''+hostname+'\' is managed by this repository: \'' +newState.config.repository+ '\'';

        octokit.issues.create({baseUrl: newState.config.ghe_base_url, owner: repo[0], repo: repo[1], title: title, labels: ['validated'], body: body})
        .then((result) => {

            resolve(result.headers.status);

        })
        .catch((err) => {

            reject(err);

        });
    });

};

/**
 * handle /example HTTP request
 */
GheSettings.prototype.getExampleState = function () {    
  
    return {
        "config": {
            "ghe_base_url":"https://1.1.1.1/api/v3",
            "repository": "iacorg/bigip1.prod.n8labs.local",
            "ghe_access_token": "[GitHub Access Token]",
            "max_queue_length": 10,
            "debug": false
        }
    };
  
};

module.exports = GheSettings;