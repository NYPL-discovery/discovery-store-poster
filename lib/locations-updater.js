'use strict'

const _ = require('highland')
const readCsv = require('./utils').readCsv
const PcdmLocationSerializer = require('./pcdm-serializer').PcdmLocationSerializer
const db = require('./db')

class LocationsUpdater {

  processLocation (location) {
    return PcdmLocationSerializer.serialize(location)
  }

  update (offset, limit) {
    readCsv('./data/sierra-codes-locations.csv').then((rows) => {
      var stream = _(rows)
        .drop(1) // Skip header
        .map((row) => {
          return {
            id: row[0],
            code: row[0],
            label: row[1],
            location_type: row[2].toLowerCase(),
            actual_location: row[3]
          }
        })
        .filter((location) => {
          return location.label !== ''
        })
        .map((location) => this.processLocation(location))
        .flatMap((promise) => _(promise)) // resolve promises, per https://github.com/caolan/highland/issues/290
        .stopOnError((e) => {
          console.log('Error with: ', e)
          process.exit()
        })

      // Apply limit, if given
      if (offset && limit) stream = stream.slice(offset, offset + limit)
      else if (limit) stream = stream.take(limit)

      stream.batch(100)
        .throttle(500)
        .map((records) => {
          console.log('save records: ', JSON.stringify(records, null, 2))
          return db.locations.upsertMany(records, { checkForExisting: true })
        })
        .done(function (err) {
          if (err) console.log(err)
          console.log(`Done updating locations (${offset}, ${limit})`)
          process.exit()
        })
    })
  }
}

module.exports = LocationsUpdater
