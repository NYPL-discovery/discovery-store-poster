'use strict'

const _ = require('highland')
const readCsv = require('./utils').readCsv
const PcdmOrganizationSerializer = require('./pcdm-serializer').PcdmOrganizationSerializer
const db = require('./db')

class OrganizationsUpdater {

  serialize (org) {
    return PcdmOrganizationSerializer.serialize(org)
  }

  update (offset, limit) {
    readCsv('./data/orgunits.csv').then((rows) => {
      var stream = _(rows)
        .drop(1) // Skip header
        .map((row) => {
          return {
            code: row[0],
            id: row[1],
            type: row[2],
            label: row[3],
            altLabel: row[4],
            unitOf: row[5].replace('http://data.nypl.org/orgs/', 'orgs:')
          }
        })
        .filter((org) => {
          return org.label !== ''
        })
        .map((org) => this.serialize(org))
        .flatMap((promise) => _(promise)) // resolve promises, per https://github.com/caolan/highland/issues/290
        .stopOnError((e) => {
          console.log('Error with: ', e)
          process.exit()
        })

      // Apply limit, if given
      if (offset && limit) stream = stream.slice(offset, offset + limit)
      else if (limit) stream = stream.take(limit)

      stream = stream
        .batchWithTimeOrCount(100, 100)
        .map((records) => {
          console.log('save records: ', JSON.stringify(records, null, 2))
          return db.organizations.upsertMany(records, { checkForExisting: true })
        })
        .flatMap((promise) => _(promise)) // resolve promises, per https://github.com/caolan/highland/issues/290
        .done(function (err) {
          if (err) console.log(err)
          console.log(`Done updating organizations (${offset}, ${limit})`)
          process.exit()
        })
    })
  }
}

module.exports = OrganizationsUpdater
