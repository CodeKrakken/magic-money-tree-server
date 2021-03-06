require('dotenv').config();

const fee = 0.00075
const axios = require('axios')
const fs = require('fs');

const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,
});


// const WebSocket = require('ws');

// const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

// ws.on('message', function incoming(data) {
//     console.log(data);
// });
const { runInContext } = require('vm');

let wallet = {
  'USDT': 2000
}

let currentMarket = 'None'
let currentPrice = 0
let currentAsset = 'None'
let currentBase = 'USDT'
let boughtPrice = 0
let targetPrice = 0

async function run() {
  console.log('Running\n')
  let voluminousMarkets = await fillFile()
  mainProgram(voluminousMarkets)
}

async function fillFile() {
  let markets = await fetchMarkets()
  let marketNames = await filterMarkets(markets)
  let voluminousMarkets = await populateFile(marketNames)
  console.log('Populated files')
  return voluminousMarkets
}

async function fetchMarkets() {
  console.log('Fetching overview\n')
  let markets = await binance.load_markets()
  return markets
}

async function filterMarkets(markets) {
  let marketNames = Object.keys(markets).filter(market => goodMarket(market, markets))
  return marketNames
}

function goodMarket(market, markets) {
  return markets[market].active 
  && !market.includes('UP') 
  && !market.includes('DOWN') 
  && market.includes('USDT') 
  && !market.replace("USD", "").includes("USD")
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

async function populateFile(marketNames) {
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

async function mainProgram(marketNames) {
  try {
  let exchangeHistory = await fetchAllHistory(marketNames)
  let bullishMarkets = await filter(exchangeHistory)
  if (currentMarket !== undefined) {
    currentPrice = await fetchPrice(currentMarket)
  }
  await displayWallet()
  if (bullishMarkets !== undefined) {
    if (bullishMarkets.length > 0) {
      bullishMarkets = await rank(bullishMarkets)
      await display(bullishMarkets)
      if (currentMarket === 'None') {
        currentMarket = bullishMarkets[0]
      }
      await trade(bullishMarkets) 
    }
  }
  console.log('Restarting process')
  mainProgram(marketNames)
  } catch (error) {
    console.log(error)
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

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

function display(markets) {
  let n = markets.length
  console.log(`Bullish markets at ${timeNow()}\n`)
  for (let i = 0; i < n; i++) {
    let market = markets[i]
    console.log(`${market.market} ... Movement: ${market.movement} ... (${market.fetched})`)
  }
  console.log('\n')
}

async function rank(markets) {
  let outputArray = []
  markets.forEach(market => {
    let marketName = market.market
    let ema2 = ema(market.history, 2, 'close')
    let ema20 = ema(market.history, 20, 'close')
    let ema50 = ema(market.history, 50, 'close')
    let ema200 = ema(market.history, 200, 'close')
    outputArray.push({
      'market': marketName,
      'movement': ema20/ema50 -1,
      'ema2': ema2,
      'ema20': ema20,
      'ema50': ema50,
      'ema200': ema200,
      'fetched': new Date(market.history[market.history.length-1].endTime - 59000).toLocaleString()
    })
  })
  return outputArray.sort((a, b) => b.movement - a.movement)
}

async function filter(markets) {
  try {
    let outputArray = []
    for (let i = 0; i < markets.length; i++) {
      let market = markets[i]
      let currentPrice = await fetchPrice(market)
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
    return outputArray
  } catch (error) {
    console.log(error)
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

function averageData(dataArray) {
  let outputArray = []
  dataArray.forEach(obj => {
    let total = obj['open'] + obj['high'] + obj['low'] + obj['close']
    outputArray.push(total)
  })
  return outputArray
}

function displayWallet() {
  let displayWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet\n')
  displayWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency === 'USDT' ? '' : `@ ${currentPrice} = $${wallet[currency] * currentPrice}`} `)
    if (currency !== 'USDT') {
      console.log(`Target price: ${targetPrice} = $${wallet[currency] * targetPrice}`)
    }
  })
  console.log('\n')
}

async function trade(markets) {
  if (currentMarket !== 'None') {
    currentAsset = currentMarket.market.substring(0, currentMarket.market.indexOf('/'))
    currentBase = currentMarket.market.substring(currentMarket.market.indexOf('/')+1)
    currentPrice = await fetchPrice(currentMarket)
    if (timeToBuy()) {
      await newBuyOrder(currentAsset)
      boughtPrice = currentPrice
      targetPrice = boughtPrice * (1 + (3 * fee))
    } else {
      // console.log(wallet[currentAsset])
      // console.log(wallet[currentBase])
      // console.log(currentPrice) 
      // console.log(currentMarket.ema20)
    }
  }
  if (currentBase) {
    if (timeToSell(targetPrice, currentMarket)) {
      await newSellOrder(currentAsset)
      currentMarket = 'None'
    } else {
      // console.log(currentAsset)
      // console.log(currentMarket)
      // console.log(currentPrice)
    }
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

function timeToBuy() {
  return wallet[currentBase] > 0
}

async function newBuyOrder(currentAsset) {
  let tradeReport
  try {
    let oldBaseVolume = wallet[currentBase]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    if (wallet[currentAsset] === undefined) { wallet[currentAsset] = 0 }
    wallet[currentAsset] += oldBaseVolume * (1 - fee) / currentPrice
    wallet[currentBase] -= oldBaseVolume
    tradeReport = `${timeNow()} - Bought ${n(wallet[currentAsset], 8)} ${currentAsset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
  } catch(error) {
    console.log(error)
  }
  console.log(tradeReport)
  tradeReport = ''
  displayWallet()
}

function timeToSell(targetPrice, market) {
  return wallet[currentBase] === 0 
      && currentPrice >= targetPrice
      && currentPrice < market.ema2
}

async function newSellOrder(currentAsset) {
  let tradeReport
  try {
    const oldAssetVolume = wallet[currentAsset]
    // await binanceClient.createMarketSellOrder(market, oldAssetVolume)
    wallet[currentBase] += oldAssetVolume * currentPrice * (1 - fee)
    wallet[currentAsset] -= oldAssetVolume
    tradeReport = `${timeNow()} - Sold   ${n(oldAssetVolume, 8)} ${currentAsset} @ ${n(currentPrice, 8)} ($${oldAssetVolume * currentPrice * (1 - fee)})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })  
  } catch (error) {
    console.log(error)
  }
  console.log(tradeReport)
  tradeReport = ''
  displayWallet()
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
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

run();