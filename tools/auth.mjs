import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './build.mjs';

export function authEnvironment() {
  const env = {...process.env};
  // Only the user's explicit CLI login may be used, never inherited API credentials.
  for (const key of ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_HOST']) delete env[key];
  const gitDirectory=path.join(env.HOME || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback');
  if (existsSync(path.join(gitDirectory,'git'))) env.PATH=`${gitDirectory}${path.delimiter}${env.PATH || ''}`;
  env.GH_PROMPT_DISABLED='1';
  return env;
}
export async function findCli() {
  for (const file of [path.join(ROOT,'.manager/bin/gh'),'/opt/homebrew/bin/gh','/usr/local/bin/gh']) {
    if (await access(file).then(()=>true).catch(()=>false)) return file;
  }
  return 'gh';
}
export function createGitHubAuth({run=promisify(execFile),request=fetch,locate=findCli}={}) {
  async function getToken() {
    try {
      const {stdout}=await run(await locate(),['auth','token','--hostname','github.com','--user','moribetakehito'],{env:authEnvironment(),timeout:15000,maxBuffer:65536});
      const value=String(stdout).trim();
      if (!value || /[\r\n]/.test(value)) throw new Error();
      return value;
    } catch {
      // Child-process errors may contain stdout; never propagate them to the UI/logs.
      throw new Error('GitHubへの接続が必要です。「GitHubに接続」からブラウザ認証を完了してください。');
    }
  }
  async function status() {
    let value;
    try { value=await getToken(); } catch {return {connected:false};}
    try {
      const res=await request('https://api.github.com/user',{headers:{Authorization:`Bearer ${value}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
      if (!res.ok) return {connected:false};
      const user=await res.json();
      if (user.login!=='moribetakehito') return {connected:false};
      return {connected:true,login:user.login};
    } catch {return {connected:false,unavailable:true};}
  }
  return {getToken,status};
}
