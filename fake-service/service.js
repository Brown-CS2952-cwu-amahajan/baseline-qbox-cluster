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

var active_add_requests = {}
var active_delete_requests = {}

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

    tracked_messages[id] = {
        "state": "TRANSACTION",
        "count": 0,
        "success": 0
    }

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
                    operation: "ADDITION",
                    parentQueue: process.env.HANDLE_RESPONSES_QUEUE,
                    responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                })))
                log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent transaction to " + children[i]})
            }
        })
    })
    active_add_requests[id] = res
})

dispatcher.onGet(/^\/saga-delete\/[0-9]*/, function(req, res) {

    var id = req.url.split('/').pop()
    id = parseInt(id)

    tracked_messages[id] = {
        "state": "TRANSACTION",
        "count": 0,
        "success": 0
    }
    
    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Received saga-delete request"})

    delete_id(id)

    log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Stored saga-delete request locally"})

    ampq.connect(RABBITMQ_HOST, function(err, conn) {
        conn.createChannel(function(err, ch) {
            log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Created publishing channel for transactions"})
            if (err !== null) {
                console.error(err);
                process.exit(1);
            }

            for (i = 0; i < children.length; i++) {
                ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                    id: id,
                    type: "TRANSACTION",
                    operation: "DELETION",
                    parentQueue: process.env.HANDLE_RESPONSES_QUEUE,
                    responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                })))
                log_message({"id": id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent transactions to " + children[i]})
            }
        })
    })

    active_delete_requests[id] = res
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

                if (process.env.SHOULD_FAIL) {

                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Failed to insert transaction", "message": content})
                    ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                        id: content.id,
                        success: false,
                        parentQueue: content.parentQueue,
                        respondingTo: content.type,
                        operation: content.operation,
                        source: process.env.INCOMING_QUEUE_NAME,
                    })))
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent false to response queue" + content.responseQueue, "message": content})

                } else {

                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Modifying local log", "message": content})
                    if ((content.type === "TRANSACTION" && content.operation == "DELETION") || (content.type === "COMPENSATION" && content.operation == "ADDITION")) {
                        delete_id(content.id)
                    }
                    if ((content.type === "TRANSACTION" && content.operation == "ADDITION") || (content.type === "COMPENSATION" && content.operation == "DELETION")) {
                        add_id(content.id)
                    }
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Modified local log", "message": content})

                    ch.sendToQueue(content.responseQueue, Buffer.from(JSON.stringify({
                        id: content.id,
                        success: true,
                        operation: content.operation,
                        parentQueue: content.parentQueue,
                        respondingTo: content.type,
                        source: process.env.INCOMING_QUEUE_NAME
                    })))

                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent true to response queue" + content.responseQueue, "message": content})

                }

            } else {

                tracked_messages[content.id] = {
                    "state": "TRANSACTION",
                    "count": 0,
                    "success": 0
                }

                for (i = 0; i < children.length; i++) {
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Beginning to issue nested transaction...", "message": content})
                    ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                        type: content.type,
                        id: content.id,
                        operation: content.operation,
                        parentQueue: content.parentQueue,
                        responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                    })))
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issue nested transaction to " + children[i], "message": content})
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
            log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "state": tracked_messages[content.id], "message": content})

            if (tracked_messages[content.id]["state"] !== content.respondingTo) {
                log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Received " + content.respondingTo + " when expecting " + tracked_messages[content.id]["state"] + ", discarding", "message": content})
                return
            }

            tracked_messages[content.id]["count"] += 1

            if (tracked_messages[content.id]["count"] === children.length) {
                if (!content.parentQueue.startsWith(process.env.INCOMING_QUEUE_NAME)) {
                    ch.sendToQueue(content.parentQueue, Buffer.from(JSON.stringify({
                        id: content.id,
                        success: true,
                        respondingTo: content.respondingTo,
                        operation: content.operation,
                        parentQueue: content.parentQueue,
                        source: process.env.INCOMING_QUEUE_NAME,
                    })))
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Replied success response to parent " + content.parentQueue, "message": content})
                } else {

                    if (content.operation === "ADDITION") {
                        var queue = active_add_requests
                    } else {
                        var queue = active_delete_requests
                    }

                    var res = queue[content.id]
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Sent back response to caller"})
                    res.writeHead(tracked_messages[content.id]["status"] === "TRANSACTION" ? 200 : 500, {'Content-type': 'application/json'})
                    res.end(JSON.stringify(local_log))
                    delete queue[content.id]

                }
            }

            if (!content.success) {

                if (content.type === "TRANSACTION") {

                    tracked_messages[content.id]["status"] = "COMPENSATION"
                    tracked_messages[content.id]["count"] = 0

                    for (i = 0; i < children.length; i++) {
                        ch.sendToQueue(children[i], Buffer.from(JSON.stringify({
                            type: "COMPENSATION",
                            id: content.id,
                            operation: content.operation,
                            parentQueue: content.parentQueue,
                            responseQueue: process.env.HANDLE_RESPONSES_QUEUE,
                        })))
                        log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issued compensation to " + children[i], "message": content})
                    }
                    log_message({"id": content.id, "process": process.env.INCOMING_QUEUE_NAME, "action": "Issued compensation to all", "message": content})
                }

            } else {

                tracked_messages[content.id]["success"] += 1
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