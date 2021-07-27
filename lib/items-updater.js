'use strict'

const H = require('highland')
var log = require('loglevel')
const cluster = require('cluster')
const UpdaterBase = require('./updater-base')

const ItemSierraRecord = require('./models/item-sierra-record')
const db = require('./db')
const utils = require('./utils')
const IndexerRunner = require('./indexer-runner')
const SourceLoader = require('./sources/loader')
const itemSerializer = require('./serializers/item')
const nyplApi = require('./nyplDataApi')
const kmsHelper = require('./kms-helper')
const NyplSourceMapper = require('discovery-store-models/lib/nypl-source-mapper')

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

    log.info(`ItemsUpdater#update: Processing ${items.length} items: ${items.map((item) => item.id).join(', ')}`)
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
        console.log(`error extracting stmts from item ${item.nyplSource}/${item.id}: `, e)
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
          log.debug('Processing item: ', JSON.stringify(b, null, 2))
          return b
        })
        .map((item) => this.extractStatements(item).then((statements) => ({ statements, item })))
        .flatMap((r) => H(r))
        // Ensure serializer extracted some statements:
        .filter((s) => s.statements && s.statements.length > 0)
        .map((stmts) => {
          log.debug(`Got ${stmts.statements ? stmts.statements.length : 'null'} statements for ${stmts.item.id}`)
          log.debug(`  ${stmts.statements ? stmts.statements.map((s) => `  ${s.predicate}: ${s.object_id || s.object_literal} (${s.object_label})`).join('\n  ') : ''}`)
          return stmts
        })
        .reduce([], (memo, batch) => memo.concat(batch.statements)) // Flatten array
        .map((statements) => db.upsertStatements('resource', statements).then(() => statements)) // Save statements
        .flatMap((r) => H(r))
        .map((statements) => db.deleteStaleStatements('resource', statements, 'item').then(() => statements)) // Delete extra (previously serialized) statements
        .flatMap((r) => H(r))
        .map((statements) => {
          // Report on success
          // Get distinct subject_ids:
          const num = utils.distinctSubjectIds(statements).length

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

  /**
   * This method takes an array of item statements (presumably bound for the
   * database) and extracts all of the bibIds. If the bibId can not be
   * determined for any item (i.e. when processing item deletion), the bibId
   * will be looked up in the database.
   *
   * Returns a Promise that resolves all bibIds.
   */
  _getBibIdsForItemStatements (statements) {
    // Build hash mapping subject_ids to array of statements:
    const subjectIdGroups = statements.reduce((hash, statement) => {
      if (!hash[statement.subject_id]) hash[statement.subject_id] = []
      hash[statement.subject_id].push(statement)
      return hash
    }, {})

    // Turn that hash into a hash mapping subject_ids to bibId (or null if no
    // bibId found):
    const subjectIdsToBibIds = Object.keys(subjectIdGroups).reduce((hash, subjectId) => {
      const bibIdStatement = subjectIdGroups[subjectId].filter((statement) => statement.predicate === 'nypl:bnum')[0]
      hash[subjectId] = bibIdStatement ? bibIdStatement.object_id.replace('urn:bnum:', '') : null
      return hash
    }, {})

    // Since some of those bibIds will be null (item deletion), map our bibIds
    // to an array of Promises that fill in missing bibIds via db lookup:
    const bibIdsToReindex = Object.keys(subjectIdsToBibIds).map((subjectId) => {
      // If bibId is set, resolve it immediately:
      if (subjectIdsToBibIds[subjectId]) return Promise.resolve(subjectIdsToBibIds[subjectId])
      else {
        // Otherwise look it up in the db:
        return db.getStatement('resource', subjectId, 'nypl:bnum')
          .then((result) => {
            if (result) return result.object_id.replace('urn:bnum:', '')
            else {
              log.warn(`Skipping bib reindex for item ${subjectId}, could not locate`)
              return null
            }
          })
      }
    })

    return Promise.all(bibIdsToReindex)
      .then((ids) => {
        // Remove null entries (bibId could not be found)
        return ids.filter((id) => id)
      })
  }

  /**
   * This method takes a batch of inserted item statements and 1) identifies
   * all parent bibIds (even if bibIds not present in those statements), and
   * 2) posts them to the configured "IndexDocumentQueue-*" stream (which
   * triggers reindexing by the discovery-api-indexer)
   */
  _writeToIndexDocumentQueue (batch) {
    const streamName = process.env.INDEX_DOCUMENT_STREAM_NAME
    const schemaName = process.env.INDEX_DOCUMENT_SCHEMA_NAME
    // Make sure stream-writing is configured
    if (streamName && schemaName) {
      this._getBibIdsForItemStatements(batch)
        .then((bibIds) => {
          const kinesisRecords = bibIds.map((bibId) => {
            return { type: 'record', uri: bibId }
          })
          return this._writeToStreamsClient(streamName, kinesisRecords, schemaName)
            .then(() => log.debug(`Wrote ${kinesisRecords.length} to ${streamName} (encoded against ${schemaName})`))
        })
    } else return Promise.resolve(batch)
  }

  validForSerialization (item) {
    var valid = true

    valid = valid && item.id

    return valid
  }

  uriFromApi (uri) {
    const { nyplSource, id } = NyplSourceMapper.instance().splitIdentifier(uri)

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
        if (!item) return Promise.reject(new Error())

        log.debug('Item: ', JSON.stringify(item, null, 2))
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
        else return Promise.reject(new Error())
      })
      .catch((e) => {
        log.error(`ItemsUpdater#itemByApi: Error fetching item from api ${id}:`)
        return Promise.reject(new Error())
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
        start,
        end
      })
      runner.run()
    }

    var itemsSource = SourceLoader.load(opts.itemsSource)

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
