'use strict'

var kafka = require('kafka-node')
// var ReadableStream = require('stream').Readable
var _ = require('highland')

/*
class MessageStream extends ReadableStream {
  constructor (onRead) {
    super()
    this.onRead = onRead
  }
  _read () {
    this.push(this.onRead())
    // this.onRead((m) => this.push(m))
  }
}
*/

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

    return _('message', this.consumer)
    /*
    return new MessageStream((push) => {
      this.consumer.on('message', function (message) {
        console.log(`${topic}[${message.offset}(${message.partition})]: ${message.value}`)
        // if (cb) cb(null, message)
        // push(message)
        push(message.offset)
      }).on('error', function (err) {
        // cb(err)
        console.log('ERROR: ', err)
      })
    })
    */
  }

}

module.exports = { KafkaProducer, KafkaConsumer }
