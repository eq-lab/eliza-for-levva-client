import {
  AgentRuntime,
  Character,
  IAgentRuntime,
  logger,
  Plugin,
  RuntimeSettings,
  stringToUuid,
} from "@elizaos/core";

import { plugin as sqlPlugin } from "@elizaos/plugin-sql";

import {
  AgentServer,
  loadCharacterTryPath,
  jsonToCharacter,
} from "@elizaos/server";

import dotenv from "dotenv";
import project from "./";

const server = new AgentServer();
const { agents } = project;

async function loadEnvConfig(): Promise<RuntimeSettings> {
  dotenv.config();
  return process.env as RuntimeSettings;
}

function resolvePluginDependencies(
  availablePlugins: Map<string, Plugin>,
  isTestMode: boolean = false
): Plugin[] {
  const resolutionOrder: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(pluginName: string) {
    if (!availablePlugins.has(pluginName)) {
      logger.warn(
        `Plugin dependency "${pluginName}" not found and will be skipped.`
      );
      return;
    }
    if (visited.has(pluginName)) return;
    if (visiting.has(pluginName)) {
      logger.error(
        `Circular dependency detected involving plugin: ${pluginName}`
      );
      return;
    }

    visiting.add(pluginName);
    const plugin = availablePlugins.get(pluginName);
    if (plugin) {
      const deps = [...(plugin.dependencies || [])];
      if (isTestMode) {
        deps.push(...(plugin.testDependencies || []));
      }
      for (const dep of deps) {
        visit(dep);
      }
    }
    visiting.delete(pluginName);
    visited.add(pluginName);
    resolutionOrder.push(pluginName);
  }

  for (const name of availablePlugins.keys()) {
    if (!visited.has(name)) {
      visit(name);
    }
  }

  const finalPlugins = resolutionOrder
    .map((name) => availablePlugins.get(name))
    .filter((p) => p) as Plugin[];

  logger.info(
    `Final plugins being loaded: ${finalPlugins.map((p) => p.name).join(", ")}`
  );

  return finalPlugins;
}

async function startAgent(
  character: Character,
  server: AgentServer,
  init?: (runtime: IAgentRuntime) => Promise<void>,
  plugins?: (Plugin | string)[]
): Promise<IAgentRuntime> {
  character.id = stringToUuid(character.name);
  const loadedPlugins = new Map<string, Plugin>([[sqlPlugin.name, sqlPlugin]]);
  const pluginsToLoad = new Set<string>(character.plugins);

  for (const plugin of plugins ?? []) {
    if (typeof plugin === "string") {
      pluginsToLoad.add(plugin);
    } else {
      loadedPlugins.set(plugin.name, plugin);

      if (plugin.dependencies) {
        for (const dependency of plugin.dependencies) {
          pluginsToLoad.add(dependency);
        }
      }
    }
  }

  const availablePlugins = new Map<string, Plugin>(loadedPlugins);

  for (const name of pluginsToLoad) {
    if (availablePlugins.has(name)) {
      continue;
    }

    try {
      const p = (await import(name)).default;

      if ("name" in p) {
        availablePlugins.set(p.name, p);
      }
    } catch (e) {
      logger.error(`Failed to load plugin ${name}`, e);
    }
  }

  const final = resolvePluginDependencies(availablePlugins);

  const runtime = new AgentRuntime({
    character,
    plugins: final,
    settings: await loadEnvConfig(),
  });

  const initWrapper = async (runtime: IAgentRuntime) => {
    if (init) {
      await init(runtime);
    }
  };

  await initWrapper(runtime);

  await runtime.initialize();

  // Discover and run plugin schema migrations
  try {
    const migrationService = runtime.getService("database_migration");
    if (migrationService) {
      logger.info("Discovering plugin schemas for dynamic migration...");
      (migrationService as any).discoverAndRegisterPluginSchemas(final);

      logger.info("Running all plugin migrations...");
      await (migrationService as any).runAllPluginMigrations();
      logger.info("All plugin migrations completed successfully");
    } else {
      logger.warn(
        "DatabaseMigrationService not found - plugin schema migrations skipped"
      );
    }
  } catch (error) {
    logger.error("Failed to run plugin migrations:", error);
    throw error;
  }

  server.registerAgent(runtime);
  logger.log(`Started ${runtime.character.name} as ${runtime.agentId}`);
  return runtime;
}

async function stopAgent(runtime: IAgentRuntime, server: AgentServer) {
  await runtime.close();
  server.unregisterAgent(runtime.agentId);
  logger.info(`Agent ${runtime.agentId} stopped`);
}

async function main() {
  const postgresUrl = process.env.POSTGRES_URL;
  const port = Number(process.env.SERVER_PORT) || 3000;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL is not set");
  }

  await server.initialize({ postgresUrl });

  server.startAgent = (character) => startAgent(character, server);
  server.stopAgent = (runtime) => stopAgent(runtime, server);
  server.loadCharacterTryPath = loadCharacterTryPath;
  server.jsonToCharacter = jsonToCharacter;

  try {
    await server.start(port);
  } catch (e) {
    logger.error(`Failed to start server on port ${port}`, e);
    throw e;
  }

  for (const agent of agents) {
    await startAgent(agent.character, server, agent.init, agent.plugins);
  }
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
