// Copyright 2017 Istio Authors
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

var ampq = require('amqplib/callback_api')
var http = require('http')
var dispatcher = require('httpdispatcher')
var faker = require('faker');

ampq.connect('amqp://localhost', function(err, conn) {
  if (err != null) bail(err);
  consumer(conn);
  publisher(conn);
})

var port = parseInt(process.argv[2])

var userAddedRatings = [] // used to demonstrate POST functionality

var unavailable = false
var healthy = true

if (process.env.SERVICE_VERSION === 'v-unavailable') {
    // make the service unavailable once in 60 seconds
    setInterval(function () {
        unavailable = !unavailable
    }, 60000);
}

if (process.env.SERVICE_VERSION === 'v-unhealthy') {
    // make the service unavailable once in 15 minutes for 15 minutes.
    // 15 minutes is chosen since the Kubernetes's exponential back-off is reset after 10 minutes
    // of successful execution
    // see https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy
    // Kiali shows the last 10 or 30 minutes, so to show the error rate of 50%,
    // it will be required to run the service for 30 minutes, 15 minutes of each state (healthy/unhealthy)
    setInterval(function () {
        healthy = !healthy
        unavailable = !unavailable
    }, 900000);
}

dispatcher.onGet(/^\/ratings\/add\/[0-9]*/, function (req, res) {

  var productIdStr = req.url.split('/').pop()
  var productId = parseInt(productIdStr)

  fake_ratings = {}
  fake_ratings[faker.name.findName()] = faker.random.number()
  fake_ratings[faker.name.findName()] = faker.random.number()
  fake_ratings[faker.name.findName()] = faker.random.number()
  // [1, 2, 3].map(_ => {
  //   fake_ratings[faker.name.findName()] = faker.random.number()
  // })

  putLocalReviews(productId, fake_ratings)
  res.writeHead(200, { 'Content-type': 'application/json' })
  res.end(JSON.stringify(userAddedRatings))
})

dispatcher.onGet(/^\/ratings\/delete\/[0-9]*/, function (req, res) {

  var productIdStr = req.url.split('/').pop()
  var productId = parseInt(productIdStr)

  removeLocalReviews(productId)
  res.writeHead(200, { 'Content-type': 'application/json' })
  res.end(JSON.stringify(userAddedRatings))
})

dispatcher.onPost(/^\/ratings\/[0-9]*/, function (req, res) {
  var productIdStr = req.url.split('/').pop()
  var productId = parseInt(productIdStr)
  var ratings = {}

  if (Number.isNaN(productId)) {
    res.writeHead(400, {'Content-type': 'application/json'})
    res.end(JSON.stringify({error: 'please provide numeric product ID'}))
    return
  }

  try {
    ratings = JSON.parse(req.body)
  } catch (error) {
    res.writeHead(400, {'Content-type': 'application/json'})
    res.end(JSON.stringify({error: 'please provide valid ratings JSON'}))
    return
  }
})

dispatcher.onGet(/^\/ratings\/[0-9]*/, function (req, res) {
  var productIdStr = req.url.split('/').pop()
  var productId = parseInt(productIdStr)

  if (Number.isNaN(productId)) {
    res.writeHead(400, {'Content-type': 'application/json'})
    res.end(JSON.stringify({error: 'please provide numeric product ID'}))
  } else {
      if (process.env.SERVICE_VERSION === 'v-faulty') {
        // in half of the cases return error,
        // in another half proceed as usual
        var random = Math.random(); // returns [0,1]
        if (random <= 0.5) {
          getLocalReviewsServiceUnavailable(res)
        } else {
          getLocalReviewsSuccessful(res, productId)
        }
      }
      else if (process.env.SERVICE_VERSION === 'v-delayed') {
        // in half of the cases delay for 7 seconds,
        // in another half proceed as usual
        var random = Math.random(); // returns [0,1]
        if (random <= 0.5) {
          setTimeout(getLocalReviewsSuccessful, 7000, res, productId)
        } else {
          getLocalReviewsSuccessful(res, productId)
        }
      }
      else if (process.env.SERVICE_VERSION === 'v-unavailable' || process.env.SERVICE_VERSION === 'v-unhealthy') {
          if (unavailable) {
              getLocalReviewsServiceUnavailable(res)
          } else {
              getLocalReviewsSuccessful(res, productId)
          }
      }
      else {
        getLocalReviewsSuccessful(res, productId)
      }
  }
})

dispatcher.onGet('/health', function (req, res) {
    if (healthy) {
        res.writeHead(200, {'Content-type': 'application/json'})
        res.end(JSON.stringify({status: 'Ratings is healthy'}))
    } else {
        res.writeHead(500, {'Content-type': 'application/json'})
        res.end(JSON.stringify({status: 'Ratings is not healthy'}))
    }
})




function putLocalReviews (productId, ratings) {
  userAddedRatings[productId] = {
    id: productId,
    ratings: ratings
  }
  return getLocalReviews(productId)
}

function removeLocalReviews (productId) {
  if (productId in userAddedRatings) {
    delete userAddedRatings[productId]
  }
  return null
}

function getLocalReviewsSuccessful(res, productId) {
  res.writeHead(200, {'Content-type': 'application/json'})
  res.end(JSON.stringify(getLocalReviews(productId)))
}

function getLocalReviewsServiceUnavailable(res) {
  res.writeHead(503, {'Content-type': 'application/json'})
  res.end(JSON.stringify({error: 'Service unavailable'}))
}

function getLocalReviews (productId) {
  if (typeof userAddedRatings[productId] !== 'undefined') {
      return userAddedRatings[productId]
  }
  return {
    id: productId,
    ratings: {
      'Reviewer1': 5,
      'Reviewer2': 4
    }
  }
}

function handleRequest (request, response) {
  try {
    console.log(request.method + ' ' + request.url)
    dispatcher.dispatch(request, response)
  } catch (err) {
    console.log(err)
  }
}

var server = http.createServer(handleRequest)

server.listen(port, function () {
  console.log('Server listening on: http://0.0.0.0:%s', port)
})
