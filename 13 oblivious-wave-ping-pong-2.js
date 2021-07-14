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
const stopLossThreshold = 0.98
// const timeOut = 8 * 60 * 1000 // (desired minutes) * seconds * ms === 8 minutes

// Functions

async function run() {

  await record(`\n ---------- \n\n\nRunning at ${timeNow()}\n\n`)

  let wallet = simulatedWallet()
  let allMarkets = await fetchMarkets()
  let goodMarketNames = Object.keys(allMarkets).filter(marketName => goodMarketName(marketName, allMarkets))
  let currentMarket

  tick(wallet, goodMarketNames, currentMarket)

}



function record(report) {

  fs.appendFile(`${process.env.COMPUTER} trade-history-13.txt`, report, function(err) {
    if (err) return console.log(err);
  })

  console.log(report)

}



function simulatedWallet() {

  return { 
  
    currencies: {
      'USDT': {
        'quantity': 1000,
        'dollarValue': 1000
      }
    }
  }
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



async function tick(wallet, goodMarketNames, currentMarket) {

  console.log('\n\n----------\n\n')
  console.log(`Tick at ${timeNow()}\n`)
  let activeCurrency = await getActiveCurrency(wallet)
  await displayWallet(wallet, activeCurrency, goodMarketNames, currentMarket)
  console.log('\n')

  if (activeCurrency === 'USDT') {

    console.log(`Fetching overview\n`)
    currentMarket = undefined
    let viableMarketNames = await getViableMarketNames(goodMarketNames)
    let viableMarkets = await fetchAllHistory(viableMarketNames)
    viableMarkets = await sortByArc(viableMarkets)
    viableMarkets = await addEMA(viableMarkets)
    await displayMarkets(viableMarkets)
    let bulls = getBulls(viableMarkets)
    console.log('\n')

    if (bulls.length === 0) {

      console.log('No bullish markets\n')
  
    } else {

      let n = bulls.length

      for (let i = 0; i < n; i ++) {

        let bestMarket = bulls[i]
        let currentPrice = await fetchPrice(bestMarket.name)

        if (currentPrice > bestMarket.ema233) {

          let response = await newBuyOrder(wallet, bestMarket, goodMarketNames, currentMarket)
          currentMarket = response['market']
          wallet = response['wallet']
          i = n
        }
      }
    }
  } else {

    let currentMarketName = `${activeCurrency}/USDT`
    let viableMarketNames = await getViableMarketNames(goodMarketNames)

    if (!viableMarketNames.includes(currentMarketName)) {
      viableMarketNames.push(currentMarketName)
    }

    let viableMarkets = await fetchAllHistory(viableMarketNames, currentMarketName)
    
    if (viableMarkets[viableMarkets.length-1] === 'No response for current market') {

      viableMarkets.pop()
      return tick(wallet, goodMarketNames, currentMarket)

    }
    
    viableMarkets = await sortByArc(viableMarkets)
    viableMarkets = await addEMA(viableMarkets)
    await displayMarkets(viableMarkets)
    console.log('Current market name')
    console.log(currentMarketName)
    console.log(viableMarkets)
    let currentMarketArray = viableMarkets.filter(market => market.name === currentMarketName)
    currentMarket = currentMarketArray[0]
    let bulls = getBulls(viableMarkets)
    console.log('Current market')
    console.log(currentMarket)

    if (bulls.length === 0) {

      console.log('No bullish markets\n')
  
    }
    
    currentMarket.currentPrice = await fetchPrice(currentMarket.name)
    
    console.log('Current market price')
    console.log(currentMarket.currentPrice)
    console.log('Current market shape')
    console.log(currentMarket.shape)
    console.log('currentMarket.ema1')
    console.log(currentMarket.ema1)
    console.log('currentMarket.ema233')
    console.log(currentMarket.ema233)
    console.log('currentMarket.trend')
    console.log(currentMarket.trend)
    console.log('Wallet')
    console.log(wallet)

    if (
      currentMarketArray.length > 0 &&
      currentMarket.currentPrice > wallet.targetPrice &&
      currentMarket.currentPrice < wallet.stopLossPrice
    ) 
    {
      console.log(currentMarket.currentPrice)
      console.log(wallet.targetPrice)
      console.log(wallet.stopLossPrice)
      await newSellOrder(wallet, currentMarket, 'Below stop loss - profitable switch')
    
    } else if (

      currentMarketArray.length > 0 &&
      currentMarket.currentPrice < wallet.targetPrice &&
      currentMarket.currentPrice < wallet.stopLossPrice
    ) 
    {
      console.log(currentMarket.currentPrice)
      console.log(wallet.targetPrice)
      console.log(wallet.stopLossPrice)
      await newSellOrder(wallet, currentMarket, 'Below stop loss - switch at loss')
    }
  }
  tick(wallet, goodMarketNames, currentMarket)
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



async function displayWallet(wallet, activeCurrency, goodMarketNames, currentMarket) {

  let nonZeroWallet = Object.keys(wallet.currencies).filter(currency => wallet.currencies[currency]['quantity'] > 0)
  console.log('Wallet')
  let dollarVolume
  let currentPrice

  if (activeCurrency !== 'USDT') {

    let dollarSymbol = `${activeCurrency}USDT`
    currentPrice = await fetchPrice(dollarSymbol)
    
    if (currentPrice === 'No response') {

      console.log('Currency information unavailable  - starting new tick')
      tick(wallet, goodMarketNames, currentMarket)
    
    } else {

      dollarVolume = wallet.currencies[activeCurrency]['quantity'] * currentPrice

      if (currentPrice > wallet.highPrice) { 
      
        wallet.highPrice = currentPrice
        wallet.stopLossPrice = wallet.highPrice * stopLossThreshold
      
      }
    }
  }
  
  nonZeroWallet.forEach(currency => {

    console.log(`${wallet.currencies[currency]['quantity']} ${currency} ${currency !== 'USDT' ? `@ ${currentPrice} = $${dollarVolume}` : '' } `)
    
    if (currency === activeCurrency && currency !== 'USDT') {

      console.log(`Target Price - ${wallet.targetPrice}`)
      console.log(`Stop Loss Price - ${wallet.stopLossPrice}`)
    }
  })
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
  && !marketName.includes('BNB')

}



async function getViableMarketNames(marketNames) {

  let voluminousMarketNames = []
  let symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  let n = symbolNames.length

  for (let i = 0; i < n; i++) {

    let symbolName = symbolNames[i]
    let marketName = marketNames[i]
    let announcement = `Checking 24 hour volume of market ${i+1}/${n} - ${symbolName} - `
    let response = await checkVolumeAndMovement(symbolName)

    if (response.includes("Insufficient") || response === "No response") {
      
      symbolNames.splice(i, 1)
      marketNames.splice(i, 1)
      i--
      n--

    } else {

      voluminousMarketNames.push(marketName)
    }

    console.log(announcement + response)
  }
  console.log('\n')
  return voluminousMarketNames

}



async function checkVolumeAndMovement(symbolName) {

  let twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    if (twentyFourHour.data.quoteVolume < minimumDollarVolume) { return "Insufficient volume" }
    return 'Sufficient volume'
  
  } else {

    return "No response"
  }
}



async function fetch24Hour(symbolName) {

  try {

    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolName}`, { timeout: 10000 })
    return twentyFourHour

  } catch (error) {

    return 'Invalid market'
  }
}



async function fetchAllHistory(marketNames, currentMarketName) {

  console.log('Fetching history\n')
  let n = marketNames.length
  let returnArray = []

  for (let i = 0; i < n; i ++) {

    try {

      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let response = await fetchOneHistory(symbolName)

      if (response === 'No response' && marketName === currentMarketName) { 

        console.log(`No response for current market`)
        markets.push(`No response for current market`)
        return markets

      } else if (response === 'No response') { 

        console.log(`No response for market ${i+1}/${n} - ${marketName}`)
      
      } else {

        let symbolHistory = response

        let symbolObject = {
  
          'history': symbolHistory,
          'name': marketName
  
        }
  
        symbolObject = await annotateData(symbolObject)
        console.log(`Fetching history of market ${i+1}/${n} - ${marketName}`)
        await returnArray.push(symbolObject)

      }

    } catch (error) {

    }
  }

  console.log('\n')
  return returnArray

}



async function fetchOneHistory(symbolName) {

  try {
    
    let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`, { timeout: 10000 })
    return history.data

  } catch (error) {
    
    return 'No response'

  }
}



