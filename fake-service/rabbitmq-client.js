var ampq = require('amqplib/callback_api')
var faker = require('faker')

var local_log = {}

function add_id(id) {
     fake_data = faker.random.number()
     local_log[id] = fake_data     
}

function delete_id(id) {
    if(id in local_log) {
        delete local_log[id]
    }
}

RABBITMQ_HOST = "amqp://user:qxevtnump90@...:5672/"
amqp.connect(RABBITMQ_HOST, function(err, conn) {
  if (err != null) bail(err);

  ch.assertQueue(process.env.INCOMING_QUEUE_NAME);
  channel.consume(q.queue, function(msg) {

  }, {
    noAck: true
  });
});