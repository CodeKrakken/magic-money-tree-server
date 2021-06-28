require('dotenv').config();

const fee = 0.00075
const profit = 0.00025
const minimumDollarVolume = 28000000
const minimumMovement = 0.6
const axios = require('axios')
const axiosRetry = require('axios-retry')
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
const fs = require('fs');

const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,
});

let wallet = {
  'USDT': 1000  
}

let targetDollarPrice
let targetDollarVolume = 999.99
let currentDollarVolume = 1000
let currentDollarPrice = 1
let currentMarket = ''
let marketNames = []

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  console.log('\n----------\n\n')
  activeCurrency = await getActiveCurrency()
  if (currentMarket !== '') { marketNames.push(currentMarket.market) }
  await displayWallet(activeCurrency, marketNames)
  if (currentMarket === '') {
    marketNames = await getMarkets(activeCurrency)
    let bullishMarkets = await getBullishMarkets(marketNames, activeCurrency)
    if (bullishMarkets !== undefined && bullishMarkets.length > 0) {
      console.log(bullishMarkets)
      let bestMarket = bullishMarkets[0]
      await trade(bestMarket, activeCurrency, marketNames)
    } else {
      console.log(`No bulls or bears\n`)
    }
  } else {
    currentMarketArray = await fetchAllHistory([currentMarket.market])
    currentMarket.history = currentMarketArray[0].history
    let currentPrice = await fetchPrice(currentMarket.market)
    currentMarket.ema1 = ema(currentMarket.history, 1, 'average')
    currentMarket.ema2 = ema(currentMarket.history, 2, 'average')
    if ( // wallet[activeCurrency] * currentDollarPrice > targetDollarVolume && 
      currentPrice <= currentMarket.ema1) {
      await trade(currentMarket, activeCurrency, marketNames)
    }
  }
  tick()
}

async function getActiveCurrency() {
  let sorted = Object.entries(wallet).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]
}

