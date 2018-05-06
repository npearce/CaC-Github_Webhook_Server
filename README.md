# Github Infrastructure-as-Code WebHook Server for F5 BIG-IP

Using GitHub's Webhook feature, this Webhook Server automates Infrastructure as Code management of F5's BIG-IP devices (hardware or software).

## Description

Infrastructure-as-Code has predominantely focussed on 'server' infrastructure. However, this 'Network Infrastructure as Code' solution allows engineers to 'commit' F5 BIG-IP service definitions to a Github repository, which results in configured F5 BIG-IP application services ready for application traffic. Installing this Webhook Server onto BIG-IP devices enables for the automated deployment of BIG-IP configurations directly via a Github Webhhok.

This solution was written upon the iControl LX framework. Installed on a BIG-IP, this iControl LX worker presents a `/ghe_listener` REST end-point ready to receive Github 'commit' notifications.

## Requirements

* Uses the AppSvcs_Integration v3.x (AS3) iControl LX worker to translate service definitions into BIG-IP configurations. Read more about this awesome API Surface here: http://clouddocs.f5.com/products/extensions/f5-appsvcs-extension/3/

> NOTE: AS3 is an F5 developed and supported iControl LX worker that greatly simplifies the programmable surface of BIG-IP.

### Concepts

* **iControl** - The F5 BIG-IP REST API.
* **iControl LX** - (iControl Language eXtension) The F5 BIG-IP REST API Framework, upon which you can create custom endpoints/workflows.
* **iControl LX worker/microservice** - Nodejs Javascript that is executed every time it's custom endpoint is hit with GET/POST/PUT/PATCH/DELETE.

## Workflow

1. Engineer is ready to deploy a service.
2. Engineer visits the devices "infrasutrcture as code" repository on GitHub and navigates to the '/templates' directory.
3. Based on their requirements, the engineer selects the appropriate template. e.g. "Basic load-balancing", "SSL Offload", "Web Application Firewall", and so on.
4. Engineer creates a new file in the '/deploy' directory using the template and enters the unique deployment-specific data, e.g.: service name, server IP addresses, etc. See template example below.
5. A GitHub WebHook sends a Github 'commit' message to the iControl LX REST worker end-point, `/ghe_listener`.
6. The iControl LX worker consumes and processes as appropriate.
   1. The iContorl LX worker will parse the commit message and identify any service definition changes: if the commit has 'added', 'modified', or 'removed' a service definition.
   2. When complete, the iControl LX worker will create a 'Github Issue' in the source repository with the results (success/failure) of the commit processing.

## Repository Structure

```sh
GHE_IaC_WebHook
  |- README.md
  |- DIST
    |- f5-appsvcs-3.0.0-34.noarch.rpm
    |- n8-GheWebhookServer-0.1.0-0007.noarch.rpm
  |- DOCS
    |- BIG-IP_SETUP.md
    |- GHE_SETUP.md
  |- EXAMPLES
    |- 1a.AS3-EXAMPLE-Basic_L4_LB.json
    |- 1b.AS3-EXAMPLE-Basic_L4_LB.json
    |- 2.AS3-EXAMPLE-L7_LB_SSL_Offload.json
    |- 3.AS3-EXAMPLE-L7_LB_iRule.json
    |- <more to come>
  |- SRC
    |- README.md
    |- GheWebhookServer
      |- nodesjs
        |- ghe_listener.js
        |- ghe_settings.js
        |- ghe_util.js
```

* `/DIST` - the RPMs to install onto BIG-IPs for IaC management.
* `/DOCS` - the setup and usage instructions for GHE an BIG-IP.
* `/EXAMPLES` - contains AS3 service definition examples for configuring BIG-IP application services.
* `/SRC` - the WebHook server iControl LX source.

## Known Issues

1. GheWebhookServer only supports one Service Definition per BIG-IP Tenant AS3. Feature request raised with AS3 team to support multiple Service Definitions per BIG-IP Tenant.
2. Some Github issue 'error' notifications are not actually errors, and are just notifications.

## Feature Roadmap

| *Feature* | *Description* | *Release* |
|-----------|---------------|-----------|
| Webhook Server | Consumes Service Definitions and deploys to BIG-IP. Supports Deploy/Re-deploy/Delete operations. | v0.1 |
| Status reporting | Create GitHub Issue for failed deployments | v0.1 |
| Test deploy | Use a 'test' branch to simulate a deployment (validate config) | v0.2 |
| Service Feedback | Post Availability/Performance data back to GitHub repository | v0.3 |

**Webhook Server:** The base webhook server running on BIG-IP. Consumes service definition commits (added/modified/delete) from Github webhook and deploys/modifies/deletes BIG-IP configurations through the AS3 iControl LX declarative interface worker.

**Status reporting:** Create a 'GitHub Issue' to report success/failure of create/modify/delete operations.

**Service Feedback:** Post utilization/performance (throughput/concurrent connections) and availability (node/pool member monitor activity) data back to source repository.

**Test Deployments:** Support service definitition validation by merging service definition to a 'test' branch merge and using AS3s 'dry-run' feature.