'use strict'

const _ = require('highland')
const log = require('loglevel')

const AvroSchemas = require('./avro-schemas')
const PcdmItemSerializer = require('./pcdm-serializer').PcdmItemSerializer
const db = require('./db')

var KafkaConsumer = require('./kafka-client').KafkaConsumer

class ItemsUpdater {
  processItem (buffered) {
    var item = {}

    try {
      item = AvroSchemas.fromBuffer(buffered.value, 'Item')
    } catch (e) {
      log.error('__________ERROR__ Error decoding value: ', e)
      log.error('  value: ', buffered.value)

      AvroSchemas.checkValid(buffered.value, 'Item', (path, any, type) => {
        log.error(`Invalid field: ${path.join('.')}=${any} ; Should be ${type}`)
      })
    }

    if (this.validForSerialization(item)) {
      log.debug('________________________________________________________\nSerializing ', JSON.stringify(item, null, 2))
      return PcdmItemSerializer.serialize(item)
    } else {
      this.skip(item)
      return null
    }
  }

  skip (item) {
    console.warn('Skipping item', item.id)
  }

  update (offset, limit, options) {
    log.info('ItemsUpdater#update: reading from kafka offset', offset || 0, ', limit', limit || '[unbounded]')
    AvroSchemas.initialize().then((avro) => {
      var stream = (new KafkaConsumer()).consume('Item', { offset })

      // Apply limit, if given
      if (limit) stream = stream.take(limit)

      var totalProcessed = 0

      stream = stream
        .map((b) => this.processItem(b))
        .compact()
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290
        .stopOnError((e) => {
          log.error('Error with: ', e)
          process.exit()
        })

      if (options.debug) {
        stream.each((obj) => {
          log.debug('________________________________________________________\nSaving', JSON.stringify(obj, null, 2))
        })
        .done()
      } else {
        // stream
          // .map((record) => db.resources.updateItemData(record))
        stream.batchWithTimeOrCount(100, 100)
          .map((records) => db.resources.upsertMany(records)) // Save records in bulk
          .flatMap((promise) => _(promise))             // Resolve mongo insert promises
          .map((batch) => {
            log.info(`Saved batch of ${batch.length}`)
            totalProcessed += batch.length
            return batch
          })
          .stopOnError((e) => {                         // Check for mongo errors
            console.error('Error saving:', e)
            process.exit()
          })
          .done(function (err) {
            if (err) console.info(err)
            log.info(`Done updating ${totalProcessed} resources (${offset}, ${limit})`)
            process.exit()
          })
      }
    }, (err) => {
      console.error('Error: ', err)
    })
  }

  validForSerialization (item) {
    var valid = true

    valid = valid && item.id

    return valid
  }
}

module.exports = ItemsUpdater
