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
    
    let marketNames = await getMarketNames()
    let markets = await fetchAllHistory(marketNames)
    markets = await sortByVolatility(markets)
    console.log(markets)
    let bulls = await getBulls(markets)


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



async function getMarketNames() {

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
    let response = await checkVolume(symbolName)

    if (

      response === "Insufficient volume" || 
      response === "No dollar comparison available" || 
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



async function checkVolume(symbolName) {

  let twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    let price = parseFloat(twentyFourHour.data.weightedAvgPrice)
    let assetVolume = parseFloat(twentyFourHour.data.volume)

    if (assetVolume * price < minimumDollarVolume) { return 'Insufficient volume' }
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



async function sortByVolatility(markets) {

  let n = markets.length

  for (let i = 0; i < n; i++) {

    let market = markets[i]
    let data = extractData(market, 'average')
    market.volatility = math.std(data)

  }
  
  return markets.sort((a, b) => a.volatility - b.volatility)
}


async function getBulls(markets) {

  try {

    console.log('Analysing markets\n\n')
    let outputArray = []
    let n = markets.length

    for (let i = 0; i < n; i++) {

      let market = market[i]
      console.log(`Fetching current price of market ${i+1}/${n} - ${market.market}`)
      market.currentPrice = await fetchPrice(market.market)
      market.ema1 = ema(market.history, 1, 'average')
      market.ema2 = ema(market.history, 2, 'average')
      market.ema3 = ema(market.history, 3, 'average')
      market.ema5 = ema(market.history, 5, 'average')
      market.ema8 = ema(market.history, 8, 'average')

      if (
        market.currentPrice > market.ema1 
        // && market.ema1 > market.ema2
        // && market.ema2 > market.ema3
        // && market.ema3 > market.ema5
        // && market.ema5 > market.ema8
      )
      {
        market.movement = market.ema1/market.ema8 -1
        outputArray.push(market)

      } else {

        // console.log(market.currentPrice)
        // console.log(market.ema1)
      }
    }

    console.log('\n')
    return outputArray

  } catch (error) {

    console.log(error)

  }
}



async function fetchAllHistory(marketNames) {

  console.log('Fetching history\n')
  let n = marketNames.length
  let returnArray = []

  for (let i = 0; i < n; i ++) {

    try {

      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let symbolHistory = await fetchOneHistory(symbolName)

      let symbolObject = {

        'history': symbolHistory,
        'market': marketName

      }

      symbolObject = await annotateData(symbolObject)
      console.log(`Fetching history of market ${i+1}/${n} - ${marketName}`)
      await returnArray.push(symbolObject)

    } catch (error) {

      marketNames.splice(i, 1)
      i --
      n --

    }
  }

  console.log('\n')
  return returnArray

}



async function fetchOneHistory(symbolName) {
  let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`)
  return history.data
}



async function annotateData(data) {

  let history = []

  data.history.forEach(period => {

    let average = (

      parseFloat(period[1]) +
      parseFloat(period[2]) +
      parseFloat(period[3]) +
      parseFloat(period[4])

    )/4

    history.push(
      {
        'startTime': period[0],
        'open'     : period[1],
        'high'     : period[2],
        'low'      : period[3],
        'close'    : period[4],
        'endTime'  : period[6],
        'average'  : average
      }
    )
  })

  let outputObject = {

    'history': history,
    'market': data.market

  }

  return outputObject
}



function ema(rawData, time, parameter) {

  let data = extractData(rawData, parameter)
  const k = 2/(time + 1)
  let emaData = []
  emaData[0] = data[0]

  for (let i = 1; i < data.length; i++) {

    let newPoint = (data[i] * k) + (emaData[i-1] * (1-k))
    emaData.push(newPoint)

  }

  let currentEma = [...emaData].pop()
  return +currentEma

}

function extractData(dataArray, key) {

  console.log(dataArray)
  let outputArray = []

  dataArray.forEach(obj => {
    outputArray.push(obj[key])
  })

  return outputArray

}



run();