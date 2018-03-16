# Github Infrastructure-as-Code WebHook

Automated Infrastructure as Code deployment using GitHub WebHook to iControl LX Webhook Server.

## Description
F5 has discovered customer interest in automated Infrastructure-as-Code models. Through the use of GitHub WebHooks, engineers may 'commit' service definitions to a 'deployment' repository, which results in F5 BIG-IP configurations. With this model, GitHub is providing a familiar developer interface (SCM) with "deployment configuration templates", which result in deployed configurations on technology typically unfamiliar to the engineer, like F5's BIG-IP application delivery controller.

The service definition 'commit' may be either JSON or YAML configuration data which, via a GitHub WebHook, is communicated to an F5 iControl LX worker (a custom declarative interface within the BIG-IP REST API). The iControl LX worker translates the [JSON|YAML] service definition payload into a BIG-IP service configuration.

## Requirements
* Uses the iAppInstaller worker to ensure required iApps are installed on BIG-IP prior to deploying service definitions.

> NOTE: iApps are configuration templates presented as declarative REST endpoints.

### Concepts
* **iControl** - The F5 BIG-IP REST API.
* **iControl LX** - (iControl Language eXtension) The F5 BIG-IP REST API Framework, upon which customers/partners can create their own custom endpoints/workflows.
* **iControl LX worker/microservice** - Some Javascript that is executed every time it's custom endpoint is hit with GET/POST/PUT/PATCH/DELETE.

## Workflow
1. Engineer is ready to deploy a service.
2. Engineer visits the "configuration as code" repo on GitHub and navigates to the '/templates' directory.
3. Based on their applications/services requirements, the engineer selects the appropriate template. e.g. "Basic load-balancing", "SSL Offload", "Web Application Firewall", and so on.
4. Engineer creates a new file in the '/deploy' directory using the template [JSON|YAML] (we could support both/either), and enters the unique deployment-specific data, e.g.: service name, server IP addresses, etc. **NOTE:** See template example below.
5. A GitHub WebHook, configured with custom F5 iControl LX worker REST endpoint (a WebHook server) destination, communicates the commit as 'added', 'modified', or 'removed'.
6. The iControl LX worker consumes and processes as appropriate.
  1. If the WebHook message indicates "added" or "modified", the WebHook will retrieve the data from GitHub and perform the add (if "added"), or Nuke and Pave (if "modified").
  2. If the message is "removed", there is no requirement to retrieve the data from GitHub and the service configuration is immediately removed from the BIG-IP device.

## Requirements
Rapid, repeatable creation of demonstration environments for:
  - Account teams
  - Customer leave-behind environments
  - Sales Engineer training


## Structure
```
GHE_IaC_WebHook
  |- README.md
  |- DIST
    |- f5-appsvcs-3.0.0-21.noarch.rpm
    |- GheListener-0.1.0-0001.noarch.rpm
  |- DOCS
    |- BIG-IP_SETUP.md
    |- GHE_SETUP.md
  |- EXAMPLES
    |- [EXAMPLE]webapp1.acme.com.yml
    |- [EXAMPLE]webapp2.acme.com.yml
  |- SRC
    |- GheWebhookServer
      |- README.md
      |- nodesjs
        |- ghe_listener.js
        |- ghe_util.js
```

* `DIST` - the RPMs to install onto BIG-IPs for IaC management.
* `DOCS` - the setup instructions for GHE an BIG-IP.
* `EXAMPLES` - containers templates for device on-boarding and for service deployments.
* `SRC` - the WebHook server iControl LX source.


## WebHook functions

1. GHE_CaC_WebHook commit listener
2. Error reporting: creates 'issue' for failed create/modify/delete operations
3. Posting utilization stats (to the repo??)

## Example Service Definition Templates

* [EXAMPLE-Service_Definition.json](./EXAMPLE-Service_Definition.json)
* [EXAMPLE-Service_Definition.yml](./EXAMPLE-Service_Definition.yml)
