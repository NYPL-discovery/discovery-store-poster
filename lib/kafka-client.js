'use strict'

var kafka = require('kafka-node')
var _ = require('highland')

class KafkaClient {
  constructor (options) {
    options = options || {}
    options = Object.assign({ endpoint: 'kafka.nypltech.org:2181/', client_id: 'kafka-node-client' }, options)
    this.client = new kafka.Client(options.endpoint, options.client_id)
  }
}

class KafkaProducer extends KafkaClient {
  constructor (options) {
    super(options)
    this.producer = new kafka.Producer(this.client)
  }

  produce (topic, messages) {
    this.producer.on('ready', () => {
      var payloads = [{ topic, messages }]

      var onComplete = function (err, data) {
        if (err) {
          console.log('ERROR: ', err)
        }
      }

      this.producer.send(payloads, onComplete)
    })
  }
}

class KafkaConsumer extends KafkaClient {
  consume (topic, options) {
    this.consumer = new kafka.Consumer(this.client, [{topic, offset: options.offset}], {autoCommit: false, fromOffset: true, encoding: 'buffer'})

    // Get a highland stream using the consumer as an event emitter
    return _('message', this.consumer)
  }

}

module.exports = { KafkaProducer, KafkaConsumer }
