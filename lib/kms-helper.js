const log = require('loglevel')

function decrypt (encrypted) {
  return new Promise((resolve, reject) => {
    // If this is instantiated outside this scope (e.g. line 1 of this file),
    // it may be instantiated before AWS_* env vars are set correctly, causing
    // it to attempt to decrypt the value against the wrong account
    const AWS = require('aws-sdk')

    const kms = new AWS.KMS()

    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) return reject(err)

      var decrypted = data.Plaintext.toString('ascii')
      log.debug('Successully decrypted value')
      resolve(decrypted)
    })
  })
}

function decryptDbCreds () {
  if (!process.env['DISCOVERY_STORE_CONNECTION_URI']) throw new Error('Missing DISCOVERY_STORE_CONNECTION_URI env variable; aborting.')

  var encrypted = process.env['DISCOVERY_STORE_CONNECTION_URI']
  return decrypt(encrypted)
}

module.exports = { decryptDbCreds }
