import { ethers } from 'ethers';
import { Domain } from './domains';
import { StaticCeloJsonRpcProvider } from 'celo-ethers-provider';

type Provider = ethers.providers.Provider;

/**
 * The MultiProvider manages a collection of [Domains]{@link Domain} and allows
 * developers to enroll ethers Providers and Signers for each domain. It is
 * intended to enable faster multi-chain development by grouping all chain
 * connections under a single roof.
 *
 * @example
 * import {mainnet} from '@abacus-network/sdk';
 * mainnet.registerRpcProvider('celo', 'https://forno.celo.org');
 * mainnet.registerRpcProvider('polygon', '...');
 * mainnet.registerRpcProvider('ethereum', '...');
 * mainnet.registerSigner('celo', celoProvider);
 * mainnet.registerSigner('polygon', polygonProvider);
 * mainnet.registerSigner('ethereum', ethereumProvider);
 */
export class MultiProvider {
  private domains: Map<number, Domain>;
  private providers: Map<number, Provider>;
  private signers: Map<number, ethers.Signer>;

  constructor() {
    this.domains = new Map();
    this.providers = new Map();
    this.signers = new Map();
  }

  /**
   * Resgister a domain with the MultiProvider. This allows the multiprovider
   * to resolves tha domain info, and reference it by name or number.
   *
   * @param domain The Domain object to register.
   */
  registerDomain(domain: Domain): void {
    this.domains.set(domain.id, domain);
  }

  get domainNumbers(): number[] {
    return Array.from(this.domains.keys());
  }

  get missingProviders(): number[] {
    const numbers = this.domainNumbers;
    return numbers.filter((number) => this.providers.has(number));
  }

  /**
   * Resolve a domain name (or number) to the canonical number.
   *
   * This function is used extensively to disambiguate domains, and allows
   * devs to reference domains using their preferred nomenclature.
   *
   * @param nameOrDomain A domain name or number.
   * @returns The canonical domain number.
   */
  resolveDomain(nameOrDomain: string | number): number {
    if (typeof nameOrDomain === 'string') {
      const domains = Array.from(this.domains.values()).filter(
        (domain) => domain.name.toLowerCase() === nameOrDomain.toLowerCase(),
      );
      if (domains.length === 0) {
        throw new Error(`Domain not found: ${nameOrDomain}`);
      }
      return domains[0].id;
    } else {
      return nameOrDomain;
    }
  }

