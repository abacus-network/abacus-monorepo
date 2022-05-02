import { createAgentGCPKeys } from '../src/agents/gcp';

import { getArgs, getDomainNames, getEnvironment } from './utils';

async function main() {
  const environment = await getEnvironment();
  const domainNames = await getDomainNames(environment);

  const { v: validatorCount } = await getArgs()
    .alias('v', 'validatorCount')
    .number('v')
    .demandOption('v').argv;

  return createAgentGCPKeys(environment, domainNames, validatorCount);
}

main().then(console.log).catch(console.error);
