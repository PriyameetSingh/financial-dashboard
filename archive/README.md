# Old Deployment System Archive

## What Was Here

This directory contains archived files from the previous deployment system.

### auto-deploy.sh.bak

The original auto-deployment script that:
- Ran as a cron job (if configured)
- Pulled from master branch automatically
- Built and restarted the application on port 8765
- Had limited error handling and logging

## Why It Was Replaced

The old system was replaced with a webhook-based CI/CD pipeline that offers:

1. **Better Environment Separation:** Separate test (dev branch) and production (main branch) deployments
2. **Safer Migrations:** Automatic migrations on test, manual approval for production
3. **Immediate Deployments:** Webhook triggers on push, no polling delay
4. **Better Logging:** Comprehensive deployment logs in `/var/log/deployments/`
5. **Rollback Support:** Easy to revert to previous versions
6. **No Cron Jobs:** Event-driven instead of polling

## Migration Notes

- **Date Archived:** May 25, 2026
- **Cron Job Status:** No active cron jobs found for auto-deploy.sh
- **New System:** See [WEBHOOK-SETUP.md](../WEBHOOK-SETUP.md) and [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)

## Restoring Old System (Not Recommended)

If you need to temporarily revert to the old system:

```bash
# Restore the script
cp archive/auto-deploy.sh.bak auto-deploy.sh
chmod +x auto-deploy.sh

# Set up cron job (example - runs every 5 minutes)
crontab -e
# Add: */5 * * * * /home/ec2-user/dev/hudd-dashboard/auto-deploy.sh
```

**Warning:** This will interfere with the new webhook-based system. Make sure to stop the webhook server first:
```bash
pm2 stop webhook-server
```

## Cleanup

After confirming the new system works properly (recommended 1-2 weeks), you can safely delete this archive:

```bash
rm -rf archive/
```

Make sure to test all workflows before deleting the archive.
