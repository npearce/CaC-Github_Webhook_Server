# Install & Setup

Contents:

* Installing the F5 BIG-IP Github Webhook Server
* Configuring the F5 BIG-IP Github Webhook Server

## Installation

To implement this solution you must install with the AS3 worker and the GheWebhookServer worker. This document will cover the GheWebhookServer only. Details on AS3 cn be found: xxx (to be released May 1st).

1. Download the latest GheWebhookServer RPM from the here: https://github.com/npearce/GHE_IaC_WebHook/releases It's name will be something like (numbers may differ): `GithubWebhookServer-0.3.0-0005.noarch.rpm`
2. Copy the GheWebhookServer RPM into the following directory on your BIG-IP: `/var/config/rest/downloads/`
3. Execute the following command on your BIG-IP (shell prompt, not tmsh) to install:

```sh
curl -u <username>:<password> -X POST http://localhost:8100/mgmt/shared/iapp/package-management-tasks -d '{ "operation":"INSTALL","packageFilePath": "/var/config/rest/downloads/GithubWebhookServer-0.3.0-0005.noarch.rpm"}'
```

NOTE: Use your admin username/password and check the name of the RPM carefaully as release numbers may differ from the example above.

The response will look something like this:

```json
{"packageFilePath":"/var/config/rest/downloads/GithubWebhookServer-0.3.0-0005.noarch.rpm","operation":"INSTALL","id":"fa13463f-6556-44cc-a699-7a7981dcc295","status":"CREATED","userReference":{"link":"https://localhost/mgmt/shared/authz/users/admin"},"identityReferences":[{"link":"https://localhost/mgmt/shared/authz/users/admin"}],"ownerMachineId":"3ed07ac1-8c3e-43c5-aacf-53eebf4cb2f8","generation":1,"lastUpdateMicros":1524932793810249,"kind":"shared:iapp:package-management-tasks:iapppackagemanagementtaskstate","selfLink":"https://localhost/mgmt/shared/iapp/package-management-tasks/fa13463f-6556-44cc-a699-7a7981dcc295"}
```

4. [OPTIONAL] Using the 'id' value in the response above, you can confirm the installation results like this (using your own unique job id):

`curl -u <username>:<password> -X GET http://localhost:8100/mgmt/shared/iapp/package-management-tasks/fa13463f-6556-44cc-a699-7a7981dcc295`

The response will look something like this:

```json
{"packageFilePath":"/var/config/rest/downloads/GithubWebhookServer-0.3.0-0005.noarch.rpm","packageName":"GithubWebhookServer-0.3.0-0005.noarch","operation":"INSTALL","packageManifest":{"tags":["IAPP"]},"id":"fa13463f-6556-44cc-a699-7a7981dcc295","status":"FINISHED","startTime":"2018-04-28T09:26:33.818-0700","endTime":"2018-04-28T09:26:34.711-0700","userReference":{"link":"https://localhost/mgmt/shared/authz/users/admin"},"identityReferences":[{"link":"https://localhost/mgmt/shared/authz/users/admin"}],"ownerMachineId":"3ed07ac1-8c3e-43c5-aacf-53eebf4cb2f8","generation":3,"lastUpdateMicros":1524932794714759,"kind":"shared:iapp:package-management-tasks:iapppackagemanagementtaskstate","selfLink":"https://localhost/mgmt/shared/iapp/package-management-tasks/fa13463f-6556-44cc-a699-7a7981dcc295"}
```

Note the `"status":"FINISHED"` indicating that installation was successful.

## Configuration

The GitHub Webhook Server for BIG-IP needs two values to operate. 

1. The IP Address (or hostname) of the GitHub Enterprise server.
2. An Access Token used to communicate with GitHub Enterprise.

During the RPM installation above, two iControl LX workers were installed `/ghe_listener` and `/ghe_settings`. We will configure the Github Webhook Server using `/ghe_settings`.

To provide these settings you need to `POST` to the `/ghe_settings` worker, e.g.:

```sh
POST https://{{bigip_mgmt_addr}}/mgmt/shared/n8/ghe_settings
{
    "config":
        {
            "ghe_base_url": "{{https://xxxxx/api/v3}}",
            "ghe_access_token": "{{xxxxxxxxxxxxxxxxxx}}",
            "queue_length": "{{x}}"
        }
}
```

NOTE: If no 'ghe_base_url' is provided, it will default to `api.github.com`. For GitHub Enterprise, either setup a DNS entry for `api.mygithub.com` or, if you don't setup DNS, remember to append `/api/v3` to the end of the IP Address (GitHub will need this to know its an API call, if it cannot see `api.` in the HTTP Host header). 

Example, using curl this woud look like:

```sh
curl -u <username>:<password> -X POST -H 'Content-type: application/json' http://localhost:8100/mgmt/shared/n8/ghe_settings -d '{"config":{"ghe_base_url": "https://172.31.1.200/api/v3", "ghe_access_token": "b95bcc50728b2afdd779f450ae55b2246b1a5cb9"}}'
```

## Troubleshooting

Enable debug mode by POSTing to `/ghe_settings` like so:


```sh
POST https://{{bigip_mgmt_addr}}/mgmt/shared/n8/ghe_settings
{
    "config":
        {
            "ghe_ip_address": "{{x.x.x.x}}",
            "ghe_access_token": "{{xxxxxxxxxxxxxxxxxx}}",
            "queue_length": "{{x}}"
            "debug": "true"
        }
}
```

This will push a **significat** volume of data to the BIG-IP log: `/var/log/restnoded/restnoded.log`

NODE: Remember to disabe debug made with `"debug": "false"` when troubleshooting is complete. 

## UNINSTALL

1. Verify the version you are running in: `/mgmt/shared/iapp/global-installed-packages`. For example, on the BIG-IP, execute:

`curl -u <username>:<password> -X GET http://localhost:8100/mgmt/shared/iapp/global-installed-packages/`

Note the version you are running.

2. Uninstall the Github Webhook Servier with via `/mgmt/shared/iapp/package-management-tasks`. For example, on the BIG-IP, execute:

`curl -u <username>:<password> -X POST http://localhost:8100/mgmt/shared/iapp/package-management-tasks -d '{ "operation":"UNINSTALL","packageName": "GithubWebhookServer-0.2.0-0002.noarch"}'`

