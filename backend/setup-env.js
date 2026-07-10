const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('.env already exists in backend/, skipping setup.');
  process.exit(0);
}

console.log('Generating RSA keypair for JWT (RS256)...');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Using multiline representation inside double quotes for dotenv to process properly
const envContent = `# Database
DATABASE_URL=postgresql://housie_user:housie_password@localhost:5432/housie_ghar

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_PRIVATE_KEY="${privateKey.trim().replace(/\r?\n/g, '\\n')}"
JWT_PUBLIC_KEY="${publicKey.trim().replace(/\r?\n/g, '\\n')}"
JWT_EXPIRY=24h

# Application
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Admin Seed
SUPERADMIN_EMAIL=superadmin@housieghar.in
SUPERADMIN_TEMP_PASSWORD=Enterhg@01

# Security
LOCK_DURATION_MINUTES=10
MAX_LOCK_ATTEMPTS_PER_MINUTE=5
SPAM_FLAG_THRESHOLD=3
LOW_BALANCE_THRESHOLD=500
`;

fs.writeFileSync(envPath, envContent, 'utf8');
console.log('Successfully created .env in backend/ with generated JWT RSA keys!');
