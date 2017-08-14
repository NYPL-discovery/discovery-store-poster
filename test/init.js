/* global before */

if (!process.env.ENVFILE) {
  console.log('Missing ENVFILE env variable. E.g. `ENVFILE=deploy.production.env npm test`')
  process.exit()
}

// Ensure necessary env variables loaded
require('dotenv').config({ path: process.env.ENVFILE })
require('dotenv').config({ path: '.env' })

const kmsHelper = require('./../lib/kms-helper')
const db = require('./../lib/db')

// Initialize db connection:
before(() => {
  return kmsHelper.decryptDbCreds()
    .then((connectionUri) => db.setConnectionString(connectionUri))
})
