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
const fee = 0.00075

// Functions

async function run() {

  console.log('Running')
  
  let wallet = { 
  
    currencies: {
      'USDT': 1000 
    }
  
  }

  tick(wallet)

}



async function tick(wallet) {

  console.log('\n\n----------\n\n')
  console.log(`Tick at ${timeNow()}\n`)
  let activeCurrency = await getActiveCurrency(wallet)
  await displayWallet(wallet, activeCurrency)
  // console.log(`Active currency - ${activeCurrency}\n`)
  console.log('\n')

  if (activeCurrency === 'USDT') {
    
    await tryBuy(wallet)

  } else {

    await trySell(wallet, activeCurrency)

  }

  tick(wallet)
}



async function getActiveCurrency(wallet) {

  let sorted = Object.entries(wallet.currencies).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]

}



async function displayWallet(wallet, activeCurrency) {

  let nonZeroWallet = Object.keys(wallet.currencies).filter(currency => wallet.currencies[currency] > 0)
  console.log('Wallet')
  let dollarVolume
  let dollarPrice

  if (activeCurrency !== 'USDT') {

    let dollarSymbol = `${activeCurrency}USDT`
    dollarPrice = await fetchPrice(dollarSymbol)
    dollarVolume = wallet.currencies[activeCurrency] * dollarPrice

  }
  
  nonZeroWallet.forEach(currency => {
    console.log(`${wallet.currencies[currency]} ${currency} ${currency !== 'USDT' ? `@ ${dollarPrice} = $${dollarVolume}` : '' } `)
  })

}


