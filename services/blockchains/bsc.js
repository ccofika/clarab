const axios = require('axios');

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const BSCSCAN_API_URL = 'https://api.bscscan.com/api';

// Common BEP20 token contracts on BSC
const BEP20_TOKENS = {
  '0x55d398326f99059ff775485246999027b3197955': { symbol: 'USDT', name: 'Tether USD', decimals: 18 },
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { symbol: 'USDC', name: 'USD Coin', decimals: 18 },
  '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  '0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd': { symbol: 'LINK', name: 'Chainlink', decimals: 18 },
  '0x2859e4544c4bb03966803b044a93563bd2d0dd4d': { symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
  '0xbf5140a22578168fd562dccf235e5d43a02ce9b1': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  '0xcc42724c6683b7e57334c4e856f4c9965ed682bd': { symbol: 'POL', name: 'Polygon', decimals: 18 },
  '0x9678e42cebeb63f23197d726b29b1cb20d0064e5': { symbol: 'BUSD-T', name: 'BUSD Token', decimals: 18 }
};

/**
 * Get transaction details from BSC network
 */
async function getTransaction(txHash) {
  try {
    // Get basic transaction info
    const txResponse = await axios.get(BSCSCAN_API_URL, {
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
    const receiptResponse = await axios.get(BSCSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionReceipt',
        txhash: txHash,
        apikey: ETHERSCAN_API_KEY
      }
    });

    const receipt = receiptResponse.data.result;

    // Get block details for timestamp
    const blockResponse = await axios.get(BSCSCAN_API_URL, {
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

    // Check if it's a BEP20 transfer
    let tokenTransfer = null;
    if (receipt && receipt.logs && receipt.logs.length > 0) {
      // BEP20 Transfer event signature
      const transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const transferLog = receipt.logs.find(log => log.topics[0] === transferSignature);

      if (transferLog) {
        tokenTransfer = await parseBEP20Transfer(transferLog, txHash);
      }
    }

    // If it's a token transfer, use token data
    if (tokenTransfer) {
      return {
        hash: txHash,
        network: 'BSC',
        networkType: 'BEP20',
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

    // Native BNB transfer
    return {
      hash: txHash,
      network: 'BSC',
      networkType: 'Native',
      coin: 'BNB',
      tokenName: 'Binance Coin',
      contractAddress: null,
      from: tx.from,
      to: tx.to,
      amount: formatBNB(tx.value),
      timestamp: timestamp,
      dateTime: new Date(timestamp * 1000).toISOString(),
      status: receipt.status === '0x1' ? 'success' : 'failed',
      fee: calculateFee(tx.gasPrice, receipt.gasUsed),
      blockNumber: parseInt(tx.blockNumber, 16)
    };

  } catch (error) {
    console.error('BSC lookup error:', error.message);
    return null;
  }
}

/**
 * Parse BEP20 transfer from log
 */
async function parseBEP20Transfer(log, txHash) {
  const contractAddress = log.address.toLowerCase();

  // Get token info from cache or API
  let tokenInfo = BEP20_TOKENS[contractAddress];

  if (!tokenInfo) {
    // Fetch token info from BscScan
    tokenInfo = await getTokenInfo(contractAddress);
  }

  // Parse transfer event
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
 * Get token info from BscScan API
 */
async function getTokenInfo(contractAddress) {
  try {
    const symbolResponse = await axios.get(BSCSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: contractAddress,
        data: '0x95d89b41', // symbol() function signature
        apikey: ETHERSCAN_API_KEY
      }
    });

    const decimalsResponse = await axios.get(BSCSCAN_API_URL, {
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
  return (feeWei / 1e18).toFixed(6) + ' BNB';
}

/**
 * Format wei to BNB
 */
function formatBNB(weiHex) {
  const wei = parseInt(weiHex, 16);
  return (wei / 1e18).toString();
}

module.exports = {
  getTransaction
};
