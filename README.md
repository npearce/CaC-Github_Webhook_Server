# Github Infrastructure-as-Code WebHook Server for F5 BIG-IP

Using GitHub's Webhook feature, this Webhook Server automates Infrastructure as Code deployments.

## Description

F5 has discovered customer interest in automated Infrastructure-as-Code models. Through the use of GitHub WebHooks, engineers may 'commit' service definitions to a 'deployment' repository, which results in F5 BIG-IP configurations. With this model, GitHub is providing a familiar developer interface (SCM) with "deployment configuration templates", which result in deployed configurations on technology typically unfamiliar to the engineer, like F5's BIG-IP application delivery controller.

The service definition 'commit' may be either JSON or YAML configuration data which, via a GitHub WebHook, is communicated to an F5 iControl LX worker (a custom declarative interface within the F5 BIG-IP REST API). The iControl LX worker translates the [JSON|YAML] service definition into a BIG-IP service configuration.

## Requirements

* Uses the AppSvcs_Integration v3.x (AS3) worker to translate service definitions into BIG-IP configurations.

> NOTE: iApps are configuration templates presented as declarative REST endpoints.

### Concepts

* **iControl** - The F5 BIG-IP REST API.
* **iControl LX** - (iControl Language eXtension) The F5 BIG-IP REST API Framework, upon which you can create custom endpoints/workflows.
* **iControl LX worker/microservice** - Some Javascript that is executed every time it's custom endpoint is hit with GET/POST/PUT/PATCH/DELETE.

## Workflow

1. Engineer is ready to deploy a service.
2. Engineer visits the "configuration as code" repo on GitHub and navigates to the '/templates' directory.
3. Based on their applications/services requirements, the engineer selects the appropriate template. e.g. "Basic load-balancing", "SSL Offload", "Web Application Firewall", and so on.
4. Engineer creates a new file in the '/deploy' directory using the template [JSON|YAML] (we could support both/either), and enters the unique deployment-specific data, e.g.: service name, server IP addresses, etc. **NOTE:** See template example below.
5. A GitHub WebHook, configured with custom F5 iControl LX worker REST endpoint (a WebHook server) destination, communicates the commit as 'added', 'modified', or 'removed'.
6. The iControl LX worker consumes and processes as appropriate.
   1. If the WebHook commit message indicates "added" or "modified", the WebHook will retrieve the 'Service Definition' from GitHub and perform the deploy (if "added"), or re-deploy (if "modified").
   2. If the WebHook commit message indicates "removed", there is no requirement to retrieve the 'Service Definition' from GitHub and the services configuration is immediately removed from the BIG-IP device.

## Repository Structure

```sh
GHE_IaC_WebHook
  |- README.md
  |- DIST
    |- f5-appsvcs-3.0.0-21.noarch.rpm
    |- GheListener-0.1.0-0001.noarch.rpm
  |- DOCS
    |- BIG-IP_SETUP.md
    |- GHE_SETUP.md
  |- EXAMPLES
    |- 1.AS3-EXAMPLE-Basic_L4_LB.json
    |- 2.AS3-EXAMPLE-L7_LB_iRule.json
    |- 3.AS3-EXAMPLE-L7_LB_Firewall.json
  |- SRC
    |- README.md
    |- GheWebhookServer
      |- nodesjs
        |- ghe_listener.js
        |- ghe_util.js
```

* `/DIST` - the RPMs to install onto BIG-IPs for IaC management.
* `/DOCS` - the setup instructions for GHE an BIG-IP.
* `/EXAMPLES` - containers templates for device on-boarding and for service deployments.
* `/SRC` - the WebHook server iControl LX source.

## Example Service Definition Templates

* [EXAMPLE - Basic L4 Load-balancing](./EXAMPLES/1.AS3-EXAMPLE-Basic_L4_LB.json)
* [EXAMPLE - L7 Traffic Steering w/ URI routing (iRule)](./EXAMPLES/2.AS3-EXAMPLE-L7_LB_iRule.json)
* [EXAMPLE - L7 Traffic Steering w/ Network Firewall (AFM)](./EXAMPLES/3.AS3-EXAMPLE-L7_LB_Firewall.json)

## Known Issues

1. AS3 is currently 'alpha' code. (March 2018)
2. GheWebhookServer only support one Service Definition per BIG-IP Tenant AS3. Feature request raised with AS3 team to support multiple Service Definitions per BIG-IP Tenant.
3. Weak deployment failure handling. See v0.2 details below.

## Feature Roadmap

| *Feature* | *Description* | *Release* |
|-----------|---------------|-----------|
| Webhook Server | Consumes Service Definitions and deploys to BIG-IP. Supports Deploy/Re-deploy/Delete operations. | v0.1 |
| Issue reporting | Create GitHub Issue for failed deployments | v0.1 |
| Service Feedback | Post Availability/Performance data back to GitHub | v0.2 |

**Details:**

**Webhook Server:** The base webhook server running on BIG-IP. Consumes service definition commits (added/modified/delete) and deploys/modifies/deletes BIG-IP configurations through AS3.

**Issue reporting:** Create a 'GitHub Issue' for failed AS3 create/modify/delete operations.

**Service Feedback:** Posting utilization/performance data back to repo.
