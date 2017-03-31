const lambdaTester = require('lambda-tester')
const expect = require('chai').expect
const handler = require('../index.js').handler
const event = require('../event.json')

describe('AWS Handler Test', () => {
  describe('Lambda failures', () => {
    it('should fail when no event is passed', () => {
      return lambdaTester(handler)
        .event({})
        .expectError((error) => expect(error.message).to.equal('No event was received.'))
    })

    it('should fail when no KMS RDS key is passed', () => {
      process.env['DISCOVERY_STORE_CONNECTION_URI'] = ''
      return lambdaTester(handler)
        .event(event)
        .expectResult()
        .then()
        // This is a codebase error that is being thrown and it won't be catched
        // by the Lambda's callback function
        .catch((error) => {
          expect(error.message)
            .to.equal('Missing DISCOVERY_STORE_CONNECTION_URI env variable; aborting.')
        })
    }).timeout(5000)
  })

  describe('Testing real events', () => {
    before(() => {
      require('dotenv').config({ path: './deploy.env' })
    })

    it('should successfully run, connect to db, and push to kinesis', () => {
      return lambdaTester(handler)
        .event(event)
        .expectResult((result) => {
          expect(result).to.equal('Done!')
        })
    }).timeout(5000)
  })
})
