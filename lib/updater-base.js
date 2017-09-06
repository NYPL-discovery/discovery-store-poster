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
            log.info('Finished writing to stream. Records - ' + response.Records.length)
            return Promise.resolve(response)
          })
          .catch((error) => {
            log.error('Error occurred while posting to kinesis')
            return Promise.reject(error)
          })
  }
}

module.exports = UpdaterBase
