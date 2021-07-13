require('dotenv').config();
const math = require('mathjs');
const axios = require('axios')
const axiosRetry = require('axios-retry')
const fs = require('fs');
const ccxt = require('ccxt');
const { runInContext } = require('vm');



// Setup

const retryDelay = (retryNumber = 0) => {

  const seconds = Math.pow(2, retryNumber) * 1000;
  const randomMs = 1000 * Math.random();
  return seconds + randomMs;

};



axiosRetry(axios, {

  retries: Infinity,
  retryDelay,
  // retry on Network Error & 5xx responses
  retryCondition: axiosRetry.isRetryableError,

});



module.exports = axios;



const binance = new ccxt.binance({

  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,

});



// Config

const minimumDollarVolume = 28000000
const fee = 0.00075
const volatilityDuration = 2
const minimumMovement = 2
const stopLossThreshold = 0.98
const timeOut = 8 * 60 * 1000 // (desired minutes) * seconds * ms === 8 minutes

// Functions

async function run() {

  await record(`\n ---------- \n\n\nRunning at ${timeNow()}\n\n`)

  let wallet = { 
  
    currencies: {
      'USDT': {
        'quantity': 1000,
        'dollarValue': 1000
      }
    }
  }

  let markets
  let allMarkets = await fetchMarkets()
  let allMarketNames = Object.keys(allMarkets)
  let currentMarket
  let marketNames

  tick(wallet, markets, allMarketNames, currentMarket, marketNames)

}



function record(report) {

  fs.appendFile(`${process.env.COMPUTER} trade-history.txt`, report, function(err) {
    if (err) return console.log(err);
  })

  console.log(report)

}



function timeNow() {

  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}



async function fetchMarkets() {

  let markets = await binance.load_markets()
  return markets
}



async function tick(wallet, markets, allMarketNames, currentMarket, marketNames) {

  console.log('\n\n----------\n\n')
  console.log(`Tick at ${timeNow()}\n`)
  let activeCurrency = await getActiveCurrency(wallet)
  console.log(activeCurrency)
  await displayWallet(wallet, markets, allMarketNames, marketNames, activeCurrency, currentMarket)


}



async function getActiveCurrency(wallet) {

  let keys = Object.keys(wallet.currencies)
  let n = keys.length

  for (let i = 0; i < n; i ++) {
    
    let key = wallet.currencies[keys[i]]
    if (keys[i] === 'USDT') {

      key['dollarPrice'] = 1
      
    } else {

      key['dollarSymbol'] = `${keys[i]}USDT`
      key['dollarPrice'] = await fetchPrice(key['dollarSymbol'])
    }

    key['dollarValue'] = key['quantity'] * key['dollarPrice']

  }

  let sorted = Object.entries(wallet.currencies).sort((prev, next) => prev[1]['dollarValue'] - next[1]['dollarValue'])
  return sorted.pop()[0]
}



async function displayWallet(wallet, markets, allMarketNames, marketNames, activeCurrency, currentMarket) {

  let nonZeroWallet = Object.keys(wallet.currencies).filter(currency => wallet.currencies[currency]['quantity'] > 0)
  console.log('Wallet')
  let dollarVolume
  let dollarPrice

  if (activeCurrency !== 'USDT') {

    let dollarSymbol = `${activeCurrency}USDT`
    dollarPrice = await fetchPrice(dollarSymbol)
    
    if (dollarPrice === 'No response') {

      console.log('Currency information unavailable  - starting new tick')
      tick(wallet, markets, allMarketNames, currentMarket, marketNames)
    
    } else {

      dollarVolume = wallet.currencies[activeCurrency]['quantity'] * dollarPrice

      if (dollarPrice > wallet.targetPrice && dollarPrice > wallet.highPrice) { 
      
        wallet.highPrice = dollarPrice
        wallet.stopLossPrice = wallet.targetPrice + (wallet.highPrice - wallet.targetPrice) / 2
      
      }
    }
  }
  
  nonZeroWallet.forEach(currency => {

    console.log(`${wallet.currencies[currency]['quantity']} ${currency} ${currency !== 'USDT' ? `@ ${dollarPrice} = $${dollarVolume}` : '' } `)
    
    if (currency === activeCurrency && currency !== 'USDT') {

      console.log(`Target Price - ${wallet.targetPrice}`)
    }
  })
}



run();