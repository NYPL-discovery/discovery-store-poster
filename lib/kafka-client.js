'use strict'

const log = require('loglevel')
var kafka = require('kafka-node')
var _ = require('highland')

const KAFKA_ENDPOINT = 'kafka.nypltech.org:2181'

class KafkaClient {
  constructor (options) {
    options = options || {}
    options = Object.assign({ endpoint: KAFKA_ENDPOINT, client_id: 'kafka-node-client-1' }, options)
    this.client = new kafka.Client(options.endpoint, options.client_id)
  }

  minOffset (topic) {
    return this.offsets(topic).then((offsets) => offsets.min)
  }

  currentOffset (topic) {
    return this.offsets(topic).then((offsets) => offsets.max)
  }

  offsets (topic) {
    var offset = new kafka.Offset(this.client)
    // time: -1 fetches "latest" offset(s) whereas time: -2 fetches "earliest", so have to issue both calls and merge:
    return Promise.all(
      [-1, -2].map((time) => {
        return new Promise((resolve, reject) => {
          offset.fetch([{ topic, partition: 0, time, maxNum: 2 }], (err, data) => {
            if (err) reject(err)
            else {
              resolve(data[topic][0].map((v) => parseInt(v)))
            }
          })
        })
      })
    ).then((offsets) => {
      offsets = [].concat.apply([], offsets)
      log.info('KafkaClient: got offsets: ', offsets)
      return {
        min: Math.min.apply(null, offsets),
        max: Math.max.apply(null, offsets)
      }
    })
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
    // this.consumer = new kafka.HighLevelConsumer(this.client, [{topic, offset: options.offset}], {autoCommit: false, fromOffset: true, encoding: 'buffer'})
    this.consumer = new kafka.Consumer(this.client, [{topic, offset: options.offset, partition: 0}], {autoCommit: false, fromOffset: true, encoding: 'buffer'})
    log.info('KafkaClient: consuming: ', {topic, offset: options.offset})

    // Get a highland stream using the consumer as an event emitter
    return _('message', this.consumer)
  }

}

module.exports = { KafkaProducer, KafkaConsumer }
