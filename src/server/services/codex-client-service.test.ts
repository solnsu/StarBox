import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexClientService } from './codex-client-service.js';

describe('CodexClientService', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('writes the generated client files into CODEX_HOME', async () => {
    const codexHome = mkdtempSync(path.join(tmpdir(), 'codex-client-test-'));
    directories.push(codexHome);
    const service = new CodexClientService({
      getClientConfiguration: () => ({
        model: 'gpt-5.6-sol', kind: 'codex', apiKey: 'sk-test', endpoint: 'http://127.0.0.1:4312/v1',
        authJson: '{"OPENAI_API_KEY":"sk-test"}\n', secondaryFileName: 'config.toml',
        secondaryContent: 'model = "gpt-5.6-sol"\n',
      }),
    }, codexHome);

    await expect(service.apply('gpt-5.6-sol')).resolves.toMatchObject({
      model: 'gpt-5.6-sol', codexHome, files: ['auth.json', 'config.toml'],
    });
    expect(readFileSync(path.join(codexHome, 'auth.json'), 'utf8')).toContain('sk-test');
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain('gpt-5.6-sol');
  });

  it('rejects image client configurations', async () => {
    const codexHome = mkdtempSync(path.join(tmpdir(), 'codex-client-image-test-'));
    directories.push(codexHome);
    const service = new CodexClientService({
      getClientConfiguration: () => ({
        model: 'gpt-image-2', kind: 'image', apiKey: 'sk-test', endpoint: 'http://127.0.0.1:4312/v1',
        authJson: '{}\n', secondaryFileName: 'request.json', secondaryContent: '{}\n',
      }),
    }, codexHome);

    await expect(service.apply('gpt-image-2')).rejects.toThrow('CODEX_MODEL_REQUIRED');
  });
});
