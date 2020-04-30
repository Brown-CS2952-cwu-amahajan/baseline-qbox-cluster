// Copyright 2017 Istio Authors
//
// Licensed under the Apache License, Version 2.0 (the "License")
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http: // www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var faker = require('faker')
var uuid = require('uuid')
var http = require('http')
var port = parseInt(process.argv[2])
var dispatcher = require('httpdispatcher')
var ampq = require('amqplib/callback_api')
// TODO: Handle and send compensating transactions somehow.
var RABBITMQ_HOST = "amqp://user:qxevtnump90@rabbitmq.default.svc:5672/"

var local_log = {}
var tracked_messages = {}

function add_id(id) {
     fake_data = faker.random.number()
     local_log[id] = fake_data     
}

function delete_id(id) {
    if(id in local_log) {
        delete local_log[id]
    }
}

dispatcher.onGet(/^\/saga-add\/[0-9]*/, function(req, res) {

    var id = req.url.split('/').pop()
    id = parseInt(id)
    
    fake_data = faker.random.number()
    local_log[id] = fake_data

    ampq.connect(RABBITMQ_HOST, function(err, conn) {
        conn.createChannel(function(err, ch) {
            if (err !== null) {
                console.error(err);
                process.exit(1);
            }
            var children = process.env.CHILD_QUEUES.split(";");
            var messages = {}

            for (i = 0; i < children.length(); i++) {
                var message_id = uuid.v4()
                messages[message_id] = children
                ch.sendToQueue(i, Buffer.from(JSON.stringify({
                    message_id: message_id,
                    type: "TRANSACTION",
                    responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                })))
            }
        })
    })

    res.writeHead(200, {'Content-type': 'application/json'})
    res.end(JSON.stringify(local_log))
})

dispatcher.onGet(/^\/get\/[0-9]*/, function(req, res) {

    res.writeHead(200, {'Content-type': 'application/json'})
    res.end(JSON.stringify(local_log))
})

// TODO: Handle and send compensating transactions somehow.
ampq.connect(RABBITMQ_HOST, function(err, conn) {
  if (err != null) {
      console.error(err);
      process.exit(1);
  };

  conn.createChannel(function(err, ch) {

    // channel for handling incoming messages for transactions
    ch.assertQueue(process.env.INCOMING_QUEUE_NAME);
    ch.consume(process.env.INCOMING_QUEUE_NAME, function(msg) {
        if (msg !== null) {
            var content = JSON.parse(msg.content.toString())

            if (!process.env.INTERMEDIATE) {

                if (content.type === "TRANSACTION") {
                    if (process.env.SHOULD_FAIL) {
                        ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                            message: content.message_id,
                            success: false,
                            source: process.env.INCOMING_QUEUE_NAME,
                        })))
                    } else {
                        add_id(content.id)
                        ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                            message: content.message_id,
                            success: true,
                            source: process.env.INCOMING_QUEUE_NAME
                        })))
                    }
                }

                if (content.type === "COMPENSATION") {
                    delete_id(content.id)
                    ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                        message: content.message_id,
                        success: true,
                        source: process.env.INCOMING_QUEUE_NAME
                    })))
                }

            } else {
                var children = process.env.CHILD_QUEUES.split(";");
                var messages = {}

                for (i = 0; i < children.length(); i++) {
                    var message_id = uuid.v4()
                    messages[message_id] = children
                    if (content.type === "TRANSACTION") {
                        ch.sendToQueue(i, Buffer.from(JSON.stringify({
                            message_id: message_id,
                            type: "TRANSACTION",
                            responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                        })))
                    }
                    if (content.type === "COMPENSATION") {
                        ch.sendToQueue(i, Buffer.from(JSON.stringify({
                            message_id: message_id,
                            type: "COMPENSATION",
                            responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                        })))
                    }
                }
            }
        }
    }, {
      noAck: true
    });
  });
});

function handleRequest(request, response) { 
    try {
        console.log(request.method + ' ' + request.url)
        dispatcher.dispatch(request, response)
    } catch(err) {
        console.log(err)
    }
}

var server = http.createServer(handleRequest)

server.listen(port, function() {
    console.log('Server listening on: http://0.0.0.0:%s', port)
})