const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.WEBHOOK_SECRET;
const LOG_DIR = '/var/log/deployments';

if (!SECRET) {
  console.error('ERROR: WEBHOOK_SECRET environment variable is not set');
  process.exit(1);
}

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error(`Failed to create log directory ${LOG_DIR}:`, err.message);
  }
}

function verifySignature(payload, signature) {
  if (!signature) {
    return false;
  }
  
  const hmac = crypto.createHmac('sha256', SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (err) {
    return false;
  }
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  const logFile = path.join(LOG_DIR, `webhook-${new Date().toISOString().split('T')[0]}.log`);
  try {
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

function executeDeployment(branch) {
  const scriptMap = {
    'main': './scripts/deploy-prod.sh'
  };
  
  const script = scriptMap[branch];
  if (!script) {
    log(`No deployment script configured for branch: ${branch}`);
    return;
  }
  
  log(`Starting deployment for branch: ${branch}`);
  log(`Executing: ${script}`);
  
  exec(script, { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      log(`Deployment failed for ${branch}: ${error.message}`);
      log(`stderr: ${stderr}`);
      return;
    }
    
    if (stderr) {
      log(`Deployment stderr for ${branch}: ${stderr}`);
    }
    
    log(`Deployment completed for ${branch}`);
    log(`stdout: ${stdout}`);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    const signature = req.headers['x-hub-signature-256'];
    
    if (!verifySignature(body, signature)) {
      log('Invalid webhook signature received');
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
      return;
    }
    
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (err) {
      log('Invalid JSON payload received');
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }
    
    // Handle push events
    if (req.headers['x-github-event'] === 'push') {
      const ref = payload.ref;
      const branch = ref.replace('refs/heads/', '');
      
      log(`Received push event for branch: ${branch}`);
      log(`Commit: ${payload.head_commit?.message || 'N/A'}`);
      log(`Author: ${payload.head_commit?.author?.name || 'N/A'}`);
      
      if (branch === 'main') {
        executeDeployment(branch);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'deployment triggered', branch }));
      } else {
        log(`Ignoring push to branch: ${branch}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ignored', branch }));
      }
    } else if (req.headers['x-github-event'] === 'ping') {
      log('Received ping event from GitHub');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'pong' }));
    } else {
      log(`Received unhandled event: ${req.headers['x-github-event']}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Webhook server listening on port ${PORT}`);
  log(`Ready to receive GitHub webhooks`);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down gracefully');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});
