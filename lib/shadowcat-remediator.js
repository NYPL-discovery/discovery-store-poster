'use strict'

var config = require('config')
var MongoClient = require('mongodb').MongoClient

const log = require('loglevel')

var __connection = null
function connect () {
  // returns a promise:
  if (__connection) {
    return Promise.resolve(__connection)
  } else {
    return MongoClient.connect(config.get('shadowcat.url')).then((connection) => {
      __connection = connection
      return __connection
    })
  }
}

function shadowcatBib (id) {
  return connect().then((connection) => {
    return connection.collection('bib').findOne({ _id: parseInt(id) })
  })
}

function remediate (bib) {
  log.debug('ShadowcatRemediator#remediate: getting shadowcat bib: ', bib.uri)

  // Only care about sierra bibs:
  var prefix = bib.uri.match(/^[a-z]+/)[0]
  if (prefix !== 'b') return Promise.resolve(bib)

  var id = parseInt(bib.uri.replace(prefix, ''))
  return shadowcatBib(id).then((shadowcatBib) => {
    if (!shadowcatBib) return bib

    // TODO this is an absolute mess
    // For one, hathi:vols is an object with mult structured values, which we're just shoving in a literal
    log.trace('ShadowcatRemediator#remediate: got shadowcat bib: ', JSON.stringify(shadowcatBib, null, 2))

    ; [
        { from: 'classify:owi', to: 'nypl:workId' },
        { from: 'classify:oclc', to: 'dcterms:identifier' },
        { from: 'classify:lcc', to: 'dcterms:identifier' },
        { from: 'sc:lccCoarse', to: 'dcterms:identifier' },
        { from: 'hathi:id', to: 'dcterms:identifier', schema: 'hathi' },
        { from: 'hathi:vols', to: 'hathi:vols', schema: 'hathi', literal: true },
        { from: 'hathi:access', to: 'hathi:access', schema: 'hathi', literal: true }
    ].forEach((pred) => {
      var uris = shadowcatBib[pred.from]
      if (!shadowcatBib[pred.from]) return
      if (typeof uris !== 'object') uris = [uris]

      if (!bib[pred.to]) bib[pred.to] = []
      bib[pred.to] = bib[pred.to].concat(uris.map((val) => {
        // TODO this is a mess. Not sure how to prefix these values
        var scheme = pred.schema || pred.from.split(':')[1]
        log.debug('  ShadowcatRemediator#remediate: applying ', scheme, val)

        var ret = {
          provo: [{
            creator: 'SC',
            source: 'RI',
            recordIdentifier: bib.uri,
            created: new Date()
          }]
        }
        if (pred.literal) {
          ret.objectLiteral = val
        } else {
          ret.objectUri = `urn:${scheme}:${val}`
        }
        return ret
      }))
    })
    return bib
  })
}

module.exports = { remediate }
