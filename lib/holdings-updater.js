'use strict'

const H = require('highland')
let log = require('loglevel')
const cluster = require('cluster')
const UpdaterBase = require('./updater-base')

const HoldingSierraRecord = require('./models/holding-sierra-record')
const db = require('./db')
const utils = require('./utils')
const IndexerRunner = require('./indexer-runner')
const SourceLoader = require('./sources/loader')
const holdingSerializer = require('./serializers/holding')
const nyplApi = require('./nyplDataApi')
const kmsHelper = require('./kms-helper')

const CACHE_TO_DISK = false

class HoldingsUpdater extends UpdaterBase {
  deserialize (buffered, avro) {
    let holding

    try {
      holding = avro.fromBuffer(buffered.value, 'Holding', buffered.offset)
      log.info(`HoldingUpdater#deserialized ${buffered.offset}: ${holding.id}`)
    } catch (e) {
      log.error('__________ERROR__ Error decoding value: ', e)
    }

    return holding
  }

  saveToDisc (holding) {
    const path = `./cache/holdings/${holding.id}.json`
    if (CACHE_TO_DISK) return utils.writeFile(path, JSON.stringify(holding, null, 2)).then(() => holding)
    else return Promise.resolve(holding)
  }

  skip (holding) {
    console.warn('Skipping holding', holding.id)
  }

