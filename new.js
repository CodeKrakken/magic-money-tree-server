if (wallet.highPrice * stopLossThreshold > wallet.targetPrice) {
          
  wallet.stopLossPrice = wallet.highPrice * stopLossThreshold
}