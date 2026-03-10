/**
 * Prisma Service
 * Detecta mudanças no schema.prisma e executa migrations.
 * Usa o serviço `prisma-migrate` do docker-compose se existir,
 * caso contrário usa `npx prisma migrate deploy` como fallback.
 * 
 * @agent DevOps Agent / Backend Agent
 */

'use strict';

const path         = require('path');
const { spawnCmd } = require('./docker');
const git          = require('./git');

// Lê env dinamicamente — nunca em nível de módulo para evitar ENOENT por ordem de carregamento
function getPrismaEnv() {
  return {
    schemaPath:    process.env.PRISMA_SCHEMA_PATH || '',
    repoPath:      process.env.REPO_PATH          || process.cwd(),
    composeFile:   process.env.COMPOSE_FILE       || '',
    prismaService: process.env.PRISMA_SERVICE     || 'prisma-migrate',
  };
}

/**
 * Verifica se houve mudança no schema.prisma no último commit.
 * Retorna true se houve diff.
 */
async function hasSchemaChanged() {
  const { schemaPath, repoPath } = getPrismaEnv();
  if (!schemaPath) return false;

  const relPath = schemaPath.startsWith(repoPath)
    ? schemaPath.slice(repoPath.length).replace(/^[/\\]/, '')
    : path.basename(schemaPath);

  try {
    const diff = await git.diffFile(relPath);
    return diff.length > 0;
  } catch {
    return false;
  }
}

/**
 * Executa migrations.
 * Estratégia 1: docker compose run --rm prisma-migrate (se existir no compose)
 * Estratégia 2: npx prisma migrate deploy (fallback)
 */
async function runMigrations(onLine) {
  const { repoPath, composeFile, prismaService, schemaPath } = getPrismaEnv();
  const caArgs = composeFile ? ['-f', composeFile] : [];

  // Verifica se o serviço de migration existe no compose
  const checkResult = await spawnCmd(
    'docker', ['compose', ...caArgs, 'config', '--services'],
    { cwd: repoPath }
  );
  const services = checkResult.stdout.split('\n').map(s => s.trim()).filter(Boolean);

  let result;
  if (services.includes(prismaService)) {
    result = await spawnCmd(
      'docker', ['compose', ...caArgs, 'run', '-T', '--rm', prismaService],
      { cwd: repoPath },
      onLine
    );
  } else {
    const schemaFlag = schemaPath ? ['--schema', schemaPath] : [];
    result = await spawnCmd(
      'npx', ['prisma', 'migrate', 'deploy', ...schemaFlag],
      { cwd: repoPath },
      onLine
    );
  }

  if (result.code !== 0) {
    throw new Error(`prisma migrate falhou (exit ${result.code})\n${result.stderr}`);
  }
  return result;
}

module.exports = { hasSchemaChanged, runMigrations };
