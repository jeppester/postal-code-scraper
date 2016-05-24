#!/usr/bin/env node
'use strict'

const http = require('http');
const fs = require('fs');

let minDelay    = 0;
let maxDelay    = 20;
let dataFile    = './codes.small.txt';
let resultsFile = './results.json';
let missingFile = './missing.txt';
let attempted   = [];
let first       = true;

const getDelay = ()=> minDelay + Math.random() * (maxDelay - minDelay)

const wait = ()=> new Promise(function(res) {
  let delay = getDelay();
  console.log('WAITING', delay, 'ms')
  setTimeout(res, getDelay())
})

const startFile = ()=> Promise.resolve(fs.writeFileSync(resultsFile, '{', { flag: 'w' }))
const endFile = ()=> Promise.resolve(fs.appendFileSync(resultsFile, '\n}'))

const fetchpostalCode = (postalCode)=> new Promise(function(res) {
  let request = http.request({
    host: 'maps.googleapis.com',
    port: 80,
    path: `/maps/api/geocode/json?address=${postalCode},danmark`,
  });
  request.on('response', function( response ) {
    response.on('data', function(data) {
      res(data.toString())
    });
  });
  request.end();
})

const processpostalCode = (postalCode, data)=> {
  if (data) {
    data = JSON.parse(data);
    if (data && data.results.length) {
      data = data.results[0];

      if (data.partial_match) {
        console.log('NOT A VALID POSTCODE')
      }
      else {
        console.log('FOUND')
        let result = [ data.geometry.location.lat, data.geometry.location.lng ]

        let line = `\n\t"${postalCode}":${JSON.stringify(result)}`;
        if (!first) {
          line = ',' + line;
          first = false;
        }
        fs.appendFileSync(resultsFile, line)
      }

      return Promise.resolve()
    }
  }
  return Promise.reject()
}

const tryNTimes = (to, times, proxy)=> {
  times = times || 3;

  if (!proxy) {
    proxy = {}
    proxy.promise = new Promise((res, rej)=> {
      proxy.resolve = res;
      proxy.reject = rej;
    })
  }

  to()
  .then(proxy.resolve)
  .catch(()=> {
    if (times <= 1) {
      proxy.reject()
    }
    else {
      tryNTimes(to, times - 1, proxy)
    }
  })

  return proxy.promise
}

const findCoordinates = (postalCode)=> new Promise((res)=> {
  if (attempted.indexOf(postalCode) !== -1) {
    return
  }
  attempted.push(postalCode)

  console.log('\nPROCESSING', postalCode);
  tryNTimes(()=> {
    console.log('ATTEMPT')
    return wait()
    .then(()=> fetchpostalCode(postalCode))
    .then((data)=> processpostalCode(postalCode, data))
  }, 4)
  .then(res)
  .catch(()=> {
    console.log('NOT FOUND')
    fs.appendFileSync(missingFile, `${postalCode}\n`)
    res()
  })
})


startFile()
.then(()=> {
  // Check all numbers in the range [1000-9999]
  let codes = [];
  for (var i = 1000; i < 10000; i++) {
    codes.push(i.toString())
  }
  return Promise.resolve(codes)
})
.then((postalCodes)=> {
  let p = Promise.resolve()
  postalCodes.forEach((postalCode)=> {
    ((first)=> {
      p = p.then(()=> findCoordinates(postalCode, first))
    })(first)
    first = false;
  })
  return p.catch((e)=> console.log(e.stack || e))
})
.then(endFile)
.then(()=> process.exit())
.catch((e)=> console.log(e.stack || e))
