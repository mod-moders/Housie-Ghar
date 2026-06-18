module.exports = {
  apps: [
    {
      name: 'housieghar-backend',
      script: './dist/backend/src/server.js',
      // Single instance — in-memory ActiveGame map and Socket.io rooms
      // must not be sharded across workers.
      instances: 1,
      // Auto-restart if the process exceeds 512 MB (guards against a slow
      // game-engine memory leak taking down Postgres/Redis on the same box).
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
