var ampq = require('amqplib/callback_api')
var faker = require('faker');

RABBITMQ_HOST = "amqp://user:qxevtnump90@...:5672/"

amqp.connect(RABBITMQ_HOST, function(err, conn) {
  if (err != null) bail(err);

  // handl consuming from fanout exchange
  channel.assertExchange("sagas", 'fanout', {
    durable: false
  });

  channel.assertQueue('', {
    exclusive: true
  }, function(error2, q) {
    if (error2) {
      throw error2;
    }
  })

  channel.bindQueue(q.queue, exchange, '');
  channel.consume(q.queue, function(msg) {
    if (msg.content) {
      console.log(" [x] %s", msg.content.toString());
      var value = msg.content.toString()
      if value.startsWith("Undo ") {

        process.send({
          "type": "compensation",
          'productId': value.split(" ")[1],
        })

      } else {
        var productId = parseInt(value)

        fake_ratings = {}
        fake_ratings[faker.name.findName()] = faker.random.number()
        fake_ratings[faker.name.findName()] = faker.random.number()
        fake_ratings[faker.name.findName()] = faker.random.number()

        if (process.send) {
          process.send({
            "type": "transaction",
            'productId': productId,
            "fake_ratings": fake_ratings
          })
          channel.sendToQueue('responses', "success")
        } else {
          channel.sendToQueue('responses', "failure")
        }
      }

    }
  }, {
    noAck: true
  });
});