'use strict'

var config = require('config')
var MongoClient = require('mongodb').MongoClient

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
  // console.log('getting shadowcat bib: ', bib.uri)
  return shadowcatBib(bib.uri).then((shadowcatBib) => {
    if (!shadowcatBib) return bib

    console.log('got shadowcat bib: ', shadowcatBib)
    ; [
        { from: 'classify:owi', to: 'nypl:workId' },
        { from: 'classify:oclc', to: 'dcterms:identifier' }
    ].forEach((pred) => {
      var uris = shadowcatBib[pred.from]
      if (typeof uris !== 'object') uris = [uris]

      if (!bib[pred.to]) bib[pred.to] = []
      bib[pred.to] = bib[pred.to].concat(uris.map((uri) => {
        // TODO this is a mess. Not sure how to prefix these values
        var scheme = pred.from.split(':')[1]
        uri = `urn:${scheme}:${uri}`
        return {
          objectUri: uri,
          provo: [{
            creator: 'SC',
            created: new Date()
          }]
        }
      }))
    })
    return bib
  })
}

module.exports = { remediate }