async function displayWallet(activeCurrency, marketNames) {
  let nonZeroWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet')
  if (activeCurrency !== 'USDT') {
    let dollarMarkets = marketNames.filter(marketName => marketName.includes('USDT') && marketName.includes(activeCurrency))
    let dollarMarket = dollarMarkets[0]
    currentDollarPrice = await fetchPrice(dollarMarket)
  }
  currentDollarVolume = wallet[activeCurrency] * currentDollarPrice
  
  nonZeroWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency.includes('USD') ? '' : `@ ${currentDollarPrice} = $${currentDollarVolume}`} `)
    if (currentMarket !== '') {
      console.log(`Target price: ${targetDollarPrice} = $${targetDollarVolume}`)
      console.log(`EMA1: ${currentMarket.ema1}`)
      console.log(`EMA2: ${currentMarket.ema2}`)
    }

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

async function getMarkets(currency) {
  let markets = await fetchMarkets()
  let marketNames = Object.keys(markets).filter(market => goodMarket(market, markets, currency))
  let voluminousMarkets = await checkMarkets(marketNames, currency)
  return voluminousMarkets
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

function goodMarket(market, markets, currency) {
  if (market.includes('USDT') && market.indexOf('USDT') === 0) { return false }
  return markets[market].active 
  && !market.includes('UP') 
  && !market.includes('DOWN') 
  && (market.includes(`${currency}/`) || market.includes(`/${currency}`)) 
  && !market.includes('BUSD')
  && !market.includes('TUSD')
  && !market.includes('USDC')
}

async function checkMarkets(marketNames, currency) {
  let voluminousMarkets = []
  let symbolNames = marketNames.map(marketname => marketname = marketname.replace('/', ''))
  let n = symbolNames.length
  let tallyObject = { 
    assets: { 
      total: 0, unique: 0 
    }, 
    bases: { 
      total: 0, unique: 0 
    } 
  }
  for (let i = 0; i < n; i ++) {
    let symbolName = symbolNames[i]
    let marketName = marketNames[i]
    // tally(marketName, tallyObject)
    let announcement = `Checking 24 hour volume of market ${i+1}/${n} - ${symbolName} - `

    let response = await checkMarket(marketNames[i], currency)
    if (response === "Insufficient volume" || 
        response === "No dollar comparison available" || 
        response === "Insufficient movement" ||
        response === "No Response") {
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
  console.log('\n')
  // fs.appendFile('all market tally.txt', JSON.stringify(tallyObject), function(err) {
  //   if (err) return console.log(err);
  // })
  return voluminousMarkets
}

// async function tally(marketName, tallyObject) {
//   try {
//     let asset = marketName.substring(0, marketName.indexOf('/'))
//     let base = marketName.substring(marketName.indexOf('/')+1)
//     if (Object.keys(tallyObject.assets).includes(asset)) {
//       tallyObject.assets[asset].push(base)
//       tallyObject.assets[asset][0] += 1
//     } else {
//       tallyObject.assets[asset] = [0, base]
//       tallyObject.assets[asset][0] = 1
//       tallyObject.assets.unique ++
//     }
//     if (Object.keys(tallyObject.bases).includes(base)) {
//       tallyObject.bases[base].push(asset)
//       tallyObject.bases[base][0] += 1
//     } else {
//       tallyObject.bases[base] = [asset]
//       tallyObject.bases[base][0] = 1
//       tallyObject.bases.unique ++
//     }
//     tallyObject.assets.total ++
//     tallyObject.bases.total ++
//   } catch (error) {
//     console.log(error.message)
//   }
// }

async function checkMarket(marketName, base) {
  let symbolName = marketName.replace('/', '')
  let twentyFourHour = await fetch24Hour(symbolName, base)
  if (twentyFourHour.data !== undefined) {
    let price = parseFloat(twentyFourHour.data.weightedAvgPrice)
    let assetVolume = parseFloat(twentyFourHour.data.volume)
    let change = parseFloat(twentyFourHour.data.priceChangePercent)
    let i = symbolName.indexOf(base)
    let baseVolume = i === 0 ? assetVolume : assetVolume * price
    if (base !== 'USDT') {
      let dollarMarket = `${base}/USDT`
      currentDollarPrice = await fetchPrice(dollarMarket)
    }
    if (baseVolume * currentDollarPrice < minimumDollarVolume) { return "Insufficient volume"} 
    if (Math.abs(change) < minimumMovement) { return "Insufficient movement" }
    if (baseVolume === 'Invalid market') { return 'Invalid Market' }
    return 'Sufficient volume'
  } else {
    return "No Response"
  }
  
}

async function fetch24Hour(symbol, base) {
  try {
    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
    return twentyFourHour
  } catch (error) {
    return 'Invalid market'
  }
}

async function getBullishMarkets(marketNames, activeCurrency) {
  try {
    console.log('Fetching history\n')
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
      console.log(`Fetching history of market ${i+1}/${n} - ${marketName}`)
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
  console.log('\n')
  return returnArray
}

async function fetchOneHistory(symbolName) {
  let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`)
  return history.data
}

