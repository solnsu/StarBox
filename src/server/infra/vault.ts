import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

export class LocalVault {
  private readonly key: Buffer;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const keyPath = path.join(dataDir, 'master.key');
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    }
    chmodSync(keyPath, 0o600);
    this.key = readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('Invalid local vault key');
  }

  encrypt(plainText: string, aad: string): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload, aad: string): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(payload.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
