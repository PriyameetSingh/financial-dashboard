# Webhook Deployment Testing Checklist

## Pre-Testing Setup

Before running these tests, ensure:
- [ ] GitHub webhook is configured (see WEBHOOK-SETUP.md)
- [ ] Webhook server is running: `pm2 list | grep webhook-server`
- [ ] Both `main` and `dev` branches exist on GitHub
- [ ] Git authentication is configured (SSH or Personal Access Token)
- [ ] Port 9000 is accessible from GitHub

## Test 1: Webhook Server Health Check

```bash
# Check if webhook server is running
pm2 list

# Expected: webhook-server should be "online"

# Check webhook logs
npm run webhook:logs

# Try a local test (should get 404 or unauthorized, but proves server is listening)
curl http://localhost:9000/webhook

# Expected: Server responds (even if with error)
```

## Test 2: Dev Branch Deployment (Test Environment)

### 2.1 Make a test change on dev branch

```bash
# Switch to dev branch
git checkout dev
git pull origin dev

# Make a trivial change (or use --allow-empty)
echo "# Test deployment $(date)" >> TEST-DEPLOY.md
git add TEST-DEPLOY.md
git commit -m "Test: dev branch webhook deployment"

# Push to trigger webhook
git push origin dev
```

### 2.2 Monitor the deployment

```bash
# Watch webhook logs
npm run webhook:logs

# Watch deployment logs (in another terminal)
tail -f /var/log/deployments/deploy-test-*.log

# Check PM2 status
pm2 list
```

### 2.3 Verify deployment

- [ ] Webhook received push event (check webhook logs)
- [ ] Deployment script executed (check deployment logs)
- [ ] Dependencies installed
- [ ] Migrations ran automatically
- [ ] Application built successfully
- [ ] PM2 restarted hudd-dashboard-test
- [ ] Test app is accessible: `curl http://localhost:8766`
- [ ] Check application logs: `pm2 logs hudd-dashboard-test`

## Test 3: Main Branch Deployment (Production Environment)

### 3.1 Merge dev to main

```bash
# Switch to main branch
git checkout main
git pull origin main

# Merge from dev
git merge dev

# Push to trigger webhook
git push origin main
```

### 3.2 Monitor the deployment

```bash
# Watch webhook logs
npm run webhook:logs

# Watch deployment logs (in another terminal)
tail -f /var/log/deployments/deploy-prod-*.log

# Check PM2 status
pm2 list
```

### 3.3 Verify deployment

- [ ] Webhook received push event (check webhook logs)
- [ ] Deployment script executed (check deployment logs)
- [ ] Dependencies installed
- [ ] Migrations DID NOT run automatically (should see warning if pending)
- [ ] Application built successfully
- [ ] PM2 restarted hudd-dashboard
- [ ] Production app is accessible: `curl http://localhost:8765`
- [ ] Check application logs: `pm2 logs hudd-dashboard`

## Test 4: Manual Production Migration

### 4.1 Create a test migration on dev

```bash
git checkout dev
cd /home/ec2-user/dev/hudd-dashboard

# Create a test migration
npx prisma migrate dev --name test_webhook_migration

# Add a harmless change to schema if needed
# Commit and push
git add prisma/
git commit -m "Add test migration"
git push origin dev
```

### 4.2 Wait for test deployment

Monitor logs as in Test 2

### 4.3 Verify migration ran on test

```bash
# Check test database migration status
node --env-file=.env.test.local node_modules/.bin/prisma migrate status

# Expected: No pending migrations
```

### 4.4 Merge to main

```bash
git checkout main
git merge dev
git push origin main
```

### 4.5 Verify migration did NOT run on prod

```bash
# Check production migration status
npx prisma migrate status

# Expected: Pending migrations detected
```

### 4.6 Run manual migration on prod

```bash
npm run migrate:prod
```

Follow prompts and verify:
- [ ] Backup created
- [ ] Migration executed successfully
- [ ] No pending migrations remain

## Test 5: Rollback Procedure

### 5.1 Note current state

```bash
# Record current commit
git rev-parse HEAD

# Record current PM2 status
pm2 list
```

### 5.2 Simulate rollback

```bash
# On the server, rollback to previous commit
cd /home/ec2-user/dev/hudd-dashboard
git checkout dev
git reset --hard HEAD~1

# Rebuild and restart
npm install
npm run build
npm run pm2:restart:test
```

### 5.3 Verify rollback

- [ ] Application reverted to previous version
- [ ] Application still running correctly
- [ ] Can access previous version

### 5.4 Roll forward again

```bash
git pull origin dev
npm install
npm run build
npm run pm2:restart:test
```

## Test 6: Error Handling

### 6.1 Test build failure

```bash
git checkout dev

# Introduce a syntax error in a TypeScript file
echo "const x = {" >> app/page.tsx
git add app/page.tsx
git commit -m "Test: intentional build failure"
git push origin dev
```

Verify:
- [ ] Webhook triggers
- [ ] Build fails
- [ ] Error logged properly
- [ ] Previous version still running
- [ ] Can see error in logs

Clean up:
```bash
git revert HEAD
git push origin dev
```

### 6.2 Test invalid webhook signature

Use GitHub webhook "Redeliver" with a modified secret to verify rejection.

Verify:
- [ ] Webhook rejected (401 Unauthorized)
- [ ] Logged as invalid signature
- [ ] No deployment triggered

## Test 7: Concurrent Deployments

Push to both dev and main in quick succession.

Verify:
- [ ] Both webhooks received
- [ ] Both deployments execute
- [ ] No conflicts
- [ ] Both environments updated correctly

## Common Issues and Solutions

### Issue: Webhook not triggering

**Check:**
1. GitHub webhook delivery status
2. Webhook server running: `pm2 list`
3. Port 9000 accessible
4. Correct webhook secret

**Fix:**
```bash
pm2 restart webhook-server
npm run webhook:logs
```

### Issue: Git authentication fails

**Check:**
```bash
git pull origin dev
# Should not prompt for credentials
```

**Fix:**
Set up SSH keys or Personal Access Token

### Issue: Migration fails

**Check:**
```bash
tail -f /var/log/deployments/migrate-prod-*.log
npx prisma migrate status
```

**Fix:**
Review migration, restore from backup if needed

### Issue: Build fails

**Check:**
```bash
npm run build
# Check for errors
```

**Fix:**
Fix code issues, push correction

## Post-Testing Cleanup

```bash
# Remove test file
rm TEST-DEPLOY.md
git add TEST-DEPLOY.md
git commit -m "Clean up: remove test deployment file"
git push origin dev

# Verify everything still works
pm2 list
curl http://localhost:8765
curl http://localhost:8766
```

## Success Criteria

All tests pass if:
- ✓ Webhooks trigger on push to dev and main
- ✓ Test deployments run automatically with migrations
- ✓ Production deployments run without migrations
- ✓ Manual migration script works with backups
- ✓ Rollback procedures work
- ✓ Error handling is appropriate
- ✓ Logs are clear and accessible
- ✓ Both applications remain stable

## Next Steps After Testing

1. Document any issues encountered
2. Update scripts if needed
3. Set up monitoring/alerting for deployments
4. Train team on new workflow
5. Disable old auto-deploy.sh cron job
6. Create deployment documentation (DEPLOYMENT.md)
