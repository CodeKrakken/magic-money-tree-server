require('dotenv').config();

const fee = 0.00150
const minimumDollarVolume = 28000000
const minimumMovement = 0.5
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

let targetVolume = 0
let relativeVolume = 1
let lastMarket
let currentDollarVolume = 1000

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  console.log('\n----------\n\n')
  let activeCurrency = await getActiveCurrency()
  let marketNames = await getMarkets(activeCurrency)
  await displayWallet(activeCurrency, marketNames)
  if (lastMarket !== undefined) { 
    await trackMovement(activeCurrency)
    console.log(`Target Volume: ${targetVolume}`)
    console.log(`Current Relative Volume: ${relativeVolume}\n`)
  }

  if (relativeVolume > targetVolume / (1 - fee)) {
    let bullishMarkets = await getBullishMarkets(marketNames, activeCurrency)
    if (bullishMarkets !== undefined && bullishMarkets.length > 0) {
      let bestMarket = await selectMarket(bullishMarkets)
      await trade(bestMarket, activeCurrency)
    } else {
      console.log(`No bulls or bears\n`)
      if (lastMarket !== undefined) {
        trade(lastMarket, activeCurrency)
      }
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
  let dollarPrice
  if (activeCurrency !== 'USDT') {
    let dollarMarkets = marketNames.filter(marketName => marketName.includes('USDT') && marketName.includes(activeCurrency))
    let dollarMarket = dollarMarkets[0]
    dollarPrice = await fetchPrice(dollarMarket)
    currentDollarVolume = wallet[activeCurrency] * dollarPrice
  }
  
  nonZeroWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency.includes('USD') ? '' : `@ ${dollarPrice} = $${currentDollarVolume}`} `)
  })
  console.log('\n')
}

async function trackMovement(activeCurrency) {
  let relativePrice = await fetchPrice(lastMarket.market)
  if (lastMarket.market.indexOf(activeCurrency === 0)) {
    relativeVolume = wallet[activeCurrency] * relativePrice
  } else {
    relativeVolume = wallet[activeCurrency] / relativePrice
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
    if (response === "Insufficient volume" || response === "No dollar comparison available" || response === "Insufficient movement") {
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
  let price = parseFloat(twentyFourHour.data.weightedAvgPrice)
  let assetVolume = parseFloat(twentyFourHour.data.volume)
  let change = parseFloat(twentyFourHour.data.priceChangePercent)
  // console.log(twentyFourHour)
  let i = symbolName.indexOf(base)
  let baseVolume = i === 0 ? assetVolume : assetVolume * price
  let dollarPrice = 1
  if (base !== 'USDT') {
    let dollarMarket = `${base}/USDT`
    dollarPrice = await fetchPrice(dollarMarket)
  }
  if (baseVolume * dollarPrice < minimumDollarVolume) { return "Insufficient volume"} 
  if (Math.abs(change) < minimumMovement) { return "Insufficient movement" }
  if (baseVolume === 'Invalid market') { return 'Invalid Market' }
  return 'Sufficient volume'
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
    console.log('Fetching history')
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
    console.log('Analysing markets\n\n')
    let outputArray = []
    for (let i = 0; i < markets.length; i++) {
      let market = markets[i]
      let currentPrice = await fetchPrice(market.market)
      market.ema1 = ema(market.history, 1, 'close')
      market.ema2 = ema(market.history, 2, 'close')
      market.ema3 = ema(market.history, 3, 'close')
      market.ema8 = ema(market.history, 8, 'close')
      market.ema21 = ema(market.history, 20, 'close')
      market.currentPrice = currentPrice
      if (market.market.indexOf(activeCurrency) === 0) {
        if (
          market.ema1 < market.ema2 &&
          market.ema2 < market.ema3 
        ) {
          outputArray.push(market)
        }
      } else {
        if (
          market.ema1 > market.ema2 &&
          market.ema2 > market.ema3 
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
      'movement': ema2/ema3 -1,
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

async function newSellOrder(market, asset) {
  let tradeReport
  try {
    let assetPrice = await fetchPrice(market.market)
    let base = market.market.replace(`${asset}/`, '')
    let assetVolume = wallet[asset]
    if (wallet[base] === undefined) { wallet[base] = 0 }
    wallet[base] += assetVolume * (1 - fee) * assetPrice
    wallet[asset] -= assetVolume
    targetVolume = assetVolume / (1 - fee)
    lastCurrency = asset
    lastMarket = market
    tradeReport = `${timeNow()} - Sold ${n(assetVolume, 8)} ${asset} @ ${n(assetPrice, 8)} ($${currentDollarVolume})\n\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
    console.log(tradeReport)
    tradeReport = ''
  } catch (error) {
    console.log(error)
  }
}

async function newBuyOrder(market, base) {
  let tradeReport
  try {
    let assetPrice = await fetchPrice(market.market)
    let asset
    if (market.market.indexOf(base) === 0) {
      asset = market.market.substring(market.market.indexOf('/')+1)
    } else {
      asset = market.market.substring(0, market.market.indexOf('/'))
    }
    let baseVolume = wallet[base]
    if (wallet[asset] === undefined) { wallet[asset] = 0 }
    wallet[asset] += baseVolume * (1 - fee) / assetPrice
    wallet[base] -= baseVolume
    targetVolume = baseVolume / (1 - fee) 
    lastCurrency = base
    lastMarket = market
    tradeReport = `${timeNow()} - Bought ${n(wallet[asset], 8)} ${asset} @ ${n(assetPrice, 8)} ($${currentDollarVolume})\n\n`
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
