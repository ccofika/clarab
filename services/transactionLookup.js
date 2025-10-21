const ethereumService = require('./blockchains/ethereum');
const bscService = require('./blockchains/bsc');
const polygonService = require('./blockchains/polygon');
const bitcoinService = require('./blockchains/bitcoin');
const solanaService = require('./blockchains/solana');
const tronService = require('./blockchains/tron');
const xrpService = require('./blockchains/xrp');
const litecoinService = require('./blockchains/litecoin');
const dogecoinService = require('./blockchains/dogecoin');
const bitcoinCashService = require('./blockchains/bitcoinCash');
const eosService = require('./blockchains/eos');

/**
 * Detect blockchain network based on transaction hash format
 */
function detectNetwork(hash) {
  // Remove any whitespace
  const cleanHash = hash.trim();

  // Ethereum/EVM chains (0x prefix + 64 hex chars)
  if (/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
    return 'evm'; // Will need additional detection for specific EVM chain
  }

  // Solana (Base58, typically 87-88 characters)
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(cleanHash)) {
    return 'solana';
  }

  // Bitcoin/Litecoin/Dogecoin/BCH (64 hex chars, no 0x prefix)
  if (/^[a-fA-F0-9]{64}$/.test(cleanHash)) {
    return 'bitcoin-like'; // Will try multiple chains
  }

  // Tron (Base58, starts with specific pattern, typically 64 chars)
  if (/^[a-fA-F0-9]{64}$/.test(cleanHash) || cleanHash.length === 64) {
    return 'tron-or-bitcoin';
  }

  // EOS (hex string, variable length)
  if (/^[a-fA-F0-9]+$/.test(cleanHash) && cleanHash.length >= 40) {
    return 'eos-or-other';
  }

  return 'unknown';
}

/**
 * Main transaction lookup function
 */
async function lookupTransaction(hash, suggestedNetwork = null) {
  try {
    const cleanHash = hash.trim();

    // If user suggested a network, try that first
    if (suggestedNetwork) {
      const result = await trySpecificNetwork(cleanHash, suggestedNetwork);
      if (result) return result;
    }

    // Auto-detect network
    const networkType = detectNetwork(cleanHash);

    switch (networkType) {
      case 'evm':
        // Try EVM chains in order: Ethereum, BSC, Polygon
        return await tryEVMChains(cleanHash);

      case 'solana':
        return await solanaService.getTransaction(cleanHash);

      case 'bitcoin-like':
      case 'tron-or-bitcoin':
        // Try Bitcoin-like chains and Tron
        return await tryBitcoinLikeAndTron(cleanHash);

      case 'eos-or-other':
        // Try XRP first (common), then EOS
        const xrpResult = await tryNetwork(xrpService, cleanHash);
        if (xrpResult) return xrpResult;

        const eosResult = await tryNetwork(eosService, cleanHash);
        if (eosResult) return eosResult;

        // Fallback: try all networks
        return await tryAllNetworks(cleanHash);

      default:
        // Try all networks as last resort
        return await tryAllNetworks(cleanHash);
    }
  } catch (error) {
    console.error('Transaction lookup error:', error);
    throw new Error('Failed to lookup transaction');
  }
}

/**
 * Try specific network suggested by user
 */
async function trySpecificNetwork(hash, network) {
  const networkMap = {
    'ethereum': ethereumService,
    'eth': ethereumService,
    'bsc': bscService,
    'bnb': bscService,
    'polygon': polygonService,
    'matic': polygonService,
    'bitcoin': bitcoinService,
    'btc': bitcoinService,
    'solana': solanaService,
    'sol': solanaService,
    'tron': tronService,
    'trx': tronService,
    'xrp': xrpService,
    'ripple': xrpService,
    'litecoin': litecoinService,
    'ltc': litecoinService,
    'dogecoin': dogecoinService,
    'doge': dogecoinService,
    'bitcoincash': bitcoinCashService,
    'bch': bitcoinCashService,
    'eos': eosService
  };

  const service = networkMap[network.toLowerCase()];
  if (service) {
    return await tryNetwork(service, hash);
  }
  return null;
}

/**
 * Try EVM chains (Ethereum, BSC, Polygon)
 * Try all in parallel and return the first valid result
 */
async function tryEVMChains(hash) {
  // Try all EVM chains in parallel for better performance
  const [ethResult, bscResult, polygonResult] = await Promise.allSettled([
    tryNetwork(ethereumService, hash),
    tryNetwork(bscService, hash),
    tryNetwork(polygonService, hash)
  ]);

  // Return first successful result (check BSC first as it's more common for tokens)
  if (bscResult.status === 'fulfilled' && bscResult.value && bscResult.value.amount !== 'NaN' && bscResult.value.amount !== '0') {
    return bscResult.value;
  }

  if (ethResult.status === 'fulfilled' && ethResult.value && ethResult.value.amount !== 'NaN' && ethResult.value.amount !== '0') {
    return ethResult.value;
  }

  if (polygonResult.status === 'fulfilled' && polygonResult.value && polygonResult.value.amount !== 'NaN' && polygonResult.value.amount !== '0') {
    return polygonResult.value;
  }

  // If all have amount 0 or NaN, return any non-null result
  if (bscResult.status === 'fulfilled' && bscResult.value) return bscResult.value;
  if (ethResult.status === 'fulfilled' && ethResult.value) return ethResult.value;
  if (polygonResult.status === 'fulfilled' && polygonResult.value) return polygonResult.value;

  return null;
}

/**
 * Try Bitcoin-like chains and Tron (and XRP)
 * Try all in parallel for better performance
 */
async function tryBitcoinLikeAndTron(hash) {
  // Try all chains in parallel
  const results = await Promise.allSettled([
    tryNetwork(bitcoinService, hash),
    tryNetwork(xrpService, hash),  // XRP early since it shares hash format
    tryNetwork(tronService, hash),
    tryNetwork(litecoinService, hash),
    tryNetwork(dogecoinService, hash),
    tryNetwork(bitcoinCashService, hash)
  ]);

  // Return first successful result
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }

  return null;
}

/**
 * Try all networks (last resort)
 */
async function tryAllNetworks(hash) {
  const services = [
    ethereumService,
    bscService,
    polygonService,
    bitcoinService,
    solanaService,
    tronService,
    xrpService,
    litecoinService,
    dogecoinService,
    bitcoinCashService,
    eosService
  ];

  for (const service of services) {
    const result = await tryNetwork(service, hash);
    if (result) return result;
  }

  throw new Error('Transaction not found on any supported network');
}

/**
 * Helper function to try a network and handle errors
 */
async function tryNetwork(service, hash) {
  try {
    const result = await service.getTransaction(hash);
    if (result && result.hash) {
      return result;
    }
    return null;
  } catch (error) {
    // Silently fail and try next network
    return null;
  }
}

module.exports = {
  lookupTransaction,
  detectNetwork
};
