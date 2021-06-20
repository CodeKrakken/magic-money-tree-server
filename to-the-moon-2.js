require('dotenv').config();

const fee = 0.00075
const axios = require('axios')
const fs = require('fs');

const ccxt = require('ccxt');
const { nextTick } = require('process');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,
});

let wallet = {
  'BTC': 2000  
}

let currentMarket = 'None'
let currentAsset = 'None'
let currentBase = 'USDT'
let boughtPrice = 0
let targetPrice = 0

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  let activeCurrency = await getActiveCurrency()
  console.log(activeCurrency)
  let marketNames = await getMarkets(activeCurrency)
  let bullishMarkets = await getBullishMarkets(marketNames, activeCurrency)
  console.log(bullishMarkets)
}

async function getActiveCurrency() {
  let sorted = Object.entries(wallet).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]
}

async function getMarkets(currency) {
  let markets = await fetchMarkets()
  let marketNames = Object.keys(markets).filter(market => goodMarket(market, markets, currency))
  let voluminousMarkets = await checkVolumes(marketNames)
  console.log('Filtered by volume')
  return voluminousMarkets
}

async function fetchMarkets() {
  console.log(`Fetching overview at ${timeNow()}`)
  let markets = await binance.load_markets()
  return markets
}

function goodMarket(market, markets, currency) {
  return markets[market].active 
  && !market.includes('UP') 
  && !market.includes('DOWN') 
  && market.includes(currency) 
  && !market.replace("USD", "").includes("USD")
}

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

async function checkVolumes(marketNames) {
  let voluminousMarkets = []
  let symbolNames = marketNames.map(marketname => marketname = marketname.replace('/', ''))
  let n = marketNames.length
  let tallyObject = { 
    assets: { total: 0, unique: 0 }, 
    bases: { total: 0, unique: 0 } 
  }
  for (let i = 0; i < n; i ++) {
    let symbolName = symbolNames[i]
    let marketName = marketNames[i]
    let asset = marketName.substring(0, marketName.indexOf('/'))
    let base = marketName.substring(marketName.indexOf('/')+1)
    tally(asset, base, tallyObject)
    console.log(`Checking 24 hour volume of market ${i+1}/${n} - ${symbolName}`)
    let response = await checkVolume(marketNames, i)
    if (response === "Insufficient volume" || response === "No dollar comparison available") {
      marketNames.splice(i, 1)
      symbolNames.splice(i, 1)
      i--
      n--
      console.log(response + '\n')
    } else {
      console.log(`Including ${marketName}\n`)
      voluminousMarkets.push(marketName)
    }
  }
  fs.appendFile('all market tally.txt', JSON.stringify(tallyObject), function(err) {
    if (err) return console.log(err);
  })
  return voluminousMarkets
}

async function checkVolume(marketNames, i) {
  let marketName = marketNames[i]
  let asset = marketName.substring(0, marketName.indexOf('/'))
  let dollarMarket = `${asset}/USDT`
  if (marketNames.includes(dollarMarket)) {
    let dollarSymbol = dollarMarket.replace('/', '')
    let volumeDollarValue = await fetchDollarVolume(dollarSymbol)
    if (volumeDollarValue < 50000000) { return "Insufficient volume"} 
    if (volumeDollarValue === 'Invalid market') { return 'No dollar comparison available' }
  } else {
    return 'No dollar comparison available'
  }
  return 'Sufficient volume'
}

async function tally(asset, base, tallyObject) {
  try{
    if (Object.keys(tallyObject.assets).includes(asset)) {
      tallyObject.assets[asset] ++
    } else {
      tallyObject.assets[asset] = 1
      tallyObject.assets.unique ++
    }
    if (Object.keys(tallyObject.bases).includes(base)) {
      tallyObject.bases[base] ++
    } else {
      tallyObject.bases[base] = 1
      tallyObject.bases.unique ++
    }
    tallyObject.assets.total ++
    tallyObject.bases.total ++
  } catch (error) {
    console.log(error)
  }
}

async function fetchDollarVolume(symbol) {
  try {
    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
  let dollarPrice = parseFloat(twentyFourHour.data.weightedAvgPrice)
  let totalVolume = parseFloat(twentyFourHour.data.volume)
  volumeDollarValue = totalVolume * dollarPrice
  return volumeDollarValue
  } catch (error) {
    return 'Invalid market'
  }
}

async function getBullishMarkets(marketNames, activeCurrency) {
  try {
    let exchangeHistory = await fetchAllHistory(marketNames)
    let bullishMarkets = await filter(exchangeHistory, activeCurrency)
    return bullishMarkets
  } catch (error) {
    getBullishMarkets()
  }
}

async function fetchAllHistory(marketNames) {
  let n = marketNames.length
  let returnArray = []
  console.log(`Fetching History @ ${timeNow()}\n`)
  for (let i = 0; i < n; i ++) {
    try {
      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let symbolHistory = await fetchOneHistory(symbolName)  
      let symbolObject = {
        'history': symbolHistory,
        'market': marketName
      }
      symbolObject = await collateData(symbolObject)
      await returnArray.push(symbolObject)
    } catch (error) {
      marketNames.splice(i, 1)
      i --
      n --
    }
  }
  return returnArray
}

async function fetchOneHistory(symbolName) {
  let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`)
  return history.data
}

async function collateData(data) {
  let history = []
  data.history.forEach(period => {
    history.push({
      'startTime': period[0],
      'open': period[1],
      'high': period[2],
      'low': period[3],
      'close': period[4],
      'endTime': period[6]
    })
  })
  let outputObject = {
    'history': history,
    'market': data.market
  }
  return outputObject
}

async function filter(markets, activeCurrency) {
  try {
    let outputArray = []
    for (let i = 0; i < markets.length; i++) {
      let market = markets[i]
      let currentPrice = await fetchPrice(market)
      if (market.market.indexOf(activeCurrency) === 0) {
        if (
          ema(market.history, 20, 'close') < ema(market.history, 50, 'close') && 
          ema(market.history, 50, 'close') < ema(market.history, 200, 'close') && 
          currentPrice < ema(market.history, 20, 'close')
        ) {
          outputArray.push(market)
        } else {
          // console.log(market.market)
          // console.log(currentPrice)
          // console.log(ema(market.history, 20, 'close'))
          // console.log('\n')
        }
      } else {
        if (
          ema(market.history, 20, 'close') > ema(market.history, 50, 'close') && 
          ema(market.history, 50, 'close') > ema(market.history, 200, 'close') && 
          currentPrice > ema(market.history, 20, 'close')
        ) {
          outputArray.push(market)
        } else {
          // console.log(market.market)
          // console.log(currentPrice)
          // console.log(ema(market.history, 20, 'close'))
          // console.log('\n')
        }
      }
    }
    return outputArray
  } catch (error) {
    console.log(error)
  }

}

async function fetchPrice(market) {
  try {
    let symbolName = market.market.replace('/', '')
    let rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    let price = parseFloat(rawPrice.data.price)
    return price
  } catch {
    fetchPrice(market)
  }
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

run();
