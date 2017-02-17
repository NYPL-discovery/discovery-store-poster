'use strict'

const _ = require('highland')
var log = require('loglevel')
const cluster = require('cluster')

const ItemSierraRecord = require('./models/item-sierra-record')
// const AvroSchemas = require('./avro-schemas')
const PcdmItemSerializer = require('./pcdm-serializer').PcdmItemSerializer
// const db = require('./db')
const utils = require('./utils')
const nyplApi = require('./nyplDataApi')
// const config = require('config')
const IndexerRunner = require('./indexer-runner')
const NdJsonSource = require('./sources/ndjson')
const itemSerializer = require('./serializers/item')

// var KafkaConsumer = require('./kafka-client').KafkaConsumer
// var itemsSource = new KinesisSource('Bib')
var itemsSource = new NdJsonSource('./ndjson/items_all_2016-12-24-old.ndjson')

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

  update (options) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        debug: () => {}
      }
    }

    var stream = itemsSource.stream()

    // Apply skip & limit, if given
    if (options.offset) stream = stream.drop(options.offset)
    if (options.limit) stream = stream.take(options.limit)

    var consumed = 0
    stream = stream
      .map((b) => {
        consumed += 1
        log.debug('consumed: ', consumed)
        return b
      })
      // .map((b) => this.deserialize(b, avro))
      .map((b) => ItemSierraRecord.from(b))

    if (options.seek) stream = stream.filter((r) => '' + r.id === '' + options.seek)

    return this._processItemStream(stream, options)
  }

  statementsForItem (item) {
    return itemSerializer.fromMarcJson(item)
  }

  extractStatements (item) {
    return this.statementsForItem(item)
  }

  handleError (e, message) {
    log.error(`ItemsUpdater# Error ("${message}"): `, e)
    console.trace(e)
    process.exit()
  }

  _processItemStream (stream, options) {
    var totalProcessed = 0
    stream
      .map((b) => {
        log.debug('Processing item: ', b)
        return b
      })
      .map((b) => this.extractStatements(b))
      .flatMap((r) => _(r))
      .stopOnError((e) => this.handleError(e, '...'))
      .map((b) => {
        log.debug('Statements : ', b)
        return b
      })
      // .map((r) => _(db.upsertStatements('resource', r)))
      .flatMap((r) => _(r))
      .map((batch) => {
        var num = 1 // batch && (typeof batch.length) === 'number' ? batch.length : 1
        log.info(`ItemsUpdater#update: Saved batch of ${num}`)
        if (options.onUpdate) options.onUpdate(num)
        totalProcessed += num // batch.length
        return batch
      })
      .stopOnError((e) => this.handleError(e, '...'))
      // .each((b) => console.log('save ', b))
      .done(function (err) {
        if (err) log.error(err)
        log.info(`ItemsUpdater#update: Done updating ${totalProcessed} resources (${options.offset || 0}, ${options.limit || '[unbounded]'})`)
        process.exit()
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

      // return db.resources.upsertOne(serialized).then(() => {
      //   log.info(`ItemsUpdater#_saveItem: Done updating ${item.id}`)
      // })
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
        item = ItemSierraRecord.from(item)
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

    var run = (start, end) => {
      var runner = new IndexerRunner('resources', cluster, {
        botCount: opts.threads,
        useScreen: !opts.disablescreen,
        start,
        end
      })
      runner.run()
    }

    // If explicit limit given, only process given amount
    // otherwise use current max offset
    if (opts.limit) {
      run(opts.offset || 0, opts.limit)
    } else {
      itemsSource.count().then((count) => {
        run(opts.offset || 0, count)
      })
    }
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
      if (opts.disablescreen) {
        delete events.onLog
      }
      opts.offset = msg.start
      opts.limit = msg.total
      ; (new ItemsUpdater()).update(Object.assign({}, events, opts))
    })
  }
}

module.exports = ItemsUpdater
