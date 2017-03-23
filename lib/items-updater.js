'use strict'

const H = require('highland')
var log = require('loglevel')
const cluster = require('cluster')

const ItemSierraRecord = require('./models/item-sierra-record')
const db = require('./db')
const utils = require('./utils')
const config = require('config')
const IndexerRunner = require('./indexer-runner')
const SourceLoader = require('./sources/loader')
const itemSerializer = require('./serializers/item')
const nyplApi = require('./nyplDataApi')
const Shadowcat = require('./shadowcat')
const KinesisWriter = require('./KinesisWriter')

// var itemsSource = new NdJsonSource('./ndjson/items_all_2016-12-24-old.ndjson')

if (!config.has('itemsSource')) {
  log.error('No itemsSource configured.')
  process.exit()
}
var itemsSource = SourceLoader.load(config.get('itemsSource'))

// const CACHE_TO_DISK = false

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
    // if (CACHE_TO_DISK) return utils.writeFile(path, JSON.stringify(item, null, 2)).then(() => item)
    return utils.writeFile(path, JSON.stringify(item, null, 2)).then(() => ({ path, item }))
    // else return Promise.resolve(item)
  }

  skip (item) {
    console.warn('Skipping item', item.id)
  }

  update (options, items) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        debug: () => {}
      }
    }

    var stream = H(items.map((item) => ItemSierraRecord.from(item)))

    return this._processItemStream(stream, options)
  }

  statementsForItem (item) {
    return itemSerializer.fromMarcJson(item)
  }

  extractStatements (item) {
    return this.statementsForItem(item)
      .catch((e) => {
        console.log('error extracting stmts: ', e)
        console.trace(e)
        return this.saveToDisc(item).then((r) => {
          console.log('Saved problematic item to disk: ', r.path)
          console.log(`  Run with --uri_cache i${item.id} to test again`)
        })
      })
  }

  handleError (e, message) {
    log.error(`ItemsUpdater# Error ("${message}"): `, e)
    console.trace(e)
    return e
  }

  /* _processItemKinesis (item, options) {
    options = options || {}

    var totalProcessed = 0
    return new Promise((resolve, reject) => {
      this.extractStatements(item)
        .then((statements) => ({ statements, item }))
        .then((b) => {
          log.debug('Statements : ', b.statements)
          return b
        })
        .then((r) => {
          db.upsertStatements('resource', r.statements).then(() => ({ count: r.statements.length, item: r.item }))
          console.log('Writing statements: ', r.statements)
          return r
        })
        .then((object) => {
          // sending to s3/kinesis
          console.log('Writing to kinesis: ', object)
          return (new KinesisWriter()).write(object)
        })
        .then((d) => {
          console.log('item success?')
          resolve()
        }, function (err) {
          if (err) log.error(err)
          reject()
          log.info(`BibsUpdater#update: Done updating ${totalProcessed} resources (${options.offset || 0}, ${options.limit || '[unbounded]'})`)
        })
        .catch((e) => {
          console.log('reject inside _processBibKinesis function', e)
          process.exit()
        })
    })
  }
  */

  _processItemStream (stream, options) {
    options = options || {}

    var totalProcessed = 0
    return new Promise((resolve, reject) => {
      stream
        .map((i) => {
          log.debug('Processing bib: ', JSON.stringify(i, null, 2))
          return i
        })
        .map((item) => this.extractStatements(item).then((statements) => ({ statements, item })))
        .flatMap((r) => H(r))
        .map((b) => {
          log.debug('Statements : ', b.statements)
          return b
        })
        .map((r) => db.upsertStatements('resource', r.statements).then(() => r))
        .flatMap((r) => H(r))
        .map((batch) => {
          var num = 1 // batch && (typeof batch.length) === 'number' ? batch.length : 1
          log.info(`ItemsUpdater#update: Saved batch of ${num} (${batch.statements.length} statements): ${batch.item.id} (${totalProcessed} total processed, index ${totalProcessed + options.offset})`)

          if (options.onUpdate) options.onUpdate(num)
          totalProcessed += num // batch.length
          return batch
        })
        .map((batch) => {
          // sending to s3/kinesis
          return (new KinesisWriter()).write(batch)
        })
        .stopOnError((e) => reject(this.handleError(e, '...')))
        .done(function (err) {
          if (err) log.error(err)
          log.info(`ItemsUpdater#update: Done updating ${totalProcessed} resources (${options.offset || 0}, ${options.limit || '[unbounded]'})`)
          resolve(totalProcessed)
        })
    })
  }

  validForSerialization (item) {
    var valid = true

    valid = valid && item.id

    return valid
  }

  uriFromCache (id) {
    var prefix = id.match(/^[a-z]+/)[0]
    id = id.replace(prefix, '')
    var nyplSource = 'sierra-nypl'
    if (prefix === 'pb') nyplSource = 'recap-PUL'
    if (prefix === 'cb') nyplSource = 'recap-COL'

    // Fetch from cache:
    return utils.readJson(`./cache/items/${nyplSource}/${id}.json`).then((item) => {
      log.info('ItemsUpdater#uriFromCache: Found cached: ' + item.id)
      return item
    }).catch((e) => {
      // Not in cache?
      // Fetch from api:
      return this.itemByApi(nyplSource, id)
        // Not in api? Fetch from shadowcat:
        .catch(() => this.itemByShadowcat(id, true))
    })
      .then(ItemSierraRecord.from)
      .then((item) => {
        log.info('ItemsUpdater#uriFromCache: Processing single-item stream: [' + item.id + ']')
        return this._processItemStream(
          H([item])
        )
      })
  }

  itemByApi (nyplSource, id) {
    log.info('ItemsUpdater#itemByApi: Fetch item by id: ', nyplSource, id)
    return nyplApi.item(nyplSource, id)
      .then((item) => {
        if (item) return item
        else return Promise.reject()
      })
      .catch((e) => {
        log.error(`ItemsUpdater#itemByApi: Error fetching item from api ${id}:`)
        return Promise.reject()
      })
  }

  itemByShadowcat (id, save) {
    save = (typeof save) === 'undefined' ? false : save

    log.info(`ItemsUpdater#itemByShadowcat: Fetch item via shadowcat ${id}:`)
    return Shadowcat.item(id).then((item) => {
      log.info(`ItemsUpdater#itemByShadowcat: Got item via shadowcat ${id}:`)
      // Remove non-marcinjson fields:
      for (var k in item) {
        if (/:/.test(k)) delete item[k]
      }
      // Add nyplSource
      item.nyplSource = 'sierra-nypl'
      return item
    }).then((item) => {
      if (save) return this.saveToDisc(item).then(() => item)
      else return item
    })
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
