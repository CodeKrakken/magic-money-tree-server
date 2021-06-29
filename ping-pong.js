// Dependencies

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
const minimumMovement = 0

// Functions

async function run() {

  console.log('Running\n')
  let wallet = { 'USDT': 1000 }
  tick(wallet)

}



async function tick(wallet) {

  console.log('\n----------\n\n')
  activeCurrency = await getActiveCurrency(wallet)
  await displayWallet(wallet, activeCurrency)
  
  if (activeCurrency === 'USDT') {
    let markets = await getMarkets()
  }

}



async function getActiveCurrency(wallet) {

  let sorted = Object.entries(wallet).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]

}



async function displayWallet(wallet, activeCurrency) {

  let nonZeroWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet')
  let dollarVolume

  if (activeCurrency !== 'USDT') {

    let dollarMarket = `${activeCurrency}/USDT`
    let dollarPrice = await fetchPrice(dollarMarket)
    dollarVolume = wallet[activeCurrency] * dollarPrice

  }
  
  nonZeroWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency !== 'USDT' ? `@ ${dollarPrice} = $${dollarVolume}` : '' } `)
  })

  console.log('\n')
}



async function fetchPrice(marketName) {
  try {
    let symbolName = marketName.replace('/', '')
    let rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    let price = parseFloat(rawPrice.data.price)
    return price
  } catch (error) {
    console.log(error)
  }

}



async function getMarkets() {
  let markets = await fetchMarkets()
  let marketNames = Object.keys(markets).filter(marketName => goodMarketName(marketName, markets))
  let voluminousMarketNames = await getVoluminousMarkets(marketNames)
  return voluminousMarketNames
}



async function fetchMarkets() {
  console.log(`Fetching overview at ${timeNow()}\n`)
  let markets = await binance.load_markets()
  return markets
}



function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}



function goodMarketName(marketName, markets) {

  return markets[marketName].active
  && marketName.includes('USDT') 
  && !marketName.includes('USDT/')
  && !marketName.includes('UP') 
  && !marketName.includes('DOWN') 
  && !marketName.includes('BUSD')
  && !marketName.includes('TUSD')
  && !marketName.includes('USDC')

}



async function getVoluminousMarkets(marketNames) {

  let voluminousMarketNames = []
  let symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  let n = symbolNames.length

  for (let i = 0; i < n; i++) {

    let symbolName = symbolNames[i]
    let announcement = `Checking 24 hour volume of market ${i+1}/${n} - ${symbolName} - `
    let response = await checkVolumeAndChange(symbolName)

    if (

      response === "Insufficient volume" || 
      response === "No dollar comparison available" || 
      response === "Insufficient movement" ||
      response === "No Response"

    ) 

    {
      symbolNames.splice(i, 1)
      i--
      n--
      console.log(announcement + response)

    } else {

      console.log(announcement + `Including ${symbolName}`)
      voluminousMarketNames.push(symbolName)
    }
  }

  console.log('\n')
  return voluminousMarketNames

}



async function checkVolumeAndChange(symbolName) {

  let twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    let price = parseFloat(twentyFourHour.data.weightedAvgPrice)
    let assetVolume = parseFloat(twentyFourHour.data.volume)
    let change = parseFloat(twentyFourHour.data.priceChangePercent)

    if (assetVolume * price < minimumDollarVolume) { return 'Insufficient volume' }
    if (change < minimumMovement) { return "Insufficient movement" }
    return 'Sufficient volume'
  
  } else {

    return "No Response"

  }

}



async function fetch24Hour(symbolName) {
  try {
    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolName}`)
    return twentyFourHour
  } catch (error) {
    return 'Invalid market'
  }
}


run();