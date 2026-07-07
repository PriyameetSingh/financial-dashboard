// Place this file at the ROOT of the hudd-dashboard repo as "Jenkinsfile"
// Jenkins will auto-detect it via the Multibranch Pipeline job created from repos.json.
//
// On every push to dev: builds and redeploys the Next.js app on the Dev_Airawat
// server (13.203.18.97) via pm2 on port 8766.
// .env / .env.prod.local on the server are preserved (never committed, never reset).

pipeline {
    agent any

    options {
        timestamps()
        ansiColor('xterm')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 20, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                echo "Building hudd-dashboard: ${env.BRANCH_NAME} @ ${env.GIT_COMMIT}"
                checkout scm
            }
        }

        stage('Deploy') {
            // Explicit branch guard — do not rely solely on repos.json to filter branches.
            when {
                branch 'dev'
            }
            steps {
                sh '''
                    set -e
                    DEPLOY_PATH=/home/ec2-user/hudd-dashboard

                    echo "Deploying hudd-dashboard (${BRANCH_NAME}) to 13.203.18.97:${DEPLOY_PATH}..."

                    ssh -i /var/jenkins_home/.ssh/product-dev.pem \
                        -o StrictHostKeyChecking=no -o ConnectTimeout=20 \
                        ec2-user@13.203.18.97 bash << EOF
                        set -e
                        cd ${DEPLOY_PATH}

                        echo ">> Pulling latest code..."
                        git fetch origin ${BRANCH_NAME}
                        git reset --hard origin/${BRANCH_NAME}

                        echo ">> Installing dependencies..."
                        npm ci

                        echo ">> Building and restarting..."
                        npm run redeploy:test

                        echo ">> Status:"
                        pm2 show hudd-dashboard-test | grep -E "status|uptime|restarts"
EOF
                '''
            }
        }
    }

    post {
        success {
            echo "✅ hudd-dashboard deployed -> http://13.203.18.97:8766/hudd-dashboard"
        }
        failure {
            echo "❌ hudd-dashboard deploy failed — check logs above"
        }
        always {
            cleanWs()
        }
    }
}
