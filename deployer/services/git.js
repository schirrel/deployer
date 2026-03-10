/**
 * Git Service
 * Wrapper para comandos git usando child_process.spawn.
 * 
 * @agent DevOps Agent
 */

'use strict';

const { spawnCmd } = require('./docker');

// Lê env dinamicamente para evitar problemas de ordem de carregamento de módulos
function getGitEnv() {
  return {
    repoPath:  process.env.REPO_PATH  || process.cwd(),
    gitBranch: process.env.GIT_BRANCH || 'main',
  };
}

/**
 * Retorna o hash do commit atual (HEAD).
 */
async function getCurrentHash() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
  if (result.code !== 0) throw new Error('git rev-parse HEAD falhou');
  return result.stdout.trim();
}

async function getPreviousHash() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd('git', ['rev-parse', 'HEAD~1'], { cwd: repoPath });
  if (result.code !== 0) throw new Error('git rev-parse HEAD~1 falhou');
  return result.stdout.trim();
}

async function pull(onLine) {
  const { repoPath, gitBranch } = getGitEnv();
  const result = await spawnCmd(
    'git', ['pull', 'origin', gitBranch],
    { cwd: repoPath },
    onLine
  );
  if (result.code !== 0) throw new Error(`git pull falhou (exit ${result.code})`);
  return result;
}

async function checkout(hash, onLine) {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['checkout', hash],
    { cwd: repoPath },
    onLine
  );
  if (result.code !== 0) throw new Error(`git checkout ${hash} falhou`);
  return result;
}

async function diffFile(filePath) {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['diff', 'HEAD~1', 'HEAD', '--', filePath],
    { cwd: repoPath }
  );
  return result.stdout.trim();
}

async function getLastCommitInfo() {
  const { repoPath } = getGitEnv();
  const result = await spawnCmd(
    'git', ['log', '-1', '--pretty=format:%H|%s|%an|%ar'],
    { cwd: repoPath }
  );
  if (result.code !== 0) return null;
  const [hash, subject, author, relTime] = result.stdout.trim().split('|');
  return { hash, subject, author, relTime };
}

module.exports = {
  getCurrentHash,
  getPreviousHash,
  pull,
  checkout,
  diffFile,
  getLastCommitInfo,
};
