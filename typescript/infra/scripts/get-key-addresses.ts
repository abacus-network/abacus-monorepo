import { getAgentConfig, getEnvironment } from './utils';
import { getAllKeys } from '../src/agents/key-utils';

async function main() {
  const environment = await getEnvironment();
  const agentConfig = await getAgentConfig(environment);

  const keys = getAllKeys(agentConfig);

  const keyInfos = await Promise.all(
    keys.map(async (key) => {
      let address = '';
      try {
        await key.fetch();
        address = key.address;
      } catch (e) {}
      return {
        identifier: key.identifier,
        address,
      };
    }),
  );

  console.log('Keys:', JSON.stringify(keyInfos, null, 2));
}

main().catch(console.error);
