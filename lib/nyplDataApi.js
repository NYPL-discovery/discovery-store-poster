'use strict'

const NyplClient = require('@nypl/nypl-data-api-client')
const config = require('config')

var apiClient = null

const client = () => {
  if (!process.env.NYPL_API_BASE_URL) throw new Error('NYPL_API_BASE_URL must be set')

  if (!apiClient) {
    apiClient = new NyplClient({
      base_url: process.env.NYPL_API_BASE_URL,
      oauth_key: config.get('nyplOauth').key,
      oauth_secret: config.get('nyplOauth').secret,
      oauth_url: config.get('nyplOauth').url
    })
  }
  return apiClient
}

const item = (source, id) => {
  return client().get(`items/${source}/${id}`)
}

const bib = (source, id) => {
  return client().get(`bibs/${source}/${id}`)
}

module.exports = { bib, item }

