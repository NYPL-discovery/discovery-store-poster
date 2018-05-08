const NyplStreamsClient = require('@nypl/nypl-streams-client')
var log = require('loglevel')

class UpdaterBase {
  constructor () {
    this.streamsClient = new NyplStreamsClient({ nyplDataApiClientBase: process.env['NYPL_API_BASE_URL'], logLevel: 'error' })
  }

// this function should resolve until FailedRecordCount is zero
  _writeToStreamsClient (streamName, records, schemaName) {
    return this.streamsClient.write(streamName, records, { avroSchemaName: schemaName })
          .then((response) => {
            // FIXME This is a temporary hack to reset the log-level on loglevel back
            // to the environment specified LOGLEVEL to overcome a bug in the current
            // streaming client (the bug is actually in the deprecated version of
            // data-api-client it includes). Fix for streamin-client is here:
            // https://github.com/NYPL-discovery/node-nypl-streams-client/pull/4
            // In the meatime, this should paper over the problem:
            log.setLevel(process.env['LOGLEVEL'] || 'info')
            return response
          })
          .then((response) => {
            if (response.FailedRecordCount > 0) {
              var responseRecords = response.Records
              var failedRecords = []
              for (var i = 0; i < responseRecords.length; i++) {
                if (responseRecords[i].ErrorCode) {
                  failedRecords.push(records[i])
                }
              }
              return this._writeToStreamsClient(streamName, failedRecords, schemaName)
            }
            log.info(`UpdaterBase: Finished writing ${response.Records.length} record(s) to ${streamName}`)
            return Promise.resolve(response)
          })
          .catch((error) => {
            log.error('Error occurred while posting to kinesis')
            return Promise.reject(error)
          })
  }
}

module.exports = UpdaterBase