async function annotateData(data) {

  try {

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
          'open'     : parseFloat(period[1]),
          'high'     : parseFloat(period[2]),
          'low'      : parseFloat(period[3]),
          'close'    : parseFloat(period[4]),
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

  } catch(error) {

    console.log(error.message)

  }
}



async function sortByArc(markets) {

  let n = markets.length

  for (let i = 0; i < n; i++) {
    let m = markets[i].history.length
    markets[i].shape = 0
    markets[i].pointHigh = 0
    markets[i].pointLow = 0

    for (let t = 1; t < m-1; t++) {

      let lastPeriod = markets[i].history[t-1]
      let thisPeriod = markets[i].history[t]
      let nextPeriod = markets[i].history[t+1]

      if (thisPeriod['close'] < lastPeriod['close'] && thisPeriod['close'] < nextPeriod['close']) {
         
        // console.log(`lastPeriod['close'] (${lastPeriod['close']}) < thisPeriod['close'] (${thisPeriod['close']}) < nextPeriod['close'] (${nextPeriod['close']})`)

        if (thisPeriod['open'] > markets[i].history[markets[i].pointLow]['close'] && thisPeriod['high']) {

          // console.log(`thisPeriod['open'] (${thisPeriod['open']}) > markets[i].history[markets[i].pointLow]['close'] (${markets[i].history[markets[i].pointLow]['close']})`)

          markets[i].trend = 'up'
          // console.log(`Trending ${markets[i].trend} @ index ${t} vs point low (${markets[i].pointLow}) ... Shape: ${markets[i].shape} + ${thisPeriod['endTime'] * ((thisPeriod['open'] - markets[i].history[markets[i].pointLow]['close']) / thisPeriod['open'])} = `)
          markets[i].shape += thisPeriod['endTime'] * ((thisPeriod['open'] - markets[i].history[markets[i].pointLow]['close']) / thisPeriod['open'])
          markets[i].pointLow = t
          // console.log(`${markets[i].shape} ... New point low: ${markets[i].pointLow}\n`)

        } else if (thisPeriod['open'] < markets[i].history[markets[i].pointLow]['close']) {

          // console.log(`thisPeriod['open'] (${thisPeriod['open']}) < markets[i].history[markets[i].pointLow]['close'] (${markets[i].history[markets[i].pointLow]['close']})`)

          markets[i].trend = 'down'
          // console.log(`Trending ${markets[i].trend} @ index ${t} vs point low (${markets[i].pointLow}) ... Shape: ${markets[i].shape} - ${thisPeriod['endTime'] * ((markets[i].history[markets[i].pointLow]['close'] - thisPeriod['open']) / markets[i].history[markets[i].pointLow]['close'])} = `)
          markets[i].shape -= thisPeriod['endTime'] * ((markets[i].history[markets[i].pointLow]['close'] - thisPeriod['open']) / markets[i].history[markets[i].pointLow]['close'])
          markets[i].pointLow = t
          // console.log(`${markets[i].shape} ... New point low: ${markets[i].pointLow}\n`)
        }

      }

      if (thisPeriod['close'] > lastPeriod['close'] && thisPeriod['close'] > nextPeriod['close']) {
        
        // console.log(`lastPeriod['close'] (${lastPeriod['close']}) > thisPeriod['close'] (${thisPeriod['close']}) > nextPeriod['close'] (${nextPeriod['close']})`)

        if (thisPeriod['open'] > markets[i].history[markets[i].pointHigh]['close']) {

          // console.log(`thisPeriod['open'] (${thisPeriod['open']}) > markets[i].history[markets[i].pointHigh]['close'] (${markets[i].history[markets[i].pointHigh]['close']})`)

          markets[i].trend = 'up'
          // console.log(`Trending ${markets[i].trend} @ index ${t} vs point high (${markets[i].pointHigh}) ... Shape: ${markets[i].shape} + ${thisPeriod['endTime'] * ((thisPeriod['open'] - markets[i].history[markets[i].pointHigh]['close']) / thisPeriod['open'])} = `)
          markets[i].shape += thisPeriod['endTime'] * ((thisPeriod['open'] - markets[i].history[markets[i].pointHigh]['close']) / thisPeriod['open'])
          markets[i].pointHigh = t
          // console.log(`${markets[i].shape} ... New point high: ${markets[i].pointHigh}\n`)

        } else if (thisPeriod['open'] < markets[i].history[markets[i].pointHigh]['close']) {

          // console.log(`thisPeriod['open'] (${thisPeriod['open']}) < markets[i].history[markets[i].pointHigh]['close'] (${markets[i].history[markets[i].pointHigh]['close']})`)

          markets[i].trend = 'down'
          // console.log(`Trending ${markets[i].trend} @ index ${t} vs point high (${markets[i].pointHigh}) ... Shape: ${markets[i].shape} - ${thisPeriod['endTime'] * ((markets[i].history[markets[i].pointHigh]['close'] - thisPeriod['open']) / markets[i].history[markets[i].pointHigh]['close'])} = `)
          markets[i].shape -= thisPeriod['endTime'] * ((markets[i].history[markets[i].pointHigh]['close'] - thisPeriod['open']) / markets[i].history[markets[i].pointHigh]['close'])
          markets[i].pointHigh = t
          // console.log(`${markets[i].shape} ... New point high: ${markets[i].pointHigh}\n`)
        }
      }
    }
  }
  return markets.sort((a, b) => b.shape - a.shape)
}



