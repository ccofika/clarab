const axios = require('axios');

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';

// Common ERC20 token contracts
const ERC20_TOKENS = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0x4d224452801aced8b2f0aebe155379bb5d594381': { symbol: 'APE', name: 'ApeCoin', decimals: 18 },
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': { symbol: 'BUSD', name: 'Binance USD', decimals: 18 },
  '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b': { symbol: 'CRO', name: 'Cronos', decimals: 8 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', name: 'Chainlink', decimals: 18 },
  '0x3845badade8e6dff049820680d1f14bd3903a5d0': { symbol: 'SAND', name: 'The Sandbox', decimals: 18 },
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': { symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6': { symbol: 'POL', name: 'Polygon', decimals: 18 }
};

/**
 * Get transaction details from Ethereum network
 */
async function getTransaction(txHash) {
  try {
    // Get basic transaction info
    const txResponse = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash: txHash,
        apikey: ETHERSCAN_API_KEY
      }
    });

    const tx = txResponse.data.result;

    if (!tx) {
      return null;
    }

    // Get transaction receipt for status and logs
    const receiptResponse = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionReceipt',
        txhash: txHash,
        apikey: ETHERSCAN_API_KEY
      }
    });

    const receipt = receiptResponse.data.result;

    // Get block details for timestamp
    const blockResponse = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: tx.blockNumber,
        boolean: 'false',
        apikey: ETHERSCAN_API_KEY
      }
    });

    const block = blockResponse.data.result;
    // Block timestamp can be in hex or decimal format
    let timestamp;
    if (block.timestamp) {
      // If it's in hex format
      timestamp = block.timestamp.startsWith('0x')
        ? parseInt(block.timestamp, 16)
        : parseInt(block.timestamp, 10);
    } else {
      // Fallback to current time if timestamp not available
      timestamp = Math.floor(Date.now() / 1000);
    }

    // Check if it's an ERC20 transfer
    let tokenTransfer = null;
    if (receipt && receipt.logs && receipt.logs.length > 0) {
      // ERC20 Transfer event signature
      const transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const transferLog = receipt.logs.find(log => log.topics[0] === transferSignature);

      if (transferLog) {
        tokenTransfer = await parseERC20Transfer(transferLog, txHash);
      }
    }

    // If it's a token transfer, use token data
    if (tokenTransfer) {
      return {
        hash: txHash,
        network: 'Ethereum',
        networkType: 'ERC20',
        coin: tokenTransfer.symbol,
        tokenName: tokenTransfer.name,
        contractAddress: tokenTransfer.contract,
        from: tokenTransfer.from,
        to: tokenTransfer.to,
        amount: tokenTransfer.amount,
        timestamp: timestamp,
        dateTime: new Date(timestamp * 1000).toISOString(),
        status: receipt.status === '0x1' ? 'success' : 'failed',
        fee: calculateFee(tx.gasPrice, receipt.gasUsed),
        blockNumber: parseInt(tx.blockNumber, 16)
      };
    }

    // Native ETH transfer
    return {
      hash: txHash,
      network: 'Ethereum',
      networkType: 'Native',
      coin: 'ETH',
      tokenName: 'Ethereum',
      contractAddress: null,
      from: tx.from,
      to: tx.to,
      amount: formatEther(tx.value),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: receipt.status === '0x1' ? 'success' : 'failed',
      fee: calculateFee(tx.gasPrice, receipt.gasUsed),
      blockNumber: parseInt(tx.blockNumber, 16)
    };

  } catch (error) {
    console.error('Ethereum lookup error:', error.message);
    return null;
  }
}

/**
 * Parse ERC20 transfer from log
 */
async function parseERC20Transfer(log, txHash) {
  const contractAddress = log.address.toLowerCase();

  // Get token info from cache or API
  let tokenInfo = ERC20_TOKENS[contractAddress];

  if (!tokenInfo) {
    // Fetch token info from Etherscan
    tokenInfo = await getTokenInfo(contractAddress);
  }

  // Parse transfer event
  // topics[1] = from address, topics[2] = to address, data = amount
  const from = '0x' + log.topics[1].slice(26);
  const to = '0x' + log.topics[2].slice(26);

  // Parse amount - log.data should be hex string
  let amount = 0;
  if (log.data && log.data !== '0x') {
    const hexValue = log.data.startsWith('0x') ? log.data.slice(2) : log.data;
    amount = parseInt(hexValue, 16);
  }

  const decimals = tokenInfo?.decimals || 18;
  const formattedAmount = isNaN(amount) ? '0' : (amount / Math.pow(10, decimals)).toFixed(6);

  return {
    contract: contractAddress,
    symbol: tokenInfo?.symbol || 'UNKNOWN',
    name: tokenInfo?.name || 'Unknown Token',
    from: from,
    to: to,
    amount: formattedAmount,
    decimals: decimals
  };
}

/**
 * Get token info from Etherscan API
 */
async function getTokenInfo(contractAddress) {
  try {
    // Get token name
    const nameResponse = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x06fdde03', // name() function signature
        apikey: ETHERSCAN_API_KEY
      }
    });

    // Get token symbol
    const symbolResponse = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x95d89b41', // symbol() function signature
        apikey: ETHERSCAN_API_KEY
      }
    });

    // Get token decimals
    const decimalsResponse = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x313ce567', // decimals() function signature
        apikey: ETHERSCAN_API_KEY
      }
    });

    const decimals = parseInt(decimalsResponse.data.result, 16);

    return {
      symbol: parseString(symbolResponse.data.result),
      name: parseString(nameResponse.data.result),
      decimals: decimals
    };
  } catch (error) {
    return {
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 18
    };
  }
}

/**
 * Parse hex string response
 */
function parseString(hexData) {
  if (!hexData || hexData === '0x') return '';
  try {
    const hex = hexData.slice(2);
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substr(i, 2), 16);
      if (code !== 0) str += String.fromCharCode(code);
    }
    return str.trim();
  } catch (error) {
    return '';
  }
}

/**
 * Calculate transaction fee
 */
function calculateFee(gasPrice, gasUsed) {
  const gasPriceNum = parseInt(gasPrice, 16);
  const gasUsedNum = parseInt(gasUsed, 16);
  const feeWei = gasPriceNum * gasUsedNum;
  return (feeWei / 1e18).toFixed(6) + ' ETH';
}

/**
 * Format wei to ether
 */
function formatEther(weiHex) {
  const wei = parseInt(weiHex, 16);
  return (wei / 1e18).toString();
}

module.exports = {
  getTransaction
};
