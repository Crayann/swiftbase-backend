class PaymentService {
  async linkBankAccount(userId, bankDetails) {
    return {
      success: true,
      paymentMethodId: 'bank_' + Date.now(),
      bankName: bankDetails.bankName,
      last4: bankDetails.accountNumber.slice(-4),
      message: 'Bank account linked successfully',
    };
  }

  async linkCryptoWallet(userId, walletDetails) {
    if (!this.isValidWalletAddress(walletDetails.address)) {
      throw new Error('Invalid wallet address');
    }

    return {
      success: true,
      paymentMethodId: 'crypto_' + Date.now(),
      walletAddress: walletDetails.address,
      cryptoType: walletDetails.cryptoType,
      message: 'Crypto wallet linked successfully',
    };
  }

  async processPayment(paymentMethodId, amount, currency) {
    await this.simulateDelay(1000);

    return {
      success: true,
      transactionId: 'pay_' + Date.now(),
      amount,
      currency,
      timestamp: new Date().toISOString(),
    };
  }

  async processPayout(recipientDetails, amount, currency) {
    await this.simulateDelay(2000);

    if (recipientDetails.payout_type === 'bank') {
      return {
        success: true,
        payoutId: 'payout_' + Date.now(),
        method: 'bank_transfer',
        bankName: recipientDetails.bank_name,
        amount,
        currency,
        estimatedArrival: '1-2 business days',
      };
    } else {
      return {
        success: true,
        payoutId: 'payout_' + Date.now(),
        method: 'cash_pickup',
        pickupCode: Math.random().toString(36).substr(2, 9).toUpperCase(),
        amount,
        currency,
        estimatedArrival: 'Available now',
      };
    }
  }

  isValidWalletAddress(address) {
    if (address.startsWith('r') && address.length >= 25 && address.length <= 35) {
      return true;
    }
    if (address.startsWith('0x') && address.length === 42) {
      return true;
    }
    return false;
  }

  simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new PaymentService();