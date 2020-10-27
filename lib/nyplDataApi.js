'use strict'

const NyplClient = require('@nypl/nypl-data-api-client')

var apiClient = null

const client = () => {
  if (!process.env.NYPL_API_BASE_URL) throw new Error('NYPL_API_BASE_URL must be set')

  if (!apiClient) {
    apiClient = new NyplClient({
      base_url: process.env.NYPL_API_BASE_URL,
      oauth_key: process.env.NYPL_OAUTH_KEY,
      oauth_secret: process.env.NYPL_OAUTH_SECRET,
      oauth_url: process.env.NYPL_OAUTH_URL
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

const holding = (id) => {
  return client().get(`holdings/${id}`)[0]
}

module.exports = { bib, item, holding }
