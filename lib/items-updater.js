'use strict'

const _ = require('highland')
const log = require('loglevel')

const SierraRecord = require('./models').SierraRecord
const AvroSchemas = require('./avro-schemas')
const PcdmItemSerializer = require('./pcdm-serializer').PcdmItemSerializer
const db = require('./db')
const utils = require('./utils')

var KafkaConsumer = require('./kafka-client').KafkaConsumer

class ItemsUpdater {
  deserialize (buffered, avro) {
    var item = {}

    try {
      item = avro.fromBuffer(buffered.value, 'Item', buffered.offset)
      log.info(`ItemsUpdater#deserialized ${buffered.offset}: ${item.nyplSource}: ${item.id}`)
    } catch (e) {
      log.error('__________ERROR__ Error decoding value: ', e)
    }

    return item
  }

  saveToDisc (item) {
    var path = `./cache/items/${item.nyplSource}/${item.id}.json`
    return utils.writeFile(path, JSON.stringify(item, null, 2)).then(() => item)
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

      stream = stream.map((b) => this.deserialize(b, avro))
        .map(this.saveToDisc)
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290
        .map(SierraRecord.from)
        .filter(this.validForSerialization)
        .compact()
        .map((b) => PcdmItemSerializer.serialize(b))
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290
        .map((b) => {
          log.debug('Serialized: ', b)
          return b
        })
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

    /* var itemType = (item.fixed('Item Type'))
    var validItemType = itemType && itemType.match(/^\d+$/) && parseInt(itemType) <= 100
    valid = valid && validItemType
    if (!validItemType) log.info('  Skipping branch item:', item.id, itemType)
    */

    return valid
  }
}

module.exports = ItemsUpdater
