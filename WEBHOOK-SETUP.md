# GitHub Webhook Setup Instructions

## Prerequisites

1. Admin access to the GitHub repository: `PriyameetSingh/hudd-dashboard`
2. Server IP address or domain name (e.g., 13.203.18.97)
3. Port 9000 accessible from GitHub (firewall/security group must allow inbound traffic)

## Step 1: Generate Webhook Secret

On your server, run:

```bash
openssl rand -hex 32
```

Copy the output - this is your `WEBHOOK_SECRET`. You'll need it for both GitHub and your server.

## Step 2: Set Up Environment Variable

Add the webhook secret to your server environment:

```bash
# Add to your shell profile (~/.bashrc or ~/.bash_profile)
export WEBHOOK_SECRET="your-generated-secret-here"

# Then reload
source ~/.bashrc
```

## Step 3: Configure GitHub Webhook

1. Go to https://github.com/PriyameetSingh/hudd-dashboard/settings/hooks
2. Click "Add webhook"
3. Configure the webhook:

   **Payload URL:** `http://13.203.18.97:9000/webhook`
   
   **Content type:** `application/json`
   
   **Secret:** Paste the secret you generated in Step 1
   
   **Which events would you like to trigger this webhook?**
   - Select "Just the push event"
   
   **Active:** Check this box
   
4. Click "Add webhook"

## Step 4: Configure Firewall

Ensure port 9000 is accessible from GitHub's webhook IPs. If using AWS Security Group:

```bash
# Allow GitHub webhook IPs (you can also allow all HTTPS traffic)
# GitHub webhook IP ranges: https://api.github.com/meta
# For simplicity, you can allow all incoming traffic on port 9000
# or restrict to GitHub's published IP ranges
```

For AWS EC2, add an inbound rule in your security group:
- Type: Custom TCP
- Port: 9000
- Source: 0.0.0.0/0 (or restrict to GitHub's IPs for better security)

## Step 5: Start Webhook Server

```bash
cd /home/ec2-user/dev/hudd-dashboard
npm run webhook:start
```

Or start all services:

```bash
pm2 start ecosystem.config.cjs
```

## Step 6: Test the Webhook

1. After adding the webhook in GitHub, it will send a "ping" event
2. Check the webhook delivery in GitHub:
   - Go to Settings > Webhooks > Your webhook
   - Click on the webhook
   - Scroll to "Recent Deliveries"
   - You should see a successful "ping" delivery
3. Check server logs:
   ```bash
   npm run webhook:logs
   # or
   tail -f /var/log/deployments/webhook-*.log
   ```

## Step 7: Update GitHub Default Branch

1. Go to https://github.com/PriyameetSingh/hudd-dashboard/settings
2. Under "Default branch", click the switch icon
3. Select `main` as the new default branch
4. Confirm the change

## Verification

Test the setup by pushing to the dev or main branch:

```bash
git checkout dev
git commit --allow-empty -m "Test webhook deployment"
git push origin dev
```

Check logs to verify the webhook triggered:
```bash
npm run webhook:logs
tail -f /var/log/deployments/deploy-test-*.log
```

## Troubleshooting

### Webhook not triggering

1. Check GitHub webhook deliveries for error messages
2. Verify the webhook secret matches on both sides
3. Ensure port 9000 is accessible: `curl http://localhost:9000/webhook`
4. Check webhook server is running: `pm2 list`
5. Check logs: `npm run webhook:logs`

### Deployment failing

1. Check deployment logs in `/var/log/deployments/`
2. Verify git credentials are set up for pulling
3. Ensure proper permissions on deployment scripts
4. Check PM2 is running: `pm2 status`

## Security Notes

- Keep your `WEBHOOK_SECRET` confidential
- Use GitHub's IP whitelist if possible
- Consider using HTTPS with a domain name and SSL certificate
- Regularly rotate the webhook secret
- Monitor webhook logs for suspicious activity