async function collateData(data) {

  let history = []

  data.history.forEach(period => {

    let average = (parseFloat(period[1]) 
                 + parseFloat(period[2]) 
                 + parseFloat(period[3]) 
                 + parseFloat(period[4])
                 )/4

    history.push({
      'startTime': period[0],
      'open': period[1],
      'high': period[2],
      'low': period[3],
      'close': period[4],
      'endTime': period[6],
      'average': average
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
    console.log('Analysing markets\n\n')
    let outputArray = []
    let n = markets.length
    for (let i = 0; i < n; i++) {
      let market = markets[i]
      console.log(`Fetching current price of market ${i+1}/${n} - ${market.market}`)
      market.currentPrice = await fetchPrice(market.market)
      market.ema1 = ema(market.history, 1, 'average')
      market.ema2 = ema(market.history, 2, 'average')
      market.ema3 = ema(market.history, 3, 'average')
      market.ema5 = ema(market.history, 5, 'average')
      market.ema8 = ema(market.history, 8, 'average')
      market.ema13 = ema(market.history, 13, 'average')
      market.ema21 = ema(market.history, 21, 'average')
      market.ema34 = ema(market.history, 34, 'average')
      market.ema55 = ema(market.history, 55, 'average')
      if (market.market.indexOf(activeCurrency) === 0) {
        if (
         market.currentPrice < market.ema1 &&
          market.ema1 < market.ema2 &&
          market.ema2 < market.ema3 &&
          market.ema3 < market.ema5 &&
          market.ema5 < market.ema8 // &&
          // ema8 < ema13 &&
          // ema13 < ema21 &&
          // ema21 < ema34 &&
          // ema34 < ema55
        ) {
          outputArray.push(market)
        } else {
          // console.log(ema1)
          // console.log(ema2)
          // console.log(ema3)
          // console.log(ema5)
          // console.log(ema8)
          // console.log(ema13)
          // console.log(ema21)
          // console.log(ema34)
          // console.log(ema55)
        }
      } else {
        if (
          market.currentPrice > market.ema1 &&
          market.ema1 > market.ema2 &&
          market.ema2 > market.ema3 &&
          market.ema3 > market.ema5 &&
          market.ema5 > market.ema8 // &&
          // ema8 > ema13 &&
          // ema13 > ema21 &&
          // ema21 > ema34 &&
          // ema34 > ema55
        ) {
          market.movement = market.currentPrice/market.ema55 -1
          outputArray.push(market)
        }
      }
    }
    console.log('\n')
    return outputArray.sort((a, b) => Math.abs(a.movement) - Math.abs(b.movement))
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
  return bestMarket
}

// async function rank(markets) {
//   let outputArray = []
//   markets.forEach(market => {
//     console.log(market)
//     let marketName = market.market
//     let currentPrice = market.currentPrice
//     let ema1 = ema(market.history, 1, 'average')
//     let ema2 = ema(market.history, 2, 'average')
//     let ema3 = ema(market.history, 3, 'average')
//     let ema20 = ema(market.history, 20, 'average')
//     let ema50 = ema(market.history, 50, 'average')
//     let history = market.history
//     outputArray.push({
//       'market': marketName,
//       'currentPrice': currentPrice,
//       'movement': currentPrice/ema50 -1,
//       'ema1': ema1,
//       'ema2': ema2,
//       'ema3': ema3,
//       'ema20': ema20,
//       'ema50': ema50,
//       'fetched': new Date(market.history[market.history.length-1].endTime - 59000).toLocaleString(),
//       'history': history
//     })
//   })
//   return outputArray.sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement))
// }

async function trade(market, activeCurrency, marketNames) {
  market.market.indexOf(activeCurrency) === 0 ?
  await newSellOrder(market, activeCurrency) :
  await newBuyOrder(market, activeCurrency, marketNames)
}

async function newSellOrder(market, asset) {
  let tradeReport
  try {
    let assetPrice = await fetchPrice(market.market)
    let base = market.market.replace(`${asset}/`, '')
    let assetVolume = wallet[asset]
    if (wallet[base] === undefined) { wallet[base] = 0 }
    wallet[base] += assetVolume * (1 - fee) * assetPrice
    wallet[asset] -= assetVolume
    currentMarket = ''
    targetVolume = 0
    tradeReport = `${timeNow()} - Sold ${n(assetVolume, 8)} ${asset} @ ${n(assetPrice, 8)} ($${assetVolume * (1 - fee) * assetPrice})\n\n`
    activeCurrency = base
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
    console.log(tradeReport)
    tradeReport = ''
  } catch (error) {
    console.log(error)
  }
}

async function newBuyOrder(market, base, marketNames) {
  let tradeReport
  try {
    let assetPrice = await fetchPrice(market.market)
    let asset
    if (market.market.indexOf(base) === 0) {
      asset = market.market.substring(market.market.indexOf('/')+1)
    } else {
      asset = market.market.substring(0, market.market.indexOf('/'))
    }
    let dollarMarkets = marketNames.filter(marketName => marketName.includes(asset) && marketName.includes('USDT'))
    let dollarMarket = dollarMarkets[0]
    let baseVolume = wallet[base]
    if (wallet[asset] === undefined) { wallet[asset] = 0 }
    wallet[base] -= baseVolume
    wallet[asset] += baseVolume * (1 - fee) / assetPrice
    currentDollarPrice = await fetchPrice(dollarMarket)
    currentDollarVolume = wallet[asset] * currentDollarPrice
    targetDollarVolume = baseVolume * (1 + fee)
    targetDollarPrice = targetDollarVolume / wallet[asset]
    currentMarket = market
    tradeReport = `${timeNow()} - Bought ${n(wallet[asset], 8)} ${asset} @ ${n(assetPrice, 8)} ($${baseVolume})\n\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
    console.log(tradeReport)
    tradeReport = ''
  } catch (error) {
    console.log(error)
  }
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}

run();
