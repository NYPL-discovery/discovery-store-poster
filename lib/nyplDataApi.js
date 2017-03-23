'use strict'

var rp = require('request-promise')
const request = require('request')
var config = require('config')
const log = require('loglevel')

const SierraRecord = require('./models').SierraRecord

// var access_token = null

const OAuth = require('oauth')
var token = () => {
  var OAuth2 = OAuth.OAuth2

  var key = config.get('nyplOauth').key
  var secret = config.get('nyplOauth').secret

  var oauth2 = new OAuth2(key, secret, config.get('nyplOauth').url, null, 'oauth/token', null)

  return new Promise((resolve, reject) => {
    oauth2.getOAuthAccessToken('', { grant_type: 'client_credentials' }, (e, access_token, refresh_token, results) => {
      resolve(access_token)
    })
  })
}

var post = (path, body) => {
  return token().then((token) => {
    var headers = { Authorization: `Bearer ${token}` }
    var uri = `${config.get('nyplDataApi').base_url}/${path}`
    var options = { method: 'POST', headers, uri, body }

    return request(options, (err, response, body) => {
      if (err) console.log('Error (nyplDataApi#post): ' + err.message)
      else console.log('Successfully updated.')
    })
  })
}

var query = (path) => {
  var uri = `${config.get('nyplDataApi').base_url}/${path}`
  return token().then((token) => rp({ uri, headers: { Authorization: `Bearer ${token}` }, json: true }))
}

var item = (source, id) => {
  log.debug('Fetching ', source, id)
  return query(`items/${source}/${id}`).then((resp) => {
    log.debug('Got', JSON.stringify(resp, null, 2))
    if (!resp || !resp.data) return Promise.reject(`NyplDataApi#item: Could not find items/${source}/${id}`)

    return SierraRecord.from(resp.data)
  })
}
var bib = (source, id) => {
  log.debug('Fetching ', source, id)
  return query(`bibs/${source}/${id}`).then((resp) => {
    log.debug('Got', JSON.stringify(resp, null, 2))
    if (!resp || !resp.data) return Promise.reject(`NyplDataApi#bib: Could not find bibs/${source}/${id}`)

    return SierraRecord.from(resp.data)
  })
}

var bibs = () => {
  return query('bibs').then((resp) => {
    if (!resp || !resp.data || !resp.data.length) return Promise.reject('NyplDataApi#bibs: No bibs returned')

    return Promise.resolve(resp.data.map(SierraRecord.from))
  })
}

var itemsForBib = (source, bibId) => {
  return query(`bibs/${source}/${bibId}/items`).then((resp) => resp.data)
}

module.exports = { bib, item, itemsForBib, bibs, post }
