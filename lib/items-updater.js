'use strict'

const H = require('highland')
const cluster = require('cluster')
const UpdaterBase = require('./updater-base')

const ItemSierraRecord = require('./models/item-sierra-record')
const db = require('./db')
const utils = require('./utils')
const config = require('config')
const IndexerRunner = require('./indexer-runner')
const SourceLoader = require('./sources/loader')
const itemSerializer = require('./serializers/item')
const nyplApi = require('./nyplDataApi')
const Shadowcat = require('./shadowcat')
const kmsHelper = require('./kms-helper')
let log = require('./logger')

// var itemsSource = new NdJsonSource('./ndjson/items_all_2016-12-24-old.ndjson')

if (!config.has('itemsSource')) {
  log.error('No itemsSource configured.')
  process.exit()
}
var itemsSource = SourceLoader.load(config.get('itemsSource'))

const CACHE_TO_DISK = false

class ItemsUpdater extends UpdaterBase {
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

  update (options, items) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        debug: () => {}
      }
    }

    log.info(`ItemsUpdater#update: Processing ${items.length} items: ${items.map((item) => item.id).join(', ')}`, { id: items.map((item) => item.id) })
    var stream = H(items)
      .map((item) => ItemSierraRecord.from(item))

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

  _processItemStream (stream, options) {
    options = options || {}

    var totalProcessed = 0
    return new Promise((resolve, reject) => {
      stream
        .map((b) => {
          log.debug('Processing item', b)
          return b
        })
        .map((item) => this.extractStatements(item).then((statements) => ({ statements, item })))
        .flatMap((r) => H(r))
        // Ensure serializer extracted some statements:
        .filter((s) => s.statements && s.statements.length > 0)
        .map((stmts) => {
          log.debug(`Got ${stmts.statements ? stmts.statements.length : 'null'} statements for ${stmts.item.id}`, { id: stmts.item.id, nyplSource: stmts.item.nyplSource })
          return stmts
        })
        .reduce([], (memo, batch) => memo.concat(batch.statements)) // Flatten array
        .map((statements) => db.upsertStatements('resource', statements).then(() => statements)) // Save statements
        .flatMap((r) => H(r))
        .map((statements) => db.deleteStaleStatements('resource', statements).then(() => statements)) // Delete extra (previously serialized) statements
        .flatMap((r) => H(r))
        .map((statements) => {
          // Report on success
          // Get distinct subject_ids:
          var num = Object.keys(statements.reduce((h, statement) => {
            h[statement.subject_id] = true
            return h
          }, {})).length

          if (options.onUpdate) options.onUpdate(num)
          totalProcessed += num
          log.info(`ItemsUpdater#update: Saved batch of ${num} (${statements.length} statements): (${totalProcessed} total processed, index ${totalProcessed + options.offset})`)
          return statements
        })
        .map((batch) => this._writeToIndexDocumentQueue(batch)) // Write to IndexDocumentQueue stream
        .flatMap((r) => H(r))
        .stopOnError((e) => reject(this.handleError(e, '...')))
        .done(function (err) {
          if (err) log.error(err)
          log.info(`ItemsUpdater#update: Done updating ${totalProcessed} resources (from ${options.offset || 0}, limit ${options.limit || '[unbounded]'})`)
          if (options.onDone) options.onDone()

          db.disconnect()

          resolve(totalProcessed)
        })
    })
  }

  // Takes a batch of inserted records, writes to IndexDocument stream
  _writeToIndexDocumentQueue (batch) {
    let streamName = process.env.INDEX_DOCUMENT_STREAM_NAME
    let schemaName = process.env.INDEX_DOCUMENT_SCHEMA_NAME
    // Make sure stream-writing is configured
    if (streamName && schemaName) {
      // Get distinct bib ids by grabbing distinct objectIds from the known nypl:bnum pred
      var distinctBibIds = Object.keys(
        batch
          .filter((s) => s.predicate === 'nypl:bnum')
          .map((s) => s.object_id.replace('urn:bnum:', ''))
          .reduce((h, bnum) => {
            h[bnum] = true
            return h
          }, {})
      )
      // Submit bib ids to write stream:
      var recs = distinctBibIds.map((uri) => {
        return { type: 'record', uri }
      })
      return this._writeToStreamsClient(streamName, recs, schemaName)
        .then(() => log.debug(`Wrote ${recs.length} to ${streamName} (encoded against ${schemaName})`))
    } else return Promise.resolve(batch)
  }

  validForSerialization (item) {
    var valid = true

    valid = valid && item.id

    return valid
  }

  uriFromApi (id) {
    var prefix = id.match(/^[a-z]+/)[0]
    id = id.replace(prefix, '')
    var nyplSource = 'sierra-nypl'
    if (prefix === 'pi') nyplSource = 'recap-pul'
    if (prefix === 'ci') nyplSource = 'recap-cul'

    return this.itemByApi(nyplSource, id)
      .catch((e) => {
        log.info('ItemsUpdater#uriFromApi: Failed to find in api: ' + id)
        // Fallback on cache:
        return utils.readJson(`./cache/items/${nyplSource}/${id}.json`)
          .then((item) => {
            log.info('ItemsUpdater#uriFromApi: Actually, found it cached: ' + item.id)
            return item
          })
          .catch((e) => log.error('Could not find item by cache'))
      })
      .then((item) => {
        if (!item) return Promise.reject()

        log.debug('Got item from api', item)
        return item
      })
      .then(ItemSierraRecord.from)
      .then((item) => {
        log.info('ItemsUpdater#uriFromApi: Processing single-item stream: [' + item.id + ']')
        return this._processItemStream(
          H([item])
        )
      })
      .catch((e) => log.error('Error: ', e))
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
      log.info(`ItemsUpdater#itemByShadowcat: Got item via shadowcat ${id}:`, item)
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
      var offset = opts.offset || 0
      run(offset, offset + opts.limit)
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
        onDone: () => process.exit(),
        onLog: (str) => {
          return null
        }
      }
      if (opts.disablescreen) {
        delete events.onLog
      }
      opts.offset = msg.start
      opts.limit = msg.total

      kmsHelper.decryptDbCreds().then((dbConnectionString) => {
        db.setConn(dbConnectionString)
      }).then(() => {
        var items = itemsSource.stream().slice(msg.start, msg.start + msg.total)
        ; (new ItemsUpdater()).update(Object.assign({}, events, opts), items)
      })
    })
  }
}

module.exports = ItemsUpdater
