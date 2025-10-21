const axios = require('axios');

const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
const TRONGRID_API_URL = 'https://api.trongrid.io';

// Common TRC20 token contracts
const TRC20_TOKENS = {
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT', name: 'Tether USD', decimals: 6 }
};

/**
 * Get transaction details from Tron network
 */
async function getTransaction(txHash) {
  try {
    // Get transaction info
    const response = await axios.get(`${TRONGRID_API_URL}/v1/transactions/${txHash}`, {
      headers: {
        'TRON-PRO-API-KEY': TRONGRID_API_KEY
      }
    });

    const txData = response.data.data?.[0];

    if (!txData) {
      return null;
    }

    const tx = txData.raw_data.contract[0];
    const txInfo = await getTransactionInfo(txHash);

    // Check if it's a TRC20 transfer
    if (tx.type === 'TriggerSmartContract') {
      const tokenTransfer = await parseTRC20Transfer(tx, txInfo, txHash);
      if (tokenTransfer) {
        return {
          hash: txHash,
          network: 'Tron',
          networkType: 'TRC20',
          coin: tokenTransfer.symbol,
          tokenName: tokenTransfer.name,
          contractAddress: tokenTransfer.contract,
          from: tokenTransfer.from,
          to: tokenTransfer.to,
          amount: tokenTransfer.amount,
          timestamp: txData.raw_data.timestamp,
          dateTime: new Date(txData.raw_data.timestamp).toISOString(),
          status: txInfo?.receipt?.result === 'SUCCESS' ? 'success' : 'failed',
          fee: calculateFee(txInfo),
          blockNumber: txData.blockNumber
        };
      }
    }

    // Native TRX transfer
    if (tx.type === 'TransferContract') {
      const value = tx.parameter.value;
      return {
        hash: txHash,
        network: 'Tron',
        networkType: 'Native',
        coin: 'TRX',
        tokenName: 'Tron',
        contractAddress: null,
        from: hexToBase58(value.owner_address),
        to: hexToBase58(value.to_address),
        amount: (value.amount / 1e6).toString(),
        timestamp: txData.raw_data.timestamp,
        dateTime: new Date(txData.raw_data.timestamp).toISOString(),
        status: txInfo?.receipt?.result === 'SUCCESS' ? 'success' : 'failed',
        fee: calculateFee(txInfo),
        blockNumber: txData.blockNumber
      };
    }

    return null;
  } catch (error) {
    console.error('Tron lookup error:', error.message);
    return null;
  }
}

/**
 * Get transaction info (for fees and status)
 */
async function getTransactionInfo(txHash) {
  try {
    const response = await axios.get(`${TRONGRID_API_URL}/wallet/gettransactioninfobyid`, {
      params: {
        value: txHash
      },
      headers: {
        'TRON-PRO-API-KEY': TRONGRID_API_KEY
      }
    });
    return response.data;
  } catch (error) {
    return null;
  }
}

/**
 * Parse TRC20 transfer
 */
async function parseTRC20Transfer(tx, txInfo, txHash) {
  try {
    const contractAddress = hexToBase58(tx.parameter.value.contract_address);

    // Get token info
    let tokenInfo = TRC20_TOKENS[contractAddress];

    if (!tokenInfo) {
      tokenInfo = await getTokenInfo(contractAddress);
    }

    // Parse transfer data from logs
    if (txInfo && txInfo.log && txInfo.log.length > 0) {
      const transferLog = txInfo.log.find(log =>
        log.topics && log.topics[0] === 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      );

      if (transferLog) {
        const from = '41' + transferLog.topics[1].slice(24); // Add Tron prefix
        const to = '41' + transferLog.topics[2].slice(24);
        const amount = parseInt(transferLog.data, 16);

        const decimals = tokenInfo?.decimals || 6;
        const formattedAmount = (amount / Math.pow(10, decimals)).toString();

        return {
          contract: contractAddress,
          symbol: tokenInfo?.symbol || 'UNKNOWN',
          name: tokenInfo?.name || 'Unknown Token',
          from: hexToBase58(from),
          to: hexToBase58(to),
          amount: formattedAmount
        };
      }
    }

    return null;
  } catch (error) {
    console.error('TRC20 parse error:', error);
    return null;
  }
}

/**
 * Get token info
 */
async function getTokenInfo(contractAddress) {
  try {
    // Try to get token info from TronGrid
    const response = await axios.post(`${TRONGRID_API_URL}/wallet/triggerconstantcontract`, {
      owner_address: '410000000000000000000000000000000000000000',
      contract_address: base58ToHex(contractAddress),
      function_selector: 'symbol()',
      parameter: ''
    }, {
      headers: {
        'TRON-PRO-API-KEY': TRONGRID_API_KEY
      }
    });

    return {
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 6
    };
  } catch (error) {
    return {
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 6
    };
  }
}

/**
 * Calculate transaction fee
 */
function calculateFee(txInfo) {
  if (!txInfo || !txInfo.fee) {
    return '0 TRX';
  }
  return ((txInfo.fee / 1e6).toFixed(6)) + ' TRX';
}

/**
 * Convert hex address to base58 (Tron format)
 */
function hexToBase58(hexAddress) {
  // This is a simplified version
  // In production, use TronWeb library for proper conversion
  try {
    // Remove 0x prefix if exists
    let hex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;

    // Add Tron prefix (41) if not present
    if (!hex.startsWith('41')) {
      hex = '41' + hex;
    }

    // For now, return hex format (TronWeb would convert to base58)
    // You can add TronWeb library for proper conversion
    return 'T' + hex.slice(2, 36); // Simplified
  } catch (error) {
    return hexAddress;
  }
}

/**
 * Convert base58 to hex
 */
function base58ToHex(base58Address) {
  // Simplified - in production use TronWeb
  return base58Address;
}

module.exports = {
  getTransaction
};
