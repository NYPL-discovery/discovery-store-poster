'use strict'

const _ = require('highland')
const log = require('loglevel')
const cluster = require('cluster')

const SierraRecord = require('./models').SierraRecord
const AvroSchemas = require('./avro-schemas')
const PcdmItemSerializer = require('./pcdm-serializer').PcdmItemSerializer
const db = require('./db')
const utils = require('./utils')
const nyplApi = require('./nyplDataApi')
const config = require('config')
const IndexerRunner = require('./indexer-runner')

var KafkaConsumer = require('./kafka-client').KafkaConsumer
const CACHE_TO_DISK = false

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
    if (CACHE_TO_DISK) return utils.writeFile(path, JSON.stringify(item, null, 2)).then(() => item)
    else return Promise.resolve(item)
  }

  skip (item) {
    console.warn('Skipping item', item.id)
  }

  update (offset, limit, options) {
    log.info(`ItemsUpdater#update: reading from ${config.get('kafka.items.topic')}, offset`, offset || 0, ', limit', limit || '[unbounded]')
    AvroSchemas.initialize().then((avro) => {
      var stream = (new KafkaConsumer()).consume(config.get('kafka.items.topic'), { offset })

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
            if (options.onUpdate) options.onUpdate(batch.length)
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
      console.error('ItemsUpdater#update Error: ', err)
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

  _saveItem (item) {
    log.info('BibsUpdater#_saveItem: ________________________________________________________')

    return PcdmItemSerializer.serialize(item).then((serialized) => {
      log.debug('BibsUpdater#_saveItem: Serialized: ', JSON.stringify(serialized, null, 2))

      return db.resources.upsertOne(serialized).then(() => {
        log.info(`ItemsUpdater#_saveItem: Done updating ${item.id}`)
      })
    })
  }

  item (id) {
    var prefix = id.match(/^[a-z]+/)[0]
    id = id.replace(prefix, '')
    var nyplSource = 'sierra-nypl'
    // nyplSource = 'nypl-test'
    console.log('prefix: ', prefix)
    if (prefix === 'pi') nyplSource = 'recap-PUL'
    if (prefix === 'ci') nyplSource = 'recap-COL'

    if (true) {
      return utils.readJson(`./cache/items/${nyplSource}/${id}.json`).then((item) => {
        item = SierraRecord.from(item)
        this._saveItem(item)
      }).catch((e) => console.error('error: ', e))
    } else {
      log.info('ItemsUpdater#item: Fetch item by id: ', id)
      return nyplApi.item(nyplSource, id).then((item) => {
        if (!item) return Promise.reject('Can not find ', id)

        return this._saveItem(item)
      }).catch((e) => log.error(`ItemsUpdater#item: Error updating item ${id}:`, e))
    }
  }
}

ItemsUpdater.threaded = (opts) => {
  if (cluster.isMaster) {
    opts = Object.assign({
      disablescreen: false,
      threads: 15,
      offset: 0,
      limit: null
    }, opts)

    var run = (total) => {
      var runner = new IndexerRunner('resources', cluster, {
        botCount: opts.threads,
        useScreen: !opts.disablescreen,
        total
      })
      runner.run()
    }

    // If explicit limit given, only process given amount
    // otherwise use current max offset
    if (opts.limit) run(opts.limit)
    else (new KafkaConsumer()).currentOffset(config.get('kafka.items.topic')).then(run)
  } else {
    // ask for where to start
    process.send({ start: true })

    process.on('message', (msg) => {
      if (typeof msg.start !== 'number') return

      var events = {
        onUpdate: (count) => {
          process.send({ totalUpdate: count })
        },
        onLog: (str) => {
          return null
        }
      }
      ; (new ItemsUpdater()).update(msg.start, msg.total, Object.assign({}, events, opts))
    })
  }
}

module.exports = ItemsUpdater