  /**
   * Check whether the {@link MultiProvider} is aware of a domain.
   *
   * @param nameOrDomain A domain name or number.
   * @returns true if the {@link Domain} has been registered, else false.
   */
  knownDomain(nameOrDomain: string | number): boolean {
    try {
      this.resolveDomain(nameOrDomain);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get the registered {@link Domain} object (if any)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A {@link Domain} (if the domain has been registered)
   */
  getDomain(nameOrDomain: number | string): Domain | undefined {
    return this.domains.get(this.resolveDomain(nameOrDomain));
  }

  /**
   * Get the registered {@link Domain} object (or error)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A {@link Domain}
   * @throws if the domain has not been registered
   */
  mustGetDomain(nameOrDomain: number | string): Domain {
    const domain = this.getDomain(nameOrDomain);
    if (!domain) {
      throw new Error(`Domain not found: ${nameOrDomain}`);
    }

    return domain;
  }

  /**
   * Resolve the name of a registered {@link Domain}, from its name or number.
   *
   * Similar to `resolveDomain`.
   *
   * @param nameOrDomain A domain name or number.
   * @returns The name (or undefined)
   */
  resolveDomainName(nameOrDomain: string | number): string | undefined {
    return this.getDomain(nameOrDomain)?.name;
  }

  /**
   * Register an ethers Provider for a specified domain.
   *
   * @param nameOrDomain A domain name or number.
   * @param provider An ethers Provider to be used by requests to that domain.
   */
  registerProvider(nameOrDomain: string | number, provider: Provider): void {
    const domain = this.mustGetDomain(nameOrDomain).id;
    try {
      const signer = this.signers.get(domain);
      if (signer) {
        this.signers.set(domain, signer.connect(provider));
      }
    } catch (e) {
      this.unregisterSigner(domain);
    }
    this.providers.set(domain, provider);
  }

  /**
   * Shortcut to register a provider by its HTTP RPC URL.
   *
   * @param nameOrDomain A domain name or number.
   * @param rpc The HTTP RPC Url
   */
  registerRpcProvider(nameOrDomain: string | number, rpc: string): void {
    const domain = this.resolveDomain(nameOrDomain);
    const celoNames = ['alfajores', 'celo'];
    for (const name of celoNames) {
      if (nameOrDomain === name) {
        const provider = new StaticCeloJsonRpcProvider(rpc);
        this.registerProvider(domain, provider);
        return;
      }
    }
    const provider = new ethers.providers.StaticJsonRpcProvider(rpc);
    this.registerProvider(domain, provider);
  }

  /**
   * Get the Provider associated with a doman (if any)
   *
   * @param nameOrDomain A domain name or number.
   * @returns The currently registered Provider (or none)
   */
  getProvider(nameOrDomain: string | number): Provider | undefined {
    const domain = this.resolveDomain(nameOrDomain);

    return this.providers.get(domain);
  }

  /**
   * Get the Provider associated with a doman (or error)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A Provider
   * @throws If no provider has been registered for the specified domain
   */
  mustGetProvider(nameOrDomain: string | number): Provider {
    const provider = this.getProvider(nameOrDomain);
    if (!provider) {
      throw new Error('unregistered name or domain');
    }
    return provider;
  }

  /**
   * Register an ethers Signer for a specified domain.
   *
   * @param nameOrDomain A domain name or number.
   * @param signer An ethers Signer to be used by requests to that domain.
   */
  registerSigner(nameOrDomain: string | number, signer: ethers.Signer): void {
    const domain = this.resolveDomain(nameOrDomain);

    const provider = this.providers.get(domain);
    if (!provider && !signer.provider) {
      throw new Error('Must have a provider before registering signer');
    }

    if (provider) {
      try {
        signer = signer.connect(provider);
        this.signers.set(domain, signer.connect(provider));
        return;
      } catch (_) {
        // do nothing
      }
    }
    if (!signer.provider) {
      throw new Error('Signer does not permit reconnect and has no provider');
    }
    // else and fallback
    this.registerProvider(domain, signer.provider);
    this.signers.set(domain, signer);
  }

  /**
   * Remove the registered ethers Signer from a domain. This function will
   * attempt to preserve any Provider that was previously connected to this
   * domain.
   *
   * @param nameOrDomain A domain name or number.
   */
  unregisterSigner(nameOrDomain: string | number): void {
    const domain = this.resolveDomain(nameOrDomain);
    if (!this.signers.has(domain)) {
      return;
    }

    const signer = this.signers.get(domain);
    if (signer == null || signer.provider == null) {
      throw new Error('signer was missing provider. How?');
    }

    this.signers.delete(domain);
    if (!this.getProvider(nameOrDomain)) {
      this.providers.set(domain, signer.provider);
    }
  }

  /**
   * Clear all signers from all registered domains.
   */
  clearSigners(): void {
    this.domainNumbers.forEach((domain) => this.unregisterSigner(domain));
  }

  /**
   * A shortcut for registering a basic local privkey signer on a domain.
   *
   * @param nameOrDomain A domain name or number.
   * @param privkey A private key string passed to `ethers.Wallet`
   */
  registerWalletSigner(nameOrDomain: string | number, privkey: string): void {
    const domain = this.resolveDomain(nameOrDomain);

    const wallet = new ethers.Wallet(privkey);
    this.registerSigner(domain, wallet);
  }

  /**
   * Return the signer registered to a domain (if any).
   *
   * @param nameOrDomain A domain name or number.
   * @returns The registered signer (or undefined)
   */
  getSigner(nameOrDomain: string | number): ethers.Signer | undefined {
    const domain = this.resolveDomain(nameOrDomain);
    return this.signers.get(domain);
  }

  /**
   * Returns the most priveleged connection registered to a domain. E.g.
   * this function will attempt to return a Signer, then attempt to return the
   * Provider (if no Signer is registered). If neither Signer nor Provider is
   * registered for a domain, it will return undefined
   *
   * @param nameOrDomain A domain name or number.
   * @returns A Signer (if any), otherwise a Provider (if any), otherwise
   *          undefined
   */
  getConnection(
    nameOrDomain: string | number,
  ): ethers.Signer | ethers.providers.Provider | undefined {
    return this.getSigner(nameOrDomain) ?? this.getProvider(nameOrDomain);
  }

  /**
   * Resolves the address of a Signer on a domain (or undefined, if no Signer)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A Promise for the address of the registered signer (if any)
   */
  async getAddress(nameOrDomain: string | number): Promise<string | undefined> {
    const signer = this.getSigner(nameOrDomain);
    return await signer?.getAddress();
  }
}
