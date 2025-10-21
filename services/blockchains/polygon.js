const axios = require('axios');

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
// PolygonScan now uses Etherscan API V2 - same API key works for all chains
const POLYGONSCAN_API_URL = 'https://api.polygonscan.com/api';

// Common tokens on Polygon
const POLYGON_TOKENS = {
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': { symbol: 'WMATIC', name: 'Wrapped Matic', decimals: 18 }
};

/**
 * Get transaction details from Polygon network
 */
async function getTransaction(txHash) {
  try {
    // Get basic transaction info
    const txResponse = await axios.get(POLYGONSCAN_API_URL, {
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
    const receiptResponse = await axios.get(POLYGONSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionReceipt',
        txhash: txHash,
        apikey: ETHERSCAN_API_KEY
      }
    });

    const receipt = receiptResponse.data.result;

    // Get block details for timestamp
    const blockResponse = await axios.get(POLYGONSCAN_API_URL, {
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

    // Check if it's a token transfer
    let tokenTransfer = null;
    if (receipt && receipt.logs && receipt.logs.length > 0) {
      const transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const transferLog = receipt.logs.find(log => log.topics[0] === transferSignature);

      if (transferLog) {
        tokenTransfer = await parseTokenTransfer(transferLog, txHash);
      }
    }

    // If it's a token transfer, use token data
    if (tokenTransfer) {
      return {
        hash: txHash,
        network: 'Polygon',
        networkType: 'Polygon',
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

    // Native MATIC transfer
    return {
      hash: txHash,
      network: 'Polygon',
      networkType: 'Native',
      coin: 'MATIC',
      tokenName: 'Polygon',
      contractAddress: null,
      from: tx.from,
      to: tx.to,
      amount: formatMatic(tx.value),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: receipt.status === '0x1' ? 'success' : 'failed',
      fee: calculateFee(tx.gasPrice, receipt.gasUsed),
      blockNumber: parseInt(tx.blockNumber, 16)
    };

  } catch (error) {
    console.error('Polygon lookup error:', error.message);
    return null;
  }
}

/**
 * Parse token transfer from log
 */
async function parseTokenTransfer(log, txHash) {
  const contractAddress = log.address.toLowerCase();
  let tokenInfo = POLYGON_TOKENS[contractAddress];

  if (!tokenInfo) {
    tokenInfo = await getTokenInfo(contractAddress);
  }

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
 * Get token info from PolygonScan API
 */
async function getTokenInfo(contractAddress) {
  try {
    const symbolResponse = await axios.get(POLYGONSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x95d89b41',
        apikey: ETHERSCAN_API_KEY
      }
    });

    const decimalsResponse = await axios.get(POLYGONSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x313ce567',
        apikey: ETHERSCAN_API_KEY
      }
    });

    const decimals = parseInt(decimalsResponse.data.result, 16);

    return {
      symbol: parseString(symbolResponse.data.result),
      name: parseString(symbolResponse.data.result),
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

function calculateFee(gasPrice, gasUsed) {
  const gasPriceNum = parseInt(gasPrice, 16);
  const gasUsedNum = parseInt(gasUsed, 16);
  const feeWei = gasPriceNum * gasUsedNum;
  return (feeWei / 1e18).toFixed(6) + ' MATIC';
}

function formatMatic(weiHex) {
  const wei = parseInt(weiHex, 16);
  return (wei / 1e18).toString();
}

module.exports = {
  getTransaction
};
