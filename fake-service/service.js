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
var RABBITMQ_HOST = "amqp://user:qxevtnump90@rabbitmq.default.svc:5672/"

if (process.env.CHILD_QUEUES) {
    var children = process.env.CHILD_QUEUES.split(";");
}

var local_log = {}
var tracked_messages = {}

function parse(str) {
    var args = [].slice.call(arguments, 1),
        i = 0;

    return str.replace(/%s/g, () => (args[i++]));
}

function log_message(value) {
    var time = process.hrtime()
    console.log(parse("[%s] %s", JSON.stringify(time[0] * 1000000 + time[1] / 1000), JSON.stringify(value)))
}

function add_id(id) {
    if (!(id in local_log)) {
        fake_data = faker.random.number()
        local_log[id] = fake_data   
    }  
}

function delete_id(id) {
    if(id in local_log) {
        delete local_log[id]
    }
}

dispatcher.onGet(/^\/saga-add\/[0-9]*/, function(req, res) {

    var id = req.url.split('/').pop()
    id = parseInt(id)

    tracked_messages[id] = 0

    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Received saga-add request"})
    
    add_id(id)

    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Stored saga-add request locally"})

    ampq.connect(RABBITMQ_HOST, function(err, conn) {
        conn.createChannel(function(err, ch) {
            log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Created publishing channel for transactions"})
            if (err !== null) {
                console.error(err);
                process.exit(1);
            }
            
            var messages = {}

            for (i = 0; i < children.length; i++) {
                ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                    id: id,
                    type: "TRANSACTION",
                    parentQueue: process.env.HANDLE_RESPONSES_QUEUE,
                    responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                })))
                log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent transaction to " + children[i]})
            }
        })
    })

    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent back success to caller"})

    res.writeHead(200, {'Content-type': 'application/json'})
    res.end(JSON.stringify(local_log))
})

dispatcher.onGet(/^\/saga-delete\/[0-9]*/, function(req, res) {

    var id = req.url.split('/').pop()
    id = parseInt(id)
    
    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Received saga-delete request"})

    delete_id(id)

    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Stored saga-delete request locally"})

    ampq.connect(RABBITMQ_HOST, function(err, conn) {
        conn.createChannel(function(err, ch) {
            log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Created publishing channel for compensations"})
            if (err !== null) {
                console.error(err);
                process.exit(1);
            }

            for (i = 0; i < children.length; i++) {
                ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                    id: id,
                    type: "COMPENSATION",
                    responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                })))
                log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent compensating transaction to " + children[i]})
            }
        })
    })

    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent back success to caller"})

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

            log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Received message", "message": content})

            if (!process.env.INTERMEDIATE) {

                if (content.type === "TRANSACTION") {
                    if (process.env.SHOULD_FAIL) {
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Failed to insert transaction", "message": content})
                        ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                            id: content.id,
                            success: false,
                            parentQueue: content.parentQueue,
                            respondingTo: "TRANSACTION",
                            source: process.env.INCOMING_QUEUE_NAME,
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent false to response queue" + content.responseQueue, "message": content})
                    } else {
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Adding to local log", "message": content})
                        add_id(content.id)
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Added to local log", "message": content})
                        ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                            id: content.id,
                            success: true,
                            parentQueue: content.parentQueue,
                            respondingTo: "TRANSACTION",
                            source: process.env.INCOMING_QUEUE_NAME
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent true to response queue" + content.responseQueue, "message": content})
                    }
                }

                if (content.type === "COMPENSATION") {
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Deleting from local log", "message": content})
                    delete_id(content.id)
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Deleted from local log", "message": content})
                    ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                        id: content.id,
                        success: true,
                        respondingTo: "COMPENSATION",
                        parentQueue: content.parentQueue,
                        source: process.env.INCOMING_QUEUE_NAME
                    })))
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent true to response queue for compensations" + content.responseQueue, "message": content})
                }

            } else {

                tracked_messages[content.id] = 0

                for (i = 0; i < children.length; i++) {
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Beginning to issue nested transaction...", "message": content})
                    if (content.type === "TRANSACTION") {
                        ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                            type: "TRANSACTION",
                            id: content.id,
                            parentQueue: content.parentQueue,
                            responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issue nested transaction to " + children[i], "message": content})
                    }
                    if (content.type === "COMPENSATION") {
                        ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                            id: content.id,
                            type: "COMPENSATION",
                            parentQueue: content.parentQueue,
                            responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issue nested compensating transaction to " + children[i], "message": content})
                    }
                }
            }
        }
    }, {
      noAck: true
    });

    ch.assertQueue(process.env.HANDLE_RESPONSES_QUEUE);
    ch.consume(process.env.HANDLE_RESPONSES_QUEUE, function(msg) {
        if (msg !== null) {
            var content = JSON.parse(msg.content.toString())
            log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Received response to transaction", "message": content})
            if (content.respondingTo !== "COMPENSATION") {
                if (content.success) {
                    tracked_messages[content.id] += 1
                    if (tracked_messages[content.id] === (children.length)) {
                        if (process.env.INTERMEDIATE && !content.parentQueue.startsWith(process.env.INCOMING_QUEUE_NAME)) {
                            ch.sendToQueue(content.parentQueue, Buffer.from(JSON.stringify({
                                id: content.id,
                                success: true,
                                parentQueue: content.parentQueue,
                                source: process.env.INCOMING_QUEUE_NAME
                            })))
                            log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Replied success response to parent " + content.parentQueue, "message": content})
                        }
                    }
                }
                if (!content.success) {
                    tracked_messages[content.id] = 0
                    for (i = 0; i < children.length; i++) {
                        ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                            id: content.id,
                            type: "COMPENSATION",
                            responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issued cancellation to " + children[i], "message": content})
                    }
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issued all cancellations", "message": content})
                    if (process.env.INTERMEDIATE && !content.parentQueue.startsWith(process.env.INCOMING_QUEUE_NAME) ) {
                        ch.sendToQueue(content.parentQueue, Buffer.from(JSON.stringify({
                            id: content.id,
                            success: false,
                            respondingTo: "TRANSACTION",
                            parentQueue: content.parentQueue,
                            source: process.env.INCOMING_QUEUE_NAME
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Replied success response to parent " + content.parentQueue, "message": content})
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