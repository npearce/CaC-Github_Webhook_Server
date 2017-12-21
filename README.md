# GH_CaC_WebHook
Automated Configuration as Code deployment using GitHub Webhook to iControl LX Webhook Server.

## Description

F5 has discovered customer interest in automated Configuration-as-Code models. Through the use of GitHub Webhooks, engineers may 'commit' service definitions to a 'deployment' repository, which results in F5 BIG-IP configurations. With this model, GitHub is providing a familiar developer interface (SCM) with "deployment configuration templates", which result in deployed configurations on technology typically unfamiliar to the engineer, like F5's BIG-IP application delivery controller.

The service definition 'commit' may be either JSON or YAML configuration data which, via a GitHub webhook, is communicated to an F5 iControl LX worker (a custom declarative interface within the BIG-IP REST API). The iControl LX worker translates the [JSON|YAML] service definition payload into a BIG-IP service configuration.

**Concepts**

**iControl** - The F5 BIG-IP REST API.
**iControl LX** - (iControl Language eXtension) The F5 BIG-IP REST API Framework, upon which customers/partners can create their own custom endpoints/workflows.
**iControl LX worker/microservice** - Some Javascript that is executed every time it's custom endpoint is hit with GET/POST/PUT/PATCH/DELETE.

## Workflow
1. Engineer is ready to deploy a service.
2. Engineer visits the "infrastructure as code" repo on GitHub and navigates to the '/templates' directory.
3. Based on their applications/services requirements, the engineer selects the appropriate template. e.g. "Basic load-balancing", "SSL Offload", "Web Application Firewall", and so on.
4. Engineer creates a new file in the '/deploy' directory using the template [JSON|YAML] (we could support both/either), and enters the unique deployment-specific data, e.g.: service name, server IP addresses, etc. **NOTE:** See template example below.
5. A GitHub Webhook, configured with custom F5 iControl LX worker REST endpoint (a Webhook server) destination, communicates the commit as 'added', 'modified', or 'removed'.
6. The iControl LX worker consumes and processes as appropriate.
  1. If the webhook message indicates "added" or "modified", the webhook wil retreive the data from GitHub and perform the add (if "added"), or Nuke and Pave (if "modified").
  2. If the message is "removed", there is no requirement to retrieve the data from GitHub and the service configuration is immediately removed form the BIG-IP device.


## Example template
Example Service Template, where engineer would replace the values in `{{}}`:

```
{
  "name": "{{example-f5-http-lb}}",
  "tenantTemplateReference": {
    "link": "https://localhost/mgmt/cm/cloud/tenant/templates/iapp/f5-http-lb"
  },
  "vars": [
    {
      "name": "pool__addr",
      "value": "{{appsvcs_vip_addr}}"
    },
    {
      "name": "pool__port",
      "value": "{{appsvcs_vip_port}}"
    }
  ],
  "tables": [
    {
      "name": "pool__Members",
      "columns": [
        "IPAddress",
        "State"
      ],
      "rows": [
        [
          "{{appsvcs_member1_addr}}",
          "enabled"
        ],
        [
          "{{appsvcs_member2_addr}}",
          "enabled"
        ]
      ]
    }
  ]
}
```