async function tryBuy(wallet) {

  let markets = await updateMarkets()

  if (markets.length > 0) {

    await displayMarkets(markets)
    let bestMarket = markets[0]
    await newBuyOrder(wallet, bestMarket)

  } else {

    console.log('No viable markets\n')
  }
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

async function updateMarkets() {

  let marketNames = await getMarketNames()
  let voluminousMarketNames = await getVoluminousMarketNames(marketNames)
  let markets = await fetchAllHistory(voluminousMarketNames)
  markets = await sortByVolatility(markets, 8)
  let bulls = await getBulls(markets)
  return bulls
  
}



async function getMarketNames() {

  let markets = await fetchMarkets()
  let marketNames = Object.keys(markets).filter(marketName => goodMarketName(marketName, markets))
  return marketNames

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



async function getVoluminousMarketNames(marketNames) {

  let voluminousMarketNames = []
  let symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  let n = symbolNames.length

  for (let i = 0; i < n; i++) {

    let symbolName = symbolNames[i]
    let marketName = marketNames[i]
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

      console.log(announcement + `Including ${marketName}`)
      voluminousMarketNames.push(marketName)
    }
  }

  console.log('\n')
  return voluminousMarketNames

}



async function checkVolume(symbolName) {

  let twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    return twentyFourHour.data.quoteVolume > minimumDollarVolume ? 
    'Sufficient volume' : 'Insufficient volume'
  
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



async function sortByVolatility(markets, t) {

  let n = markets.length

  for (let i = 0; i < n; i++) {

    let market = markets[i]
    let historySlice = market.history.slice(market.history.length - t)
    let data = extractData(historySlice, 'average')
    market.averageAverage = calculateAverage(data)
    market.deviation = math.std(data)
    market.volatility = 100 - (market.averageAverage - market.deviation) / market.averageAverage * 100

  }
  
  return markets.sort((a, b) => b.volatility - a.volatility)
}



async function getBulls(markets) {

  try {

    console.log('Analysing markets\n\n')
    let outputArray = []
    let n = markets.length

    for (let i = 0; i < n; i++) {

      let market = markets[i]
      console.log(`Fetching current price of market ${i+1}/${n} - ${market.name}`)
      market.currentPrice = await fetchPrice(market.name)
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
        'name': marketName

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
    'name': data.name

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

  let outputArray = []

  dataArray.forEach(obj => {
    outputArray.push(obj[key])
  })

  return outputArray

}



function calculateAverage(array) {

  let total = 0
  let n = array.length

  for (let i = 0; i < n; i++) {
    
    total += parseFloat(array[i])
  }

  return total/parseFloat(n)
}



function displayMarkets(markets) {

  markets.forEach(market => {

    console.log(`Market - ${market.name}`)
    console.log(`Average Price - ${market.averageAverage}`)
    console.log(`Deviation - ${market.deviation}`)
    console.log(`Volatility - ${market.volatility}`)
    console.log(`Current Price - ${market.currentPrice}`)
    console.log(`EMA1 - ${market.ema1}`)
    console.log(`EMA2 - ${market.ema2}`)
    console.log(`EMA3 - ${market.ema3}`)
    console.log(`EMA5 - ${market.ema5}`)
    console.log(`EMA8 - ${market.ema8}`)
    console.log('\n')

  })
}



async function newBuyOrder(wallet, market) {
  
  try {

    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let base = market.name.substring(slash+1)
    let currentPrice = await fetchPrice(market.name)
    let baseVolume = wallet.currencies[base]
    if (wallet.currencies[asset] === undefined) { wallet.currencies[asset] = 0 }
    wallet.currencies[base] -= baseVolume
    wallet.currencies[asset] += baseVolume * (1 - fee) / currentPrice
    wallet.targetVolume = baseVolume * (1 + fee)
    wallet.targetPrice = wallet.targetVolume / wallet.currencies[asset]
    console.log(`Target Volume - ${wallet.targetVolume}`)
    console.log(`Target Price - ${wallet.targetPrice}`)
    let tradeReport = `${timeNow()} - Bought ${n(wallet.currencies[asset], 8)} ${asset} @ ${n(currentPrice, 8)} ($${baseVolume})\n\n`
    await recordTrade(tradeReport)
    console.log(tradeReport)
    tradeReport = ''

  } catch (error) {
    
    console.log(error)

  }
}



function recordTrade(report) {

  fs.appendFile('trade-history.txt', report, function(err) {
    if (err) return console.log(err);
  })

} 



async function trySell(wallet, activeCurrency) {

  if (wallet.targetVolume === undefined) {
    wallet.targetVolume = wallet.currencies[activeCurrency]
  }

  let currentMarket = {}
  currentMarket.name = `${activeCurrency}/USDT`
  let currentSymbolName = `${activeCurrency}USDT`
  currentMarket.history = await fetchOneHistory(currentSymbolName)

  currentMarket = {

    'history': currentMarket.history,
    'name': currentMarket.name

  }

  currentMarket = await annotateData(currentMarket)
  currentMarket.currentPrice = await fetchPrice(currentSymbolName)
  currentMarket.ema1Low = ema(currentMarket.history, 1, 'low')

  if (

    // currentMarket.currentPrice > wallet.targetPrice &&
    currentMarket.currentPrice <= currentMarket.ema1Low

  )
  {
    await newSellOrder(wallet, currentMarket)
  
  } else {

    displayStatus(wallet, currentMarket)

  }
}



async function newSellOrder(wallet, market ) {

  let tradeReport

  try {
    
    let currentPrice = await fetchPrice(market.name)
    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let base = market.name.substring(slash + 1)
    let assetVolume = wallet.currencies[asset]

    if (wallet.currencies[base] === undefined) { wallet.currencies[base] = 0 }
    wallet.currencies[base] += assetVolume * (1 - fee) * currentPrice
    wallet.currencies[asset] -= assetVolume
    wallet.targetVolume = undefined
    wallet.targetPrice = undefined
    tradeReport = `${timeNow()} - Sold ${n(assetVolume, 8)} ${asset} @ ${n(currentPrice, 8)} ($${wallet.currencies[base]})\n\n`
    recordTrade(tradeReport)
    console.log(tradeReport)
    tradeReport = ''

  } catch (error) {
    
    console.log(error)

  }
}



function displayStatus(wallet, market) {

  console.log(`Target price  - ${wallet.targetPrice}`)
  console.log(`Current price - ${market.currentPrice}`)
  console.log(`EMA1 (low)    - ${market.ema1Low}\n`)

  if (wallet.targetPrice > market.currentPrice) {

    console.log('Holding - target price not met')

  } else if (market.currentPrice > market.ema1Low) {

    console.log('Holding - price is rising')

  }

}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}



run();