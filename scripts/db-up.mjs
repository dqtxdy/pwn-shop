import { execSync } from 'child_process';

try {
  // Check if docker is available
  execSync('docker --version', { stdio: 'ignore' });
} catch (err) {
  console.error('\n❌ Error: Docker is not installed or not available on your PATH.');
  console.error('Docker Desktop or Docker Engine is required to run the local PostgreSQL database validation.');
  console.error('If Docker is unavailable, default API tests will skip the Postgres integration tests honestly.\n');
  process.exit(1);
}

try {
  console.log('🚀 Starting PostgreSQL container service using docker compose...');
  execSync('docker compose up -d db', { stdio: 'inherit' });
  console.log('✅ PostgreSQL container service started.\n');
} catch (err) {
  console.error('\n❌ Failed to start database container via docker compose.\n');
  process.exit(1);
}
