import { BridgeDeploy } from './bridge/BridgeDeploy';
import { CoreDeploy } from './core/CoreDeploy';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { AllConfigs } from './config';

export function updateProviderDomain(
  environment: string,
  directory: string,
  configs: AllConfigs[],
) {
  let ret = "import { OpticsDomain } from './domain';\n"
  const coreDeploys = configs.map(
    (_) => CoreDeploy.fromDirectory(directory, _.chain, _.coreConfig),
  );
  const bridgeDeploys = configs.map(
    (_) => BridgeDeploy.fromDirectory(directory, _.chain, _.bridgeConfig),
  );

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const bridgeDeploy = bridgeDeploys[i];
    const coreDeploy = coreDeploys[i];
    ret += `
export const ${config.chain.name}: OpticsDomain = {
  name: '${config.chain.name}',
  id: ${config.chain.domain},
  bridgeRouter: '${bridgeDeploy.contracts.bridgeRouter!.proxy.address}',${!!bridgeDeploy.contracts.ethHelper ? `\n  ethHelper: '${bridgeDeploy.contracts.ethHelper?.address}',` : ''}
  home: '${coreDeploy.contracts.home!.proxy.address}',
  governanceRouter: '${coreDeploy.contracts.governance!.proxy.address}',
  xAppConnectionManager: '${coreDeploy.contracts.xAppConnectionManager!.address}',
  replicas: [
${Object.keys(coreDeploy.contracts.replicas)
      .map(Number)
      .map((replicaDomain) => `    { domain: ${replicaDomain}, address: '${coreDeploy.contracts.replicas[replicaDomain].proxy.address}' },`
      ).join('\n')}
  ],
};\n`
  }

  ret += `\nexport const ${environment}Domains = [${configs.map(_ => _.chain.name).join(', ')}];`
  writeFileSync(resolve(__dirname, `../../optics-provider/src/optics/domains/${environment}.ts`), ret)
}
