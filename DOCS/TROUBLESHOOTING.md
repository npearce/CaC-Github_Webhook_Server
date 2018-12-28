# TROUBLESHOOTING

## Github to BIG-IP

Verify that the Github Webhook can reach the BIG-IP:

Creating the webhook:

1. In Github/Github Enterprise, navigate to the BIG-IPs repository.
2. Click on the **Settings** tab.
3. Click on **webhooks**.
4. Click on **Add Webhook**
5. The **Payload URL** must be reachable (resolvable DNS name and/or reachable IP address)

The Webhook URL must include a username and password for the BIG-IP of the format:

`https://admin:password@10.1.1.1/mgmt/shared/webhook/github-listener`

6. Change the **Content type** to `application.json`
7. If you are using 'self-signed' certificates with Github Enterprise, under **SSL Verification**, select `disable`

Leave the remaining options as they are.

8. Click **Add Webhook**

Verifying the webhook:

1. In the repositories **Settings**, navigate to the **Webhooks** section. You will see your webhook URL (the username/password credentials are not shown).
2. Click on the webhook URL.
3. Scroll down to **Recent Deliveries**
4. Click on the most recent entry and note any error messages when creating a [Github Issue](https://github.com/f5devcentral/CaC-Github_Webhook_Server/issues) for assistance. 

## BIG-IP to Github

## Verifying connectivity from BIG-IP to Github

1. From the BIG-IP, make sure you can ping Github/Github Enterprise.

## Verifying GIthub Auth Token credentials

1. On the BIG-IP, perform an authenticated API request using `curl`, like this:

`curl -v -k -X GET https://ip-172-31-1-200.us-west-1.compute.internal/api/v3/ -H 'Authorization: Token {your_token}' -H 'cache-control: no-cache'`