  update (options, holdings) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        debug: () => {}
      }
    }

    log.info(`HoldingsUpdater#update: Processing ${holdings.length} holdings: ${holdings.map((holding) => holding.id).join(', ')}`)
    var stream = H(holdings)
      .map((holding) => HoldingSierraRecord.from(holding))

    return this._processHoldingStream(stream, options)
  }

  statementsForHolding (holding) {
    return holdingSerializer.fromMarcJson(holding)
  }

  extractStatements (holding) {
    return this.statementsForHolding(holding)
      .catch((e) => {
        console.log('error extracting stmts: ', e)
        console.trace(e)
        return this.saveToDisc(holding).then((r) => {
          console.log('Saved problematic holding to disk: ', r.path)
          console.log(`  Run with --uri_cache h${holding.id} to test again`)
        })
      })
  }

  handleError (e, message) {
    log.error(`HoldingsUpdater# Error ("${message}"): `, e)
    console.trace(e)
    return e
  }

  _processHoldingStream (stream, options) {
    options = options || {}

    var totalProcessed = 0
    return new Promise((resolve, reject) => {
      stream
        .map((h) => {
          log.debug('Processing holding: ', JSON.stringify(h, null, 2))
          return h
        })
        .map((holding) => this.extractStatements(holding).then((statements) => ({ statements, holding })))
        .flatMap((r) => H(r))
        // Ensure serializer extracted some statements:
        .filter((s) => s.statements && s.statements.length > 0)
        .map((stmts) => {
          log.debug(`Got ${stmts.statements ? stmts.statements.length : 'null'} statements for ${stmts.holding.id}`)
          log.debug(`  ${stmts.statements ? stmts.statements.map((s) => `  ${s.predicate}: ${s.object_id || s.object_literal} (${s.object_label})`).join('\n  ') : ''}`)
          return stmts
        })
        .reduce([], (memo, batch) => memo.concat(batch.statements)) // Flatten array
        .map((statements) => db.upsertStatements('resource', statements).then(() => statements)) // Save statements
        .flatMap((r) => H(r))
        .map((statements) => db.deleteStaleStatements('resource', statements, 'holding').then(() => statements)) // Delete extra (previously serialized) statements
        .flatMap((r) => H(r))
        .map((statements) => {
          // Report on success
          // Get distinct subject_ids:
          const num = utils.distinctSubjectIds(statements).length

          if (options.onUpdate) options.onUpdate(num)
          totalProcessed += num
          log.info(`HoldingsUpdater#update: Saved batch of ${num} (${statements.length} statements): (${totalProcessed} total processed, index ${totalProcessed + options.offset})`)
          return statements
        })
        .map((batch) => this._writeToIndexDocumentQueue(batch)) // Write to IndexDocumentQueue stream
        .flatMap((r) => H(r))
        .stopOnError((e) => reject(this.handleError(e, '...')))
        .done(function (err) {
          if (err) log.error(err)
          log.info(`HoldingsUpdater#update: Done updating ${totalProcessed} resources (from ${options.offset || 0}, limit ${options.limit || '[unbounded]'})`)
          if (options.onDone) options.onDone()

          db.disconnect()

          resolve(totalProcessed)
        })
    })
  }

  /**
   * This method takes an array of holding statements (presumably bound for the
   * database) and extracts all of the bibIds. If the bibId can not be
   * determined for any holding (i.e. when processing holding deletion), the bibId
   * will be looked up in the database.
   *
   * Returns a Promise that resolves all bibIds.
   */
  _getBibIdsForHoldingStatements (statements) {
    // Build hash mapping subject_ids to bibId or null:
    const subjectIdsToBibIds = statements.reduce((hash, statement) => {
      if (statement.predicate === 'nypl:bnum') hash[statement.subject_id] = statement.object_id.replace('urn:bnum:', '')
      else if (!Object.keys(hash).includes(statement.subject_id)) hash[statement.subject_id] = null
    })

    // Since some of those bibIds will be null (holding deletion), map our bibIds
    // to an array of Promises that fill in missing bibIds via db lookup:
    let bibIdsToReindex = Object.keys(subjectIdsToBibIds).map((subjectId) => {
      // If bibId is set, resolve it immediately:
      if (subjectIdsToBibIds[subjectId]) return Promise.resolve(subjectIdsToBibIds[subjectId])
      else {
        // Otherwise look it up in the db:
        return db.getStatement('resource', subjectId, 'nypl:bnum')
          .then((result) => result.object_id.replace('urn:bnum:', ''))
      }
    })

    return Promise.all(bibIdsToReindex)
  }

  /**
   * This method takes a batch of inserted holding statements and 1) identifies
   * all parent bibIds (even if bibIds not present in those statements), and
   * 2) posts them to the configured "IndexDocumentQueue-*" stream (which
   * triggers reindexing by the discovery-api-indexer)
   */
  _writeToIndexDocumentQueue (batch) {
    let streamName = process.env.INDEX_DOCUMENT_STREAM_NAME
    let schemaName = process.env.INDEX_DOCUMENT_SCHEMA_NAME
    // Make sure stream-writing is configured
    if (streamName && schemaName) {
      this._getBibIdsForHoldingStatements(batch)
        .then((bibIds) => {
          let kinesisRecords = bibIds.map((bibId) => {
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

  uriFromApi (id) {
    return this.holdingByApi(id)
      .catch((e) => {
        log.info(`HoldingUpdater#uriFromApi: Failed to find in api: ${id}`)
        // Fallback on cache:
        return utils.readJson(`./cache/holdings/${id}.json`)
          .then((holding) => {
            log.info(`HoldingUpdater#uriFromApi: Actually, found it cached: ${holding.id}`)
            return holding
          })
          .catch((e) => log.error('Could not find item by cache'))
      })
      .then((holding) => {
        if (!holding) return Promise.reject()

        log.debug('Holding: ', JSON.stringify(holding, null, 2))
        return holding
      })
      .then(HoldingSierraRecord.from)
      .then((holding) => {
        log.info(`HoldingUpdater#uriFromApi: Processing single-holding stream: [${holding.id}]`)
        return this._processHoldingStream(
          H([holding])
        )
      })
      .catch((e) => log.error('Error: ', e))
  }

  holdingByApi (id) {
    log.info('HoldingUpdater#itemByApi: Fetch item by id: ', id)
    return nyplApi.holding(id)
      .then((holding) => {
        if (holding) return holding
        else return Promise.reject()
      })
      .catch((e) => {
        log.error(`HoldingUpdater#itemByApi: Error fetching item from api ${id}:`)
        return Promise.reject()
      })
  }
}

module.exports = HoldingsUpdater
