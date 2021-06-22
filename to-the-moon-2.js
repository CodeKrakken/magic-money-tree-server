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

let wallet = {
  'GBP': 2000  
}

let dollarMarketNames = []

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  let activeCurrency = await getActiveCurrency()
  await displayWallet(activeCurrency)
  let marketNames = await getMarkets(activeCurrency)
  let bullishMarkets = await getBullishMarkets(marketNames, activeCurrency)
  if (bullishMarkets !== undefined && bullishMarkets.length > 0) {
    let bestMarket = await selectMarket(bullishMarkets)
    await trade(bestMarket, activeCurrency)
  } else {
    console.log(`No bulls or bears @ ${timeNow()}`)
  }
  tick()
}

async function getActiveCurrency() {
  let sorted = Object.entries(wallet).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]
}

async function displayWallet(activeCurrency) {
  let displayWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet\n')
  let currentPrice
  console.log(activeCurrency)
  if (!activeCurrency.includes('USD')) {
    currentPrice = await fetchPrice(activeCurrency + '/USDT')
  }
  displayWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency.includes('USD') ? '' : `@ ${currentPrice} = $${wallet[currency] * currentPrice}`} `)
  })
  console.log('\n')
}

async function fetchPrice(marketName) {
  let symbolName = marketName.replace('/', '')
  let rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
  let price = parseFloat(rawPrice.data.price)
  return price
}

async function getMarkets(currency) {
  let markets = await fetchMarkets()
  dollarMarketNames = Object.keys(markets).filter(market => dollarMarket(market))
  let marketNames = Object.keys(markets).filter(market => goodMarket(market, markets, currency))
  let voluminousMarkets = await checkVolumes(marketNames)
  return voluminousMarkets
}

async function fetchMarkets() {
  console.log(`Fetching overview at ${timeNow()}`)
  let markets = await binance.load_markets()
  return markets
}

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

function goodMarket(market, markets, currency) {
  return markets[market].active 
  && !market.includes('UP') 
  && !market.includes('DOWN') 
  && market.includes(currency) 
  && !market.replace("USD", "").includes("USD")
}

function dollarMarket(market) {
  return market.includes('USDT')
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
    let announcement = `Checking 24 hour volume of market ${i+1}/${n} - ${symbolName} - `
    let response = await checkVolume(marketNames, i)
    if (response === "Insufficient volume" || response === "No dollar comparison available") {
      marketNames.splice(i, 1)
      symbolNames.splice(i, 1)
      i--
      n--
      console.log(announcement + response)
    } else {
      console.log(announcement + `Including ${marketName}`)
      voluminousMarkets.push(marketName)
    }
  }
  fs.appendFile('all market tally.txt', JSON.stringify(tallyObject), function(err) {
    if (err) return console.log(err);
  })
  return voluminousMarkets
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

async function checkVolume(marketNames, i) {
  let marketName = marketNames[i]
  let asset = marketName.substring(0, marketName.indexOf('/'))
  let dollarMarketName = marketName.includes('USD') ? marketName : `${asset}/USDT`
  if (dollarMarketNames.includes(dollarMarketName)) {
    let dollarSymbolName = dollarMarketName.replace('/', '')
    let volumeDollarValue = await fetchDollarVolume(dollarSymbolName)
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

async function getBullishMarkets(marketNames, activeCurrency) {
  try {
    let exchangeHistory = await fetchAllHistory(marketNames)
    let bullishMarkets = await filter(exchangeHistory, activeCurrency)
    return bullishMarkets
  } catch (error) {
    console.log(error.message)
  }
}

async function fetchAllHistory(marketNames) {
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
    console.log('Filtering')
    let outputArray = []
    for (let i = 0; i < markets.length; i++) {
      let market = markets[i]
      let currentPrice = await fetchPrice(market.market)
      market.ema1 = ema(market.history, 1, 'close')
      market.currentPrice = currentPrice
      if (market.market.indexOf(activeCurrency) === 0) {
        if (
          // ema(market.history, 1, 'close') < ema(market.history, 2, 'close') && 
          // ema(market.history, 2, 'close') < ema(market.history, 3, 'close') && 
          currentPrice < market.ema1
        ) {
          outputArray.push(market)
        }
      } else {
        if (
          // ema(market.history, 1, 'close') > ema(market.history, 2, 'close') && 
          // ema(market.history, 2, 'close') > ema(market.history, 3, 'close') && 
          currentPrice > market.ema1
        ) {
          outputArray.push(market)
        } else {
          // console.log(market.market)
          // console.log(currentPrice)
          // console.log(market.ema1)
          // console.log('\n')
        }
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

async function selectMarket(markets) {
  markets = await rank(markets)
  bestMarket = markets[0]
  console.log(`Selected Market: ${JSON.stringify(bestMarket.market)}`)
  return bestMarket
}

async function rank(markets) {
  let outputArray = []
  markets.forEach(market => {
    let marketName = market.market
    let currentPrice = market.currentPrice
    let ema1 = market.ema1
    let ema2 = ema(market.history, 2, 'close')
    let ema3 = ema(market.history, 3, 'close')
    let ema20 = ema(market.history, 20, 'close')
    let ema50 = ema(market.history, 50, 'close')
    let ema200 = ema(market.history, 200, 'close')
    outputArray.push({
      'market': marketName,
      'currentPrice': currentPrice,
      'movement': currentPrice/ema1 -1,
      'ema1': ema1,
      'ema2': ema2,
      'ema3': ema3,
      'ema20': ema20,
      'ema50': ema50,
      'ema200': ema200,
      'fetched': new Date(market.history[market.history.length-1].endTime - 59000).toLocaleString()
    })
  })
  return outputArray.sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement))
}

async function trade(market, activeCurrency) {
  market.market.indexOf(activeCurrency) === 0 ?
  await newSellOrder(market, activeCurrency) :
  await newBuyOrder(market, activeCurrency)
}

async function newSellOrder(market, activeCurrency) {
  let tradeReport
  try {
    let currentPrice = await fetchPrice(market.market)
    const fee = 0.0075
    let targetBase = market.market.replace(`${activeCurrency}/`, '')
    let oldAssetVolume = wallet[activeCurrency]
    if (wallet[targetBase] === undefined) { wallet[targetBase] = 0 }
    wallet[targetBase] += oldAssetVolume * (1 - fee) * currentPrice
    wallet[activeCurrency] -= oldAssetVolume
    let dollarValue
    displayWallet(currentPrice)
    if (!targetBase.includes('USD')) {
      dollarValue = wallet[targetBase] * await fetchPrice(`${targetBase}/USDT`)
    } else {
      dollarValue = wallet[targetBase]
    }
    tradeReport = `${timeNow()} - Sold ${n(oldAssetVolume, 8)} ${activeCurrency} @ ${n(currentPrice, 8)} ($${dollarValue})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
    console.log(tradeReport)
    tradeReport = ''
    displayWallet(currentPrice)  
  } catch (error) {
    console.log(error)
  }
}

async function newBuyOrder(market, activeCurrency) {
  let tradeReport
  try {
    let currentPrice = await fetchPrice(market.market)
    const fee = 0.0075
    let targetAsset = market.market.replace(`/${activeCurrency}`, '')
    let oldBaseVolume = wallet[activeCurrency]
    if (wallet[targetAsset] === undefined) { wallet[targetAsset] = 0 }
    wallet[targetAsset] += oldBaseVolume * (1 - fee) / currentPrice
    wallet[activeCurrency] -= oldBaseVolume
    let dollarValue
    if (!targetAsset.includes('USD')) {
      dollarValue = wallet[targetAsset] * await fetchPrice(`${targetAsset}/USDT`)
    } else {
      dollarValue = wallet[targetAsset]
    }
    tradeReport = `${timeNow()} - Bought ${n(wallet[targetAsset], 8)} ${targetAsset} @ ${n(currentPrice, 8)} ($${dollarValue})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
    console.log(tradeReport)
    tradeReport = ''
    displayWallet(currentPrice)
  } catch (error) {
    console.log(error)
  }
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}

run();
