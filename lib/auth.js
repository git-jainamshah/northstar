import {randomBytes,createHash,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {COOKIE,SESSION_SECONDS,redis} from './ibkr-relay.js';
const scrypt=promisify(derive);
export const USER_KEY='northstar:auth:user:v1';
export const digest=s=>createHash('sha256').update(s).digest('hex');
export const newToken=()=>randomBytes(32).toString('hex');
export const validHash=h=>/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(h||'');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt$${salt}$${key.toString('hex')}`}
export async function verifyPassword(password,hash){if(!validHash(hash))return false;const [,salt,expected]=hash.split('$'),key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(key,Buffer.from(expected,'hex'))}
export function sessionToken(req){const v=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^v2\.[a-f0-9]{64}$/.test(v||'')?v:null}
export const sessionKey=t=>'northstar:auth:session:'+digest(t);
export const AUTH_SCRIPT="local s=redis.call('GET',KEYS[1]); local u=redis.call('GET',KEYS[2]); if not s or not u then return nil end; local user=cjson.decode(u); if s~=user.version then return nil end; redis.call('EXPIRE',KEYS[1],ARGV[1]); return user.email";
export async function authorize(req,env=process.env,store=redis){const token=sessionToken(req);if(!token)return null;const email=await store(['EVAL',AUTH_SCRIPT,2,sessionKey(token),USER_KEY,SESSION_SECONDS],env);return email?{email,token}:null}
export const RATE_SCRIPT="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n";
export const RESET_SCRIPT="local u=redis.call('GET',KEYS[1]); if not u or cjson.decode(u).version~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
