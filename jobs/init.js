/**
 * Initialize database, get stats
 *
 * Usage:
 *  node jobs/init COMMAND [OPTS...]
 *
 * @param {string} command is one of following
 *  - check: Check config (by printing to stdout)
 *  - create: Create tables
 *  - stats: Run aggregations
 *
 * @example
 * // Prints out decrypted config:
 * node jobs/init check --envfile ./deploy.production.env
 *
 * @example
 * // Creates necessary tables (if they don't exist)
 * node jobs/init create --envfile ./deploy.production.env
 *
 * @example
 * // Removes all tables and then re-creates them
 * node jobs/init create --recreate --envfile ./deploy.production.env
 */

const log = require('loglevel')
const prompt = require('prompt')

/**
 * Print message and exit
 */
function exitWithError (message) {
  console.error('Aborting because: ' + message)
  process.exit()
}

/**
 * Create db tables
 */
var create = (recreate) => {
  db.createDb(recreate)
    .then(db.initializeData)
    .then(() => {
      log.info('Finished confirming necessary db tables are created')
      process.exit()
    })
}

/**
 * Prompts user before dropping and recreating db tables
 */
var promptForRecreate = () => {
  prompt.start()

  console.log('Really recreate db? confirm with y/n')
  prompt.get(['confirm'], (err, res) => {
    if (err) throw err

    if (res.confirm.toLowerCase() === 'y') create(true)
    else process.exit()
  })
}

/**
 * Print db stats to stdout
 */
var stats = () => {
  db.getStats().then((stats) => {
    log.info('Stats: ')
    log.info('Distinct subjects: ')
    stats.forEach((stat) => {
      log.info(stat.type + ': ' + stat.count)
    })
  })
    .catch((e) => console.error('oh no: ' + e.message, e.stack))
}

// These are the valid commands:
const COMMANDS = ['create', 'stats', 'check']

const argv = require('optimist')
  .describe('loglevel', 'Specify log level (default error)')
  .describe('recreate', 'Rebuild db even if it exists')
  .describe('envfile', 'Specify ENV variable file (with encrypted credentials)')
  .argv

// Command to run is first arg given
const command = argv._[0]

// Validate command
if (!argv._ || argv._.length === 0) exitWithError('No command given.')
if (COMMANDS.indexOf(command) < 0) exitWithError('Invalid command.')

// Require an envfile:
if (!argv.envfile) exitWithError('Must specify --envfile FILE')

// Load up AWS creds:
require('../lib/local-env-helper')

const kmsHelper = require('../lib/kms-helper')
const db = require('../lib/db')

log.setLevel(argv.loglevel || process.env.LOGLEVEL || 'info')

// Decrypt db creds before doing anything
kmsHelper.decryptDbCreds().then((decryptedDbConnectionString) => {
  db.setConnectionString(decryptedDbConnectionString)

  switch (command) {
    case 'check':
      console.log('DB creds: ' + decryptedDbConnectionString)
      break
    case 'create':
      if (argv.recreate) promptForRecreate()
      else create(false)
      break
    case 'stats':
      stats()
      break
  }
})
