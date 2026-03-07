import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { env } from '../env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const getSecretKey = () => {
  return createHash('sha256')
    .update(env.LLM_CREDENTIAL_SECRET ?? env.BETTER_AUTH_SECRET)
    .digest();
};

export const encryptSecret = (value: string) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getSecretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

export const decryptSecret = (value: string) => {
  const [ivText, authTagText, encryptedText] = value.split('.');

  if (!ivText || !authTagText || !encryptedText) {
    throw new Error('暗号化されたシークレットの形式が不正です。');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getSecretKey(),
    Buffer.from(ivText, 'base64url'),
  );

  decipher.setAuthTag(Buffer.from(authTagText, 'base64url'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};
