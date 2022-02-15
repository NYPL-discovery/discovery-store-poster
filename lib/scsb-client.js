const SCSBClient = require('@nypl/scsb-rest-client')
const kmsHelper = require('./kms-helper')

let _instance = null

const instance = async () => {
  if (!_instance) {
    // Preflight check:
    if ([
      'SCSB_URL',
      'SCSB_API_KEY'
    ].some((env) => !process.env[env])) {
      throw new Error('Config error: Missing SCSB API creds')
    }

    const decryptedUrl = await kmsHelper.decrypt(process.env.SCSB_URL)
    const decryptedKey = await kmsHelper.decrypt(process.env.SCSB_API_KEY)
    _instance = new SCSBClient({
      url: decryptedUrl,
      apiKey: decryptedKey
    })
  }

  return _instance
}

module.exports = {
  instance
}