async function addEMA(markets) {

  try {

    console.log('Analysing markets\n\n')

    let n = markets.length

    for (let i = 0; i < n; i++) {

      let market = markets[i]
      
      market.ema1 = ema(market.history, 1, 'close')
      market.ema233 = ema(market.history, 233, 'close')
    }
    return markets

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



function displayMarkets(markets) {

  markets.forEach(market => {

    console.log(`${market.name} ... ${market.shape} ... trending ${market.trend} ... EMA1 - ${market.ema1} ... EMA233 - ${market.ema233}`)

  })
  console.log('\n\n')
}



function getBulls(markets) {

  let bulls = markets.filter(market => market.shape > 0) // && market.trend === 'up' && market.ema1 > market.ema233) // Try picking a market where the point low is more recent than the point high - this should guarantee it is moving up
  return bulls
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



async function newBuyOrder(wallet, market, goodMarketNames, currentMarket) {
  
  try {

    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let base = market.name.substring(slash+1)
    let response = await fetchPrice(market.name)

    if (response === 'No response') {

      console.log(`No response - starting new tick`)
      tick(wallet, goodMarketNames, currentMarket)

    } else {

      let currentPrice = response
      let baseVolume = wallet.currencies[base]['quantity']
      if (wallet.currencies[asset] === undefined) { wallet.currencies[asset] = { 'quantity': 0 } }
      let volumeToTrade = baseVolume * (1 - fee)
      wallet.currencies[base]['quantity'] -= volumeToTrade
      wallet.currencies[asset]['quantity'] += volumeToTrade * (1 - fee) / currentPrice
      let targetVolume = baseVolume * (1 + fee)
      wallet.targetPrice = targetVolume / wallet.currencies[asset]['quantity']
      wallet.boughtPrice = currentPrice
      wallet.stopLossPrice = wallet.boughtPrice * stopLossThreshold
      wallet.highPrice = currentPrice
      wallet.boughtTime = Date.now()
      let tradeReport = `${timeNow()} - Bought ${n(wallet.currencies[asset]['quantity'], 8)} ${asset} @ ${n(currentPrice, 8)} ($${baseVolume * (1 - fee)})\nWave Shape: ${market.shape}  Target Price - ${wallet.targetPrice}\n\n`
      await record(tradeReport)
      tradeReport = ''
      
      return {
        'market': market, 
        'wallet': wallet
      }
    }

  } catch (error) {
    
    console.log(error)

  }
}



function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}



run();