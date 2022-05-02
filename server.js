const fs = require('fs');
const ccxt = require('ccxt');
const axios = require('axios')



const minimumDollarVolume = 1000000



const binance = new ccxt.binance({

  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,

});

async function run() {

  await record(`\n ---------- \n\n\nRunning at ${timeNow()}\n`)
  let wallet = simulatedWallet()
  let allMarkets = await fetchMarkets()
  let goodMarketNames = Object.keys(allMarkets).filter(marketName => goodMarketName(marketName, allMarkets))

  tick(wallet, goodMarketNames)

}

function record(report) {

  fs.appendFile(`server-trade-history.txt`, report, function(err) {
    if (err) return console.log(err);
  })

  console.log(report)

}

function timeNow() {

  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

function simulatedWallet() {

  return [
    {
      name      : 'USDT',
      quantity  : 1000
    }
  ]
}

async function fetchMarkets() {
  try {
    let markets = await binance.load_markets()
    return markets
  } catch (error) {
    console.log(error.message)
  }
  
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
  && marketName === 'GBP/USDT'
  // && !marketName.includes('BNB')

}

async function tick(wallet, goodMarketNames) {

  try {
    console.log(`\n\n----- Tick at ${timeNow()} -----\n\n`)
    await refreshWallet(wallet)
    displayWallet(wallet)
    const viableMarketNames = await getViableMarketNames(goodMarketNames)
    let viableMarkets = await fetchAllHistory(viableMarketNames)
    viableMarkets = await addEMA(viableMarkets)
    await displayMarkets(viableMarkets)
    console.log(viableMarkets)

  } catch (error) {
    console.log(error)
  }

  tick(wallet, goodMarketNames)

}

async function refreshWallet(wallet) {

  const n = wallet.length

  for (let i = 0; i < n; i ++) {
    const currency = wallet[i]
    currency.price = currency.name === 'USDT' ? 1 : await fetchPrice(`${currency.name}USDT`)
    currency.dollarQuantity = currency.quantity * currency.price
  }

  return wallet
  
}

async function fetchPrice(marketName) {

  try {

    let symbolName = marketName.replace('/', '')
    let rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    let price = parseFloat(rawPrice.data.price)
    return price

  } catch (error) {

    console.log(error.message)
  }
}

function displayWallet(wallet) {

  console.log('Wallet')
  wallet.map(currency => {
    console.log(`${currency.quantity} ${currency.name} @ ${currency.price} = $${currency.dollarQuantity}`)
  })
  console.log(`Total: $${getDollarTotal(wallet)}`)
}

function getDollarTotal(wallet) {
  let total = 0
  wallet.map(currency => {
    total += currency.dollarQuantity
  })
  return total
}

async function getViableMarketNames(marketNames) {
  console.log('Finding viable markets ... ')
  let voluminousMarketNames = []
  let symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  let n = symbolNames.length

  for (let i = 0; i < n; i++) {

    let symbolName = symbolNames[i]
    let marketName = marketNames[i]
    let response = await checkVolume(symbolName)

    if (!response.includes("Insufficient") && response !== "No response") {
    
      voluminousMarketNames.push(marketName)
    }
  }

  console.log('\n')
  return voluminousMarketNames

}

async function checkVolume(symbolName) {

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

async function fetchAllHistory(marketNames) {

  console.log('Fetching history ...\n')
  let n = marketNames.length
  let returnArray = []

  for (let i = 0; i < n; i ++) {

    try {

      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let response = await fetchOneHistory(symbolName)

      let symbolObject = {

        name      : marketName,
        histories : response
      }

      symbolObject = await annotateData(symbolObject)

      await returnArray.push(symbolObject)

    } catch (error) {
      console.log(error.message)
    }
  }

  console.log('\n')
  return returnArray

}

async function fetchOneHistory(symbolName) {

  try {
    
    let minuteHistory = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`, { timeout: 10000 })
    let hourHistory   = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1h`, { timeout: 10000 })
    let dayHistory    = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1d`, { timeout: 10000 })
    
    return {
      minutes : minuteHistory.data, 
      hours   : hourHistory.data, 
      days    : dayHistory.data
    }

  } catch (error) {
    
    return 'No response'

  }
}

async function annotateData(data) {

  try {

    let histories = {}

    Object.keys(data.histories).map(periods => {

      let history = []
      data.histories[periods].forEach(period => {
  
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
      histories[periods] = history
  
  })
    let outputObject = {
  
      name: data.name,
      histories: histories

    }
  
    return outputObject

  } catch(error) {

    console.log(error.message)

  }
}

async function addEMA(markets) {

  try {

    // console.log('Analysing markets\n\n')
    markets.map(market => {
      market.emas = {
        days: {
          ema13   : ema(market.histories.days,  13,  'close'),
          ema34   : ema(market.histories.days,  34,  'close'),
          ema89   : ema(market.histories.days,  89,  'close'),
          ema233  : ema(market.histories.days, 233,  'close')
        }, 
        hours: {
          ema13   : ema(market.histories.hours,  13,  'close'),
          ema34   : ema(market.histories.hours,  34,  'close'),
          ema89   : ema(market.histories.hours,  89,  'close'),
          ema233  : ema(market.histories.hours, 233,  'close')
        }, 
        minutes: {
          ema13   : ema(market.histories.minutes,   13, 'close'),
          ema34   : ema(market.histories.minutes,   34, 'close'),
          ema89   : ema(market.histories.minutes,   89, 'close'),
          ema233  : ema(market.histories.minutes,  233, 'close')
        }
      }
    })

    return markets

  } catch (error) {

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
  markets.map(market => {
    console.log(`
      ${market.name} ...`)
  })

  console.log('\n\n')
}

run()