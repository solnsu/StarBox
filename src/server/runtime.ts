import type { Server } from 'node:http';
import path from 'node:path';
import { createAppConfig, type AppConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createDatabase } from './infra/database.js';
import { LocalVault } from './infra/vault.js';
import { AuthRepository } from './repositories/auth-repository.js';
import { CreationRepository } from './repositories/creation-repository.js';
import { GatewayRepository } from './repositories/gateway-repository.js';
import { AuthService } from './services/auth-service.js';
import { CodexClientService } from './services/codex-client-service.js';
import { CreationService } from './services/creation-service.js';
import { GatewayService } from './services/gateway-service.js';
import { ModelPricingService } from './services/model-pricing-service.js';
import type { DesktopIntegration } from './desktop-integration.js';

export type ServerRuntime = {
  config: AppConfig;
  server: Server;
  close: () => Promise<void>;
};

export const startServer = (
  options: Parameters<typeof createAppConfig>[0] = {},
  desktopIntegration: DesktopIntegration = {},
): Promise<ServerRuntime> => {
  const config = createAppConfig(options);
  const database = createDatabase(config.dataDir);
  const vault = new LocalVault(config.dataDir);
  const pricingService = new ModelPricingService({
    cachePath: path.join(config.dataDir, 'model-pricing.json'),
    remoteUrl: config.pricingCatalogUrl,
  });
  const service = new AuthService(new AuthRepository(database), vault, {
    tenantId: config.tenantId,
    usageUrl: config.codexUsageUrl,
    timeoutMs: config.inspectionTimeoutMs,
    concurrency: config.inspectionConcurrency,
  });
  const gatewayService = new GatewayService(
    new GatewayRepository(database, pricingService),
    vault,
    service,
    pricingService,
    config.tenantId,
    `http://${config.host}:${config.port}/v1`,
  );
  const creationService = new CreationService(
    new CreationRepository(database),
    path.join(config.dataDir, 'generated-images'),
    config.tenantId,
  );
  const app = createHttpApp(
    service,
    gatewayService,
    config.webDir,
    creationService,
    new CodexClientService(gatewayService),
    desktopIntegration,
  );

  return pricingService.refresh(true).then(() => new Promise((resolve, reject) => {
    const handleStartupError = (error: Error) => {
      database.close();
      reject(error);
    };
    const server = app.listen(config.port, config.host, () => {
      server.off('error', handleStartupError);
      pricingService.start();
      console.log(`Codex Auth Console: http://${config.host}:${config.port}`);
      resolve({
        config,
        server,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close((error) => {
            pricingService.stop();
            database.close();
            if (error) closeReject(error);
            else closeResolve();
          });
        }),
      });
    });
    server.once('error', handleStartupError);
  }));
};
