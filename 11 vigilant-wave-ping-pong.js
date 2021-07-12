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
const fee = 0.00075
const volatilityDuration = 2
const minimumMovement = 2
const stopLossThreshold = 0.98
const timeOut = 8 * 60 * 1000 // (desired minutes) * seconds * ms === 8 minutes

// Functions

async function run() {

  await recordTrade(`\n ---------- \n\n\nRunning at ${timeNow()}\n\n`)

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



async function tick(wallet, markets, allMarketNames, currentMarket, marketNames) {

  console.log('\n\n----------\n\n')
  console.log(`Tick at ${timeNow()}\n`)
  let activeCurrency = await getActiveCurrency(wallet)
  await displayWallet(wallet, allMarketNames, activeCurrency, currentMarket)
  console.log('\n')

  if (activeCurrency === 'USDT') {
    
    let response = await tryBuy(wallet)
    wallet = response['wallet']
    markets = response['markets']
    currentMarket = markets[0]

  } else {

    currentMarket = { name: `${activeCurrency}/USDT` }
    
    if (markets === undefined) {

      markets = await updateMarkets()

    } else {

      if (marketNames === undefined) {

        marketNames = []

        markets.forEach(market => {
          marketNames.push(market.name)
        })

      }

      markets = await fetchAllHistory(marketNames, currentMarket.name)

      if (markets[markets.length-1] === 'No response for current market') {

        markets.pop()
        return tick(wallet, markets, allMarketNames, currentMarket, marketNames)

      }

      markets = await sortByArc(markets)

    }

    markets = await addEMA(markets)
    await displayMarkets(markets)
    let bulls = markets.filter(market => market.shape > 0 && market.trend === 'up') // && market.ema1 > market.ema233)
    let bestMarket = bulls[0]
    let currentMarketArray = markets.filter(market => market.name === currentMarket.name)

    if (currentMarketArray.length > 0) {

      currentMarket = currentMarketArray[0]

    }

    currentMarket.currentPrice = await fetchPrice(currentMarket.name)

    if (bestMarket !== undefined) {

      console.log('Best market name')
      console.log(bestMarket.name)

    } else {

      console.log('No viable markets')

    }
    
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
 
    // if (
    //   currentMarketArray.length > 0 &&
    //   bestMarket !== undefined && 
    //   bestMarket.name !== currentMarket.name &&
    //   currentMarket.currentPrice > wallet.targetPrice 
    // )
    // {
    //   console.log(bestMarket.name)
    //   console.log(currentMarket.name)
    //   console.log(currentMarket.currentPrice)
    //   console.log(wallet.targetPrice)
    //   await newSellOrder(wallet, currentMarket, 'Better market located - profitable switch')
    // }  
  // else if
  //   (
  //     currentMarketArray.length > 0 &&
  //     currentMarket.shape <= 0     
  //   )
  //   {     
  //     console.log(currentMarket.shape) 
  //     await newSellOrder(wallet, currentMarket, 'Market crashing - switch at possible loss')
  //   }
  // else if
  //   (
  //     currentMarketArray.length > 0 &&
  //     currentMarket.ema1 < currentMarket.ema233
  //   )
  //   {     
  //     console.log(currentMarket.ema1)
  //     console.log(currentMarket.ema233)

  //     await newSellOrder(wallet, currentMarket, 'EMA down - switch at possible loss')
  //   }

  // else 
  if 
    (
      currentMarketArray.length > 0 &&
      currentMarket.currentPrice > wallet.targetPrice &&
      currentMarket.currentPrice < wallet.stopLossPrice
    ) 
    {
      console.log(currentMarket.currentPrice)
      console.log(wallet.targetPrice)
      console.log(wallet.stopLossPrice)
      await newSellOrder(wallet, currentMarket, 'Below stop loss - profitable switch')
    }
  else if 
    (
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
  // else if
  //   (
  //     currentMarketArray.length > 0 &&
  //     currentMarket.trend === 'down' &&
  //     currentMarket.currentPrice > wallet.targetPrice
    
  //   ) 
  //   {
  //     await newSellOrder(wallet, currentMarket, 'Trending down - profitable switch')
  //   }
  }

  tick(wallet, markets, allMarketNames, currentMarket, marketNames)
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



async function displayWallet(wallet, marketNames, activeCurrency, currentMarket) {

  let nonZeroWallet = Object.keys(wallet.currencies).filter(currency => wallet.currencies[currency]['quantity'] > 0)
  console.log('Wallet')
  let dollarVolume
  let dollarPrice

  if (activeCurrency !== 'USDT') {

    let dollarSymbol = `${activeCurrency}USDT`
    dollarPrice = await fetchPrice(dollarSymbol)

    if (dollarPrice === 'No response') {

      console.log('Currency information unavailable  - starting new tick')
      tick(wallet)

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



async function tryBuy(wallet) {

  let markets = await updateMarkets()
  markets = await addEMA(markets)
  await displayMarkets(markets)
  let bulls = markets.filter(market => market.shape > 0 && market.trend === 'up') // && market.ema1 > market.ema233)

  if (bulls.length === 0) {

    console.log('No viable markets\n')
  
  } else {

    let bestMarket = bulls[0]
    let response = await newBuyOrder(wallet, bestMarket)
    wallet = response['wallet']
  }
  
  return {
    'markets': markets,
    'wallet': wallet
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
  let viableMarketNames = await getViableMarketNames(marketNames)
  let markets = await fetchAllHistory(viableMarketNames)
  markets = await sortByArc(markets)
  return markets
}



async function getMarketNames() {

  console.log(`Fetching overview\n`)
  let markets = await fetchMarkets()
  let marketNames = Object.keys(markets).filter(marketName => goodMarketName(marketName, markets))
  return marketNames
}



async function fetchMarkets() {

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
      market.ema2 = ema(market.history, 2, 'close')
      market.ema233 = ema(market.history, 233, 'close')
    }
    return markets

  } catch (error) {

    console.log(error)

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



async function newBuyOrder(wallet, market) {
  
  try {

    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let base = market.name.substring(slash+1)
    let response = await fetchPrice(market.name)

    if (response === 'No response') {

      console.log(`No response - starting new tick`)
      tick(wallet)

    } else {

      let currentPrice = response
      let baseVolume = wallet.currencies[base]['quantity']
      if (wallet.currencies[asset] === undefined) { wallet.currencies[asset] = { 'quantity': 0 } }
      let volumeToTrade = baseVolume * (1 - fee)
      wallet.currencies[base]['quantity'] -= volumeToTrade
      wallet.currencies[asset]['quantity'] += volumeToTrade * (1 - fee) / currentPrice
      let targetVolume = baseVolume * (1 + fee)
      wallet.targetPrice = targetVolume / wallet.currencies[asset]['quantity']
      wallet.stopLossPrice = wallet.targetPrice * stopLossThreshold
      wallet.highPrice = currentPrice
      wallet.boughtTime = Date.now()
      let tradeReport = `${timeNow()} - Bought ${n(wallet.currencies[asset]['quantity'], 8)} ${asset} @ ${n(currentPrice, 8)} ($${baseVolume * (1 - fee)})\nWave Shape: ${market.shape}  Target Price - ${wallet.targetPrice}\n\n`
      await recordTrade(tradeReport)
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



function recordTrade(report) {

  fs.appendFile(`${process.env.COMPUTER} trade-history.txt`, report, function(err) {
    if (err) return console.log(err);
  })

  console.log(report)

} 



async function newSellOrder(wallet, market, sellType) {

  let tradeReport

  try {
    
    let slash = market.name.indexOf('/')
    let asset = market.name.substring(0, slash)
    let base = market.name.substring(slash + 1)
    let assetVolume = wallet.currencies[asset]['quantity']

    if (wallet.currencies[base] === undefined) { wallet.currencies[base] = { 'quantity': 0 } }
    wallet.currencies[base]['quantity'] += assetVolume * (1 - fee) * market.currentPrice
    wallet.currencies[asset]['quantity'] -= assetVolume
    wallet.targetPrice = undefined
    tradeReport = `${timeNow()} - Sold ${n(assetVolume, 8)} ${asset} @ ${n(market.currentPrice, 8)} ($${wallet.currencies[base]['quantity']}) [${sellType}]\n\n`
    recordTrade(tradeReport)
    tradeReport = ''

  } catch (error) {
    
    console.log(error)

  }
}



function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}



run();