import {
  getEnvironment,
  getCoreConfig,
  getCoreDirectory,
  registerDeployer,
} from './utils';
import { AbacusCoreDeployer } from '../src/core';

async function main() {
  const environment = await getEnvironment();
  const deployer = new AbacusCoreDeployer();
  await registerDeployer(deployer, environment);

  const config = await getCoreConfig(environment);
  await deployer.deploy(config);

  const outputDir = getCoreDirectory(environment);
  deployer.writeOutput(outputDir);
  deployer.writeRustConfigs(environment, outputDir);
}

main().then(console.log).catch(console.error);
