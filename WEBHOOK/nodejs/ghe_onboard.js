var logger = require('f5-logger').getInstance();
var http = require('http');

// POST the device phone-home details to this worker
// Worker will then retrieve its "on-boarding" details from the repo and execute the Onboarding worker.

function GheOnBoard() {}

GheListener.prototype.WORKER_URI_PATH = "shared/iac/ghe_onboard";
GheListener.prototype.isPublic = true;

GheListener.prototype.onStart = function(success, error) {

  logger.info("GitHub Enterprise WebHook Server: onStart()...");

// Must persist states and phone home after reboot.


// this should actually check that the Device Reset/Onbaord worker is installed and loaded `/available` before 'success();'.
  success();

}
