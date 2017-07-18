/* global before */

const kmsHelper = require('./../lib/kms-helper')
const db = require('./../lib/db')

// Ensure necessary env variables loaded
require('dotenv').config({ path: './deploy.env' })
require('dotenv').config({ path: './.env' })

// Initialize db connection:
before(() => {
  return kmsHelper.decryptDbCreds()
    .then((connectionUri) => db.setConnectionString(connectionUri))
})
