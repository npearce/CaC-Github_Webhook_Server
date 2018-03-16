
The GitHub Enterprise Webhook Server for BIG-IPneeds two values to operate.

1. The IP Address (or hostname) of the GitHub Enterprise server.
2. An Access Token used to communicate with GitHub Enterprise.

To provide these settings:

```sh
PUT https://{{bigip_mgmt_addr}}/mgmt/shared/n8/ghe_listener
{
    "ghe_ip_address": "{{x.x.x.x}}",
    "ghe_access_token": "{{xxxxxxxxxxxxxxxxxx}}"
}
```
