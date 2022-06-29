import { HelloWorldApp } from '@abacus-network/helloworld';
import { ChainName, Chains } from '@abacus-network/sdk';

import { sleep } from '../../src/utils/utils';
import { getCoreEnvironmentConfig, getEnvironment } from '../utils';

import { getApp } from './utils';

async function main() {
  const environment = await getEnvironment();
  const coreConfig = getCoreEnvironmentConfig(environment);
  const app = await getApp(coreConfig);
  const chains = app.chains() as Chains[];
  const skip = process.env.CHAINS_TO_SKIP?.split(',').filter(
    (skipChain) => skipChain.length > 0,
  );

  const invalidChains = skip?.filter(
    (skipChain: any) => !chains.includes(skipChain),
  );
  if (invalidChains && invalidChains.length > 0) {
    throw new Error(`Invalid chains to skip ${invalidChains}`);
  }

  let failureOccurred = false;

  const sources = chains.filter((chain) => !skip || !skip.includes(chain));
  for (const source of sources) {
    for (const destination of sources.slice().filter((d) => d !== source)) {
      try {
        await sendMessage(app, source, destination);
      } catch (err) {
        console.error(
          `Error sending message from ${source} to ${destination}, continuing...`,
          err,
        );
        failureOccurred = true;
      }
      // Sleep 500ms to avoid race conditions where nonces are reused
      await sleep(500);
    }
  }

  if (failureOccurred) {
    console.error('Failure occurred at least once');
    process.exit(1);
  }
}

async function sendMessage(
  app: HelloWorldApp<any>,
  source: ChainName,
  destination: ChainName,
) {
  console.log(`Sending message from ${source} to ${destination}`);
  const receipt = await app.sendHelloWorld(source, destination, `Hello!`);
  console.log(JSON.stringify(receipt.events || receipt.logs));
}

main()
  .then(() => console.info('HelloWorld sent'))
  .catch(console.error);